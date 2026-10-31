import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import {
  validateEmails,
  validatePerfis,
  validateTarefas,
  type Configuracao,
} from "./dataRepository";

export type SharedTaskCatalog = Pick<Configuracao, "tarefas" | "perfis" | "email"> & {
  schemaVersion: 1;
  updatedAt?: unknown;
  updatedByUid?: string;
};

const catalogRef = () => {
  const { db } = requireFirebase();
  return doc(db, "sharedTaskCatalog", "current");
};

export async function loadSharedTaskCatalog(): Promise<SharedTaskCatalog | null> {
  const snapshot = await getDoc(catalogRef());
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data.schemaVersion !== 1) {
    throw new Error("O CATÁLOGO COMPARTILHADO POSSUI UMA VERSÃO INVÁLIDA.");
  }
  return {
    schemaVersion: 1,
    tarefas: validateTarefas(data.tarefas),
    perfis: validatePerfis(data.perfis),
    email: validateEmails(data.email),
    updatedAt: data.updatedAt,
    updatedByUid: data.updatedByUid,
  };
}

/** Creates the shared catalog exactly once. Existing catalogs are never overwritten. */
export async function saveSharedTaskCatalog(config: Configuracao): Promise<void> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("É necessário autenticar-se para editar o catálogo.");
  const catalog = {
    schemaVersion: 1,
    tarefas: validateTarefas(config.tarefas),
    perfis: validatePerfis(config.perfis),
    email: validateEmails(config.email),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
  };
  const reference = doc(db, "sharedTaskCatalog", "current");
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists()) {
      throw new Error("O CATÁLOGO COMPARTILHADO JÁ FOI INICIALIZADO. NENHUM DADO FOI ALTERADO.");
    }
    transaction.set(reference, catalog);
  });
}
