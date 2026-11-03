import { collection, doc, getDoc, getDocs, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

type BackupDocument = { id: string; path: string; data: Record<string, unknown> };
type BackupPayload = {
  format: "controle-diario-admin-backup";
  schemaVersion: 1;
  createdAt: string;
  projectId: string;
  createdBy: { uid: string; email: string };
  scope: string[];
  collections: Record<string, BackupDocument[]>;
};

const ROOT_COLLECTIONS = [
  "accessRequests", "adminAudit", "organizationContacts", "organizationSectors",
  "Expediente", "settings", "sharedPromotions", "sharedTaskCatalog",
] as const;

// Firestore Web SDK não lista subcoleções dinamicamente. Manter esta relação
// sincronizada com os caminhos efetivamente utilizados pela aplicação.
const USER_DOCUMENTS = [
  "configuration/tarefas", "configuration/perfis", "configuration/email", "configuration/layout",
  "preferences/appearance", "preferences/workSchedule", "calendar/dados", "operational/currentState",
] as const;
const USER_COLLECTIONS = [
  "taskCustomizations", "usefulLinks", "operational/history/entries",
] as const;

function normalize(value: unknown): unknown {
  if (value instanceof Timestamp) return { __type: "firestore-timestamp", iso: value.toDate().toISOString() };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}
function toBackupDocument(item: QueryDocumentSnapshot<DocumentData>): BackupDocument {
  return { id: item.id, path: item.ref.path, data: normalize(item.data()) as Record<string, unknown> };
}
async function readCollection(path: string): Promise<BackupDocument[]> {
  const { db } = requireFirebase();
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(toBackupDocument);
}
async function readUserData(uid: string): Promise<BackupDocument[]> {
  const { db } = requireFirebase();
  const result: BackupDocument[] = [];
  for (const relativePath of USER_DOCUMENTS) {
    const reference = doc(db, "users", uid, ...relativePath.split("/"));
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) result.push({
      id: snapshot.id, path: snapshot.ref.path,
      data: normalize(snapshot.data()) as Record<string, unknown>,
    });
  }
  for (const relativePath of USER_COLLECTIONS) {
    result.push(...await readCollection(`users/${uid}/${relativePath}`));
  }
  return result;
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
}
async function encryptBackup(payload: BackupPayload, password: string) {
  const plainText = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", plainText);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainText);
  return {
    format: "controle-diario-encrypted-backup", schemaVersion: 1,
    algorithm: "AES-256-GCM", keyDerivation: "PBKDF2-SHA256", iterations: 310000,
    salt: toBase64(salt), iv: toBase64(iv),
    integrity: { algorithm: "SHA-256", digest: toBase64(new Uint8Array(digest)) },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function exportAdministrativeBackup(password: string): Promise<{ fileName: string; documentCount: number; userCount: number }> {
  const { auth, db, app } = requireFirebase();
  const actor = auth.currentUser;
  if (!actor || !actor.emailVerified) throw new Error("É necessário entrar com uma conta empresarial verificada.");
  if (password.length < 12) throw new Error("Use uma senha com pelo menos 12 caracteres.");
  if (!globalThis.crypto?.subtle) throw new Error("Este navegador não oferece criptografia segura. Acesse o site por HTTPS em um navegador atualizado.");

  const actorSnapshot = await getDoc(doc(db, "users", actor.uid));
  const actorProfile = actorSnapshot.exists() ? actorSnapshot.data() : null;
  if (actorProfile?.status !== "approved" || actorProfile.role !== "admin") {
    throw new Error("A exportação integral é exclusiva de administradores aprovados.");
  }

  const users = await readCollection("users");
  const userData = await Promise.all(users.map((user) => readUserData(user.id)));
  const collections: Record<string, BackupDocument[]> = {
    users,
    "users/*/private-data": userData.flat(),
  };
  const rootData = await Promise.all(ROOT_COLLECTIONS.map(async (name) => [name, await readCollection(name)] as const));
  for (const [name, records] of rootData) collections[name] = records;

  const payload: BackupPayload = {
    format: "controle-diario-admin-backup",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    projectId: app.options.projectId ?? "desconhecido",
    createdBy: { uid: actor.uid, email: actor.email ?? "" },
    scope: [
      "Coleções institucionais listadas no arquivo",
      "Documentos e subcoleções privadas atualmente conhecidos de todos os usuários",
      "Expedientes em andamento e históricos individuais",
    ],
    collections,
  };
  const encrypted = await encryptBackup(payload, password);
  const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const fileName = `controle-diario-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);

  return {
    fileName,
    documentCount: Object.values(collections).reduce((total, records) => total + records.length, 0),
    userCount: users.length,
  };
}
