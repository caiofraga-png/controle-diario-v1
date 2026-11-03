import { collection, doc, getDoc, getDocs, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

type BackupDocument = { id: string; path: string; data: Record<string, unknown> };
export type BackupPayload = {
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


type EncryptedBackupEnvelope = {
  format: "controle-diario-encrypted-backup";
  schemaVersion: 1;
  algorithm: "AES-256-GCM";
  keyDerivation: "PBKDF2-SHA256";
  iterations: 310000;
  salt: string;
  iv: string;
  integrity: { algorithm: "SHA-256"; digest: string };
  ciphertext: string;
};
export type BackupInspection = {
  createdAt: string;
  createdBy: string;
  projectId: string;
  userCount: number;
  documentCount: number;
  missingCount: number;
  existingCount: number;
  collections: Array<{ name: string; count: number }>;
  conflicts: string[];
  payload: BackupPayload;
};

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function allowedBackupPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  const root = parts[0];
  if (root === "users") {
    if (parts.length === 2) return true;
    if (parts.length < 4) return false;
    const relative = parts.slice(2).join("/");
    return USER_DOCUMENTS.includes(relative as typeof USER_DOCUMENTS[number])
      || USER_COLLECTIONS.some((prefix) => relative.startsWith(prefix + "/"));
  }
  if (parts.length !== 2) return false;
  return ROOT_COLLECTIONS.includes(root as typeof ROOT_COLLECTIONS[number]);
}
async function decryptEnvelope(envelope: EncryptedBackupEnvelope, password: string): Promise<Uint8Array> {
  if (envelope.format !== "controle-diario-encrypted-backup" || envelope.schemaVersion !== 1
    || envelope.algorithm !== "AES-256-GCM" || envelope.keyDerivation !== "PBKDF2-SHA256"
    || envelope.iterations !== 310000 || envelope.integrity?.algorithm !== "SHA-256") {
    throw new Error("Formato, versão ou algoritmo do backup não reconhecido.");
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("O arquivo de backup possui estrutura criptográfica inválida.");
  }
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("Não foi possível abrir o backup. Verifique a senha e se o arquivo está íntegro.");
  }
  const digest = await crypto.subtle.digest("SHA-256", plaintext);
  const expected = fromBase64(envelope.integrity.digest);
  const actual = new Uint8Array(digest);
  if (expected.length !== actual.length || actual.some((byte, index) => byte !== expected[index])) {
    throw new Error("A verificação de integridade do backup falhou.");
  }
  return new Uint8Array(plaintext);
}

export async function inspectAdministrativeBackup(file: File, password: string): Promise<BackupInspection> {
  const { auth, db, app } = requireFirebase();
  const actor = auth.currentUser;
  if (!actor || !actor.emailVerified) throw new Error("Entre com uma conta empresarial verificada.");
  const actorSnapshot = await getDoc(doc(db, "users", actor.uid));
  const actorProfile = actorSnapshot.exists() ? actorSnapshot.data() : null;
  if (actorProfile?.status !== "approved" || actorProfile.role !== "admin") {
    throw new Error("A restauração é exclusiva de administradores aprovados.");
  }
  if (!password) throw new Error("Informe a senha usada na criação do backup.");
  if (file.size <= 0 || file.size > 100 * 1024 * 1024) throw new Error("O arquivo deve ter até 100 MB.");
  if (!globalThis.crypto?.subtle) throw new Error("Este navegador não oferece criptografia segura. Acesse por HTTPS.");
  let envelope: unknown;
  try { envelope = JSON.parse(await file.text()); }
  catch { throw new Error("O arquivo selecionado não contém um JSON válido."); }
  if (!isRecord(envelope)) throw new Error("Estrutura do arquivo de backup inválida.");
  const plaintext = await decryptEnvelope(envelope as unknown as EncryptedBackupEnvelope, password);
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(plaintext)); }
  catch { throw new Error("O conteúdo descriptografado não é um backup válido."); }
  if (!isRecord(payload) || payload.format !== "controle-diario-admin-backup" || payload.schemaVersion !== 1
    || typeof payload.projectId !== "string" || typeof payload.createdAt !== "string"
    || !isRecord(payload.createdBy) || !isRecord(payload.collections)) {
    throw new Error("O conteúdo do backup não corresponde ao formato esperado.");
  }
  if (payload.projectId !== (app.options.projectId ?? "")) {
    throw new Error("Este backup pertence a outro projeto Firebase. A restauração foi bloqueada.");
  }
  const collections = payload.collections as Record<string, unknown>;
  const allDocuments: BackupDocument[] = [];
  for (const [collectionName, value] of Object.entries(collections)) {
    if (!Array.isArray(value)) throw new Error(`A coleção ${collectionName} possui estrutura inválida.`);
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.path !== "string"
        || !isRecord(entry.data) || !allowedBackupPath(entry.path)
        || entry.path.split("/").at(-1) !== entry.id) {
        throw new Error(`Documento inválido ou caminho não autorizado no backup: ${collectionName}.`);
      }
      if (collectionName === "users" && entry.path.split("/").length !== 2) {
        throw new Error("A coleção de usuários contém um caminho inesperado.");
      }
      if (collectionName === "users/*/private-data" && !entry.path.startsWith("users/")) {
        throw new Error("Foi encontrado um caminho privado fora da coleção de usuários.");
      }
      allDocuments.push(entry as unknown as BackupDocument);
    }
  }
  const uniquePaths = new Set<string>();
  for (const item of allDocuments) {
    if (uniquePaths.has(item.path)) throw new Error(`O backup contém o caminho duplicado ${item.path}.`);
    uniquePaths.add(item.path);
  }
  const checks = await Promise.all(allDocuments.map(async (item) => ({
    path: item.path, exists: (await getDoc(doc(db, item.path))).exists(),
  })));
  const conflicts = checks.filter((item) => item.exists).map((item) => item.path);
  const byCollection = Object.entries(collections).map(([name, value]) => ({ name, count: (value as unknown[]).length }));
  return {
    createdAt: payload.createdAt,
    createdBy: typeof payload.createdBy.email === "string" ? payload.createdBy.email : "Não informado",
    projectId: payload.projectId,
    userCount: (collections.users as unknown[] | undefined)?.length ?? 0,
    documentCount: allDocuments.length,
    missingCount: allDocuments.length - conflicts.length,
    existingCount: conflicts.length,
    collections: byCollection,
    conflicts: conflicts.slice(0, 50),
    payload: payload as unknown as BackupPayload,
  };
}
