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
} from "./dataRepository";

type ConfigurationKind = keyof Pick<Configuracao, "tarefas" | "perfis" | "email" | "layout">;

const CONFIG_KINDS: ConfigurationKind[] = ["tarefas", "perfis", "email", "layout"];
export type ThemePreference = "corporate-light" | "corporate-dark" | "elegant-light" | "midnight-blue" | "midnight-violet" | "blue-light" | "system";
const THEME_DOCUMENT = "appearance";

/**
 * Firebase storage for private, per-user settings. Firestore Rules enforce
 * user ownership and approval.
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

  async saveLayout(layout: Configuracao["layout"]): Promise<void> {
    const uid = this.currentUserId();
    const validated = validateLayout(layout);
    const { db } = requireFirebase();
    const layoutRef = doc(db, "users", uid, "configuration", "layout");
    await setDoc(layoutRef, { ...validated, updatedAt: serverTimestamp() });

    // Confirm the personal layout was actually persisted before reporting success.
    const savedSnapshot = await getDoc(layoutRef);
    if (!savedSnapshot.exists()) throw new Error("NÃO FOI POSSÍVEL CONFIRMAR A GRAVAÇÃO DO LAYOUT PESSOAL. TENTE NOVAMENTE.");
  }

  async loadThemePreference(): Promise<ThemePreference> {
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    const snapshot = await getDoc(doc(db, "users", uid, "preferences", THEME_DOCUMENT));
    const theme = snapshot.exists() ? snapshot.data().theme : null;
    if (theme === "light") return "corporate-light";
    if (theme === "dark") return "corporate-dark";
    return theme === "corporate-light" || theme === "corporate-dark" || theme === "elegant-light" || theme === "midnight-blue" || theme === "midnight-violet" || theme === "blue-light" || theme === "system" ? theme : "system";
  }

  async saveThemePreference(theme: ThemePreference): Promise<void> {
    if (theme !== "corporate-light" && theme !== "corporate-dark" && theme !== "elegant-light" && theme !== "midnight-blue" && theme !== "midnight-violet" && theme !== "blue-light" && theme !== "system") {
      throw new Error("PREFERÊNCIA DE APARÊNCIA INVÁLIDA.");
    }
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    await setDoc(doc(db, "users", uid, "preferences", THEME_DOCUMENT), {
      theme,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async loadAttendancePreferences(): Promise<{ canal: string; tipo: string; resolvido: string; ordemCampos: string[] }> {
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    const snapshot = await getDoc(doc(db, "users", uid, "preferences", "attendance"));
    const value = snapshot.exists() ? snapshot.data() : {};
    const padrao = ["ticket", "canal", "codigo", "nome", "tipo", "resolvido", "subtipo", "motivoResolucao"];
    const ordemSalva = Array.isArray(value.ordemCampos) ? value.ordemCampos : [];
    const ordemCampos = ordemSalva.length === padrao.length && new Set(ordemSalva).size === padrao.length && ordemSalva.every((item: unknown) => typeof item === "string" && padrao.includes(item)) ? ordemSalva : padrao;
    return {
      canal: typeof value.canal === "string" ? value.canal : "",
      tipo: value.tipo === "🛠️" ? "🛠" : typeof value.tipo === "string" ? value.tipo : "",
      resolvido: typeof value.resolvido === "string" ? value.resolvido : "",
      ordemCampos,
    };
  }

  async saveAttendancePreferences(value: { canal: string; tipo: string; resolvido: string }): Promise<void> {
    const allowed = {
      canal: ["📞 ⬅", "☎ ➜", "🔵", "📱", "💬", "🏠", "💳", "📲"],
      tipo: ["🛒", "🛠", "💰", "♻️"],
      resolvido: ["✅", "❌", "📌", "⬅ BACK", "♻️"],
    };
    if (!allowed.canal.includes(value.canal) || !allowed.tipo.includes(value.tipo) || !allowed.resolvido.includes(value.resolvido)) {
      throw new Error("PREFERÊNCIAS DE ATENDIMENTO INVÁLIDAS.");
    }
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    await setDoc(doc(db, "users", uid, "preferences", "attendance"), {
      canal: value.canal, tipo: value.tipo, resolvido: value.resolvido, updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async loadAttendanceFieldOrder(): Promise<string[]> {
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    const snapshot = await getDoc(doc(db, "users", uid, "preferences", "attendance"));
    const saved = snapshot.exists() ? snapshot.data().ordemCampos : null;
    const padrao = ["ticket", "canal", "codigo", "nome", "tipo", "resolvido", "subtipo", "motivoResolucao"];
    if (!Array.isArray(saved)) return padrao;
    const permitidos = new Set(padrao);
    const validos = saved.filter((item: unknown): item is string => typeof item === "string" && permitidos.has(item));
    return validos.length === padrao.length && new Set(validos).size === padrao.length ? validos : padrao;
  }

  async saveAttendanceFieldOrder(order: string[]): Promise<void> {
    const padrao = ["ticket", "canal", "codigo", "nome", "tipo", "resolvido", "subtipo", "motivoResolucao"];
    if (!Array.isArray(order) || order.length !== padrao.length ||
        new Set(order).size !== padrao.length || order.some(item => !padrao.includes(item))) {
      throw new Error("A ORDEM DOS CAMPOS DE ATENDIMENTO É INVÁLIDA.");
    }
    const uid = this.currentUserId();
    const { db } = requireFirebase();
    const ref = doc(db, "users", uid, "preferences", "attendance");
    await setDoc(ref, { ordemCampos: order, updatedAt: serverTimestamp() }, { merge: true });
    const saved = await getDoc(ref);
    const persisted = saved.exists() ? saved.data().ordemCampos : null;
    if (JSON.stringify(persisted) !== JSON.stringify(order)) {
      throw new Error("NÃO FOI POSSÍVEL CONFIRMAR A ORDEM DOS CAMPOS DE ATENDIMENTO.");
    }
  }

}