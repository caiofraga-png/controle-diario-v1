import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import {
  validateEmails,
  validateLayout,
  validatePerfis,
  validateTarefas,
  type Configuracao,
  type LoadedData,
} from "./dataRepository";

type ConfigurationKind = keyof Pick<Configuracao, "tarefas" | "perfis" | "email" | "layout">;

const CONFIG_KINDS: ConfigurationKind[] = ["tarefas", "perfis", "email", "layout"];
const CALENDAR_DOCUMENT = "dados";

/**
 * Firebase storage for private, per-user settings.
 *
 * This service is deliberately separate from DataRepository: the live workflow
 * still uses Drive until the operational-state/history adapter and UI auth flow
 * are integrated and tested. Firestore Rules enforce user ownership and approval.
 */
export class FirebasePersonalDataService {
  private currentUserId(): string {
    const { auth } = requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("FAÇA LOGIN COM SUA CONTA EMPRESARIAL PARA CONTINUAR.");
    if (!user.emailVerified) throw new Error("O E-MAIL DA CONTA PRECISA ESTAR VERIFICADO.");
    return user.uid;
  }

  private configurationRef(uid: string, kind: ConfigurationKind) {
    const { db } = requireFirebase();
    return doc(db, "users", uid, "configuration", kind);
  }

  async loadConfiguration(): Promise<Configuracao | null> {
    const uid = this.currentUserId();
    const documents = await Promise.all(
      CONFIG_KINDS.map((kind) => getDoc(this.configurationRef(uid, kind)))
    );
    const present = documents.map((snapshot) => snapshot.exists());
    if (present.every((exists) => !exists)) return null;
    if (present.some((exists) => !exists)) {
      throw new Error("A CONFIGURAÇÃO PESSOAL NO FIREBASE ESTÁ INCOMPLETA. SOLICITE A REVISÃO DO ADMINISTRADOR.");
    }

    const raw = Object.fromEntries(
      CONFIG_KINDS.map((kind, index) => [kind, documents[index].data()])
    ) as Record<ConfigurationKind, DocumentData>;

    return {
      tarefas: validateTarefas(raw.tarefas),
      perfis: validatePerfis(raw.perfis),
      email: validateEmails(raw.email),
      layout: validateLayout(raw.layout),
    };
  }

  async saveConfiguration(config: Configuracao): Promise<void> {
    const uid = this.currentUserId();
    const validated: Configuracao = {
      tarefas: validateTarefas(config.tarefas),
      perfis: validatePerfis(config.perfis),
      email: validateEmails(config.email),
      layout: validateLayout(config.layout),
    };

    const { db } = requireFirebase();
    const batch = writeBatch(db);
    for (const kind of CONFIG_KINDS) {
      batch.set(
        doc(db, "users", uid, "configuration", kind),
        { ...validated[kind], updatedAt: serverTimestamp() },
      );
    }
    await batch.commit();
  }

  async loadCalendar(): Promise<LoadedData["calendario"] | null> {
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    const snapshot = await getDoc(doc(db, "users", uid, "calendar", CALENDAR_DOCUMENT));
    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    if (data.schemaVersion !== 1 || !Array.isArray(data.datas)) {
      throw new Error("O CALENDÁRIO PESSOAL NO FIREBASE ESTÁ INVÁLIDO.");
    }
    for (const item of data.datas) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.data !== "string" ||
        typeof item.folga !== "boolean" ||
        typeof item.feriado !== "boolean" ||
        (!item.folga && !item.feriado)
      ) {
        throw new Error("O CALENDÁRIO PESSOAL NO FIREBASE ESTÁ INVÁLIDO.");
      }
    }
    return { schemaVersion: 1, datas: data.datas };
  }

  async saveCalendar(calendar: LoadedData["calendario"]): Promise<void> {
    if (calendar.schemaVersion !== 1 || !Array.isArray(calendar.datas)) {
      throw new Error("O CALENDÁRIO PESSOAL NO FIREBASE ESTÁ INVÁLIDO.");
    }
    for (const item of calendar.datas) {
      if (
        !item ||
        typeof item.data !== "string" ||
        typeof item.folga !== "boolean" ||
        typeof item.feriado !== "boolean" ||
        (!item.folga && !item.feriado)
      ) {
        throw new Error("O CALENDÁRIO PESSOAL NO FIREBASE ESTÁ INVÁLIDO.");
      }
    }

    const uid = this.currentUserId();
    const { db } = requireFirebase();
    await setDoc(
      doc(db, "users", uid, "calendar", CALENDAR_DOCUMENT),
      { ...calendar, updatedAt: serverTimestamp() },
    );
  }
}
