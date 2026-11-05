import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import { encryptBackupPayload, decryptBackupEnvelope, assertBackupProject, type EncryptedBackupEnvelope } from "./backupCrypto";

type BackupDocument = { id: string; path: string; data: Record<string, unknown> };
export type BackupPayload = {
  format: "controle-diario-admin-backup";
  schemaVersion: 1 | 2;
  createdAt: string;
  projectId: string;
  createdBy: { uid: string; email: string };
  scope: string[];
  collections: Record<string, BackupDocument[]>;
};

const ROOT_COLLECTIONS = [
  "accessRequests", "adminAudit", "organizationContacts", "organizationSectors",
  "Expediente", "settings", "sharedPromotions", "sharedTaskCatalog", "featurePermissions",
  "externalMaintenances", "delinquencyNotices", "sharedNotifications",
] as const;
const INSTITUTIONAL_SUBCOLLECTIONS = ["externalMaintenances/*/history"] as const;

// Firestore Web SDK não lista subcoleções dinamicamente. Manter esta relação
// sincronizada com os caminhos efetivamente utilizados pela aplicação.
const USER_DOCUMENTS = [
  "configuration/tarefas", "configuration/perfis", "configuration/email", "configuration/layout",
  "preferences/appearance", "preferences/workSchedule", "preferences/notifications", "calendar/dados", "operational/currentState",
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
  const maintenanceHistory: BackupDocument[] = [];
  for (const maintenance of collections.externalMaintenances) {
    maintenanceHistory.push(...await readCollection(`externalMaintenances/${maintenance.id}/history`));
  }
  collections["externalMaintenances/*/history"] = maintenanceHistory;

  const payload: BackupPayload = {
    format: "controle-diario-admin-backup",
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    projectId: app.options.projectId ?? "desconhecido",
    createdBy: { uid: actor.uid, email: actor.email ?? "" },
    scope: [
      "Coleções institucionais, incluindo manutenções, avisos de inadimplência e notificações compartilhadas",
      "Históricos subordinados às manutenções externas",
      "Documentos e subcoleções privadas atualmente conhecidos de todos os usuários",
      "Expedientes em andamento e históricos individuais",
    ],
    collections,
  };
  const encrypted = await encryptBackupPayload(payload, password);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function allowedBackupPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  // Firestore document paths always have an even number of segments.
  if (parts.length % 2 !== 0) return false;
  const root = parts[0];
  if (root === "users") {
    if (parts.length === 2) return true;
    const relativeDocumentPath = parts.slice(2).join("/");
    if (USER_DOCUMENTS.includes(relativeDocumentPath as typeof USER_DOCUMENTS[number])) return true;
    const relativeCollectionPath = parts.slice(2, -1).join("/");
    return USER_COLLECTIONS.includes(relativeCollectionPath as typeof USER_COLLECTIONS[number]);
  }
  if (root === "externalMaintenances" && parts.length === 4 && parts[2] === "history") return true;
  if (parts.length !== 2) return false;
  return ROOT_COLLECTIONS.includes(root as typeof ROOT_COLLECTIONS[number]);
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
  const plaintext = await decryptBackupEnvelope(envelope as unknown as EncryptedBackupEnvelope, password);
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(plaintext)); }
  catch { throw new Error("O conteúdo descriptografado não é um backup válido."); }
  if (!isRecord(payload) || payload.format !== "controle-diario-admin-backup" || ![1, 2].includes(Number(payload.schemaVersion))
    || typeof payload.projectId !== "string" || typeof payload.createdAt !== "string"
    || !isRecord(payload.createdBy) || !isRecord(payload.collections)) {
    throw new Error("O conteúdo do backup não corresponde ao formato esperado.");
  }
  assertBackupProject(payload, app.options.projectId ?? "");
  const collections = payload.collections as Record<string, unknown>;
  const legacyCollections = ["users", "users/*/private-data", "accessRequests", "adminAudit", "organizationContacts", "organizationSectors", "Expediente", "settings", "sharedPromotions", "sharedTaskCatalog", "featurePermissions"];
  const expectedCollections = payload.schemaVersion === 1 ? legacyCollections : ["users", "users/*/private-data", ...ROOT_COLLECTIONS, ...INSTITUTIONAL_SUBCOLLECTIONS];
  if (![1, 2].includes(Number(payload.schemaVersion)) || Object.keys(collections).length !== expectedCollections.length
    || expectedCollections.some((name) => !Object.prototype.hasOwnProperty.call(collections, name))) {
    throw new Error("O backup está incompleto: faltam coleções obrigatórias ou há coleções desconhecidas.");
  }
  if (!Number.isFinite(Date.parse(payload.createdAt))
    || typeof payload.createdBy.uid !== "string" || typeof payload.createdBy.email !== "string"
    || !Array.isArray(payload.scope)) {
    throw new Error("Os metadados do backup estão incompletos ou inválidos.");
  }
  const allDocuments: BackupDocument[] = [];
  for (const [collectionName, value] of Object.entries(collections)) {
    if (!Array.isArray(value)) throw new Error(`A coleção ${collectionName} possui estrutura inválida.`);
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.path !== "string"
        || !isRecord(entry.data) || !allowedBackupPath(entry.path)
        || entry.path.split("/").at(-1) !== entry.id) {
        throw new Error(`Documento inválido ou caminho não autorizado no backup: ${collectionName}.`);
      }
      const parts = entry.path.split("/");
      if (collectionName === "users" && (parts.length !== 2 || parts[0] !== "users")) {
        throw new Error("A coleção de usuários contém um caminho inesperado.");
      }
      if (collectionName === "users/*/private-data" && (parts[0] !== "users" || parts.length < 4)) {
        throw new Error("Foi encontrado um caminho privado fora da coleção de usuários.");
      }
      if (ROOT_COLLECTIONS.includes(collectionName as typeof ROOT_COLLECTIONS[number])
        && (parts.length !== 2 || parts[0] !== collectionName)) {
        throw new Error(`O documento não corresponde à coleção ${collectionName}.`);
      }
      if (collectionName === "externalMaintenances/*/history"
        && (parts.length !== 4 || parts[0] !== "externalMaintenances" || parts[2] !== "history")) {
        throw new Error("O documento não corresponde ao histórico de manutenção externa.");
      }
      if (typeof entry.data.ownerUid === "string" && parts[0] === "users" && entry.data.ownerUid !== parts[1]) {
        throw new Error(`O proprietário não corresponde ao caminho do documento ${entry.path}.`);
      }
      if (parts[0] === "Expediente" && isRecord(entry.data.assignment)
        && entry.data.assignment.uid !== entry.data.ownerUid) {
        throw new Error(`A atribuição do expediente não corresponde ao proprietário em ${entry.path}.`);
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


function reviveBackupValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveBackupValue);
  if (isRecord(value)) {
    if (value.__type === "firestore-timestamp" && typeof value.iso === "string") {
      const date = new Date(value.iso);
      if (!Number.isFinite(date.getTime())) throw new Error("O backup contém uma data inválida.");
      return Timestamp.fromDate(date);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveBackupValue(item)]));
  }
  return value;
}

export async function restoreAdministrativeBackup(
  inspection: BackupInspection,
): Promise<{ restoredCount: number; skippedCount: number }> {
  const { auth, db, app } = requireFirebase();
  const actor = auth.currentUser;
  if (!actor || !actor.emailVerified) throw new Error("Entre com uma conta empresarial verificada.");
  const actorSnapshot = await getDoc(doc(db, "users", actor.uid));
  const actorProfile = actorSnapshot.exists() ? actorSnapshot.data() : null;
  if (actorProfile?.status !== "approved" || actorProfile.role !== "admin") {
    throw new Error("A restauração é exclusiva de administradores aprovados.");
  }
  if (!inspection?.payload || inspection.projectId !== (app.options.projectId ?? "")
    || inspection.payload.projectId !== inspection.projectId
    || inspection.payload.format !== "controle-diario-admin-backup"
    || ![1, 2].includes(Number(inspection.payload.schemaVersion))) {
    throw new Error("A prévia não corresponde a um backup validado deste projeto. Faça a conferência novamente.");
  }
  const backupCollections = inspection.payload.collections;
  const legacyCollections = ["users", "users/*/private-data", "accessRequests", "adminAudit", "organizationContacts", "organizationSectors", "Expediente", "settings", "sharedPromotions", "sharedTaskCatalog", "featurePermissions"];
  const expectedCollections = inspection.payload.schemaVersion === 1 ? legacyCollections : ["users", "users/*/private-data", ...ROOT_COLLECTIONS, ...INSTITUTIONAL_SUBCOLLECTIONS];
  if (!isRecord(backupCollections)
    || Object.keys(backupCollections).length !== expectedCollections.length
    || expectedCollections.some((name) => !Object.prototype.hasOwnProperty.call(backupCollections, name))
    || !Number.isFinite(Date.parse(inspection.payload.createdAt))
    || !isRecord(inspection.payload.createdBy)
    || typeof inspection.payload.createdBy.uid !== "string"
    || typeof inspection.payload.createdBy.email !== "string"
    || !Array.isArray(inspection.payload.scope)) {
    throw new Error("O backup não passou pela validação estrutural completa. Faça a conferência novamente.");
  }
  const documents: BackupDocument[] = [];
  const paths = new Set<string>();
  for (const [collectionName, value] of Object.entries(backupCollections)) {
    if (!Array.isArray(value)) {
      throw new Error(`A coleção ${collectionName} possui estrutura inválida. Nenhum dado foi restaurado.`);
    }
    for (const candidate of value) {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.path !== "string"
        || !isRecord(candidate.data) || !allowedBackupPath(candidate.path)
        || candidate.path.split("/").at(-1) !== candidate.id || paths.has(candidate.path)) {
        throw new Error("O backup contém caminhos duplicados ou documentos inválidos. Nenhum dado foi restaurado.");
      }
      const parts = candidate.path.split("/");
      if ((collectionName === "users" && (parts.length !== 2 || parts[0] !== "users"))
        || (collectionName === "users/*/private-data"
          && (parts[0] !== "users" || parts.length < 4
            || !(USER_DOCUMENTS.includes(parts.slice(2).join("/") as typeof USER_DOCUMENTS[number])
              || USER_COLLECTIONS.some((prefix) => parts.slice(2).join("/").startsWith(prefix + "/")))))
        || (ROOT_COLLECTIONS.includes(collectionName as typeof ROOT_COLLECTIONS[number])
          && (parts.length !== 2 || parts[0] !== collectionName))
        || (collectionName === "externalMaintenances/*/history"
          && (parts.length !== 4 || parts[0] !== "externalMaintenances" || parts[2] !== "history"))) {
        throw new Error(`O documento ${candidate.path} não corresponde à coleção declarada no backup.`);
      }
      if (typeof candidate.data.ownerUid === "string" && parts[0] === "users" && candidate.data.ownerUid !== parts[1]) {
        throw new Error(`O proprietário não corresponde ao caminho do documento ${candidate.path}.`);
      }
      if (parts[0] === "Expediente"
        && (!isRecord(candidate.data.assignment)
          || candidate.data.assignment.uid !== candidate.data.ownerUid)) {
        throw new Error(`A atribuição do expediente não corresponde ao proprietário em ${candidate.path}.`);
      }
      paths.add(candidate.path);
      documents.push(candidate as unknown as BackupDocument);
    }
  }

  const writeAudit = async (action: string, details: Record<string, unknown>) => {
    const auditRef = doc(collection(db, "adminAudit"));
    await runTransaction(db, async (transaction) => {
      transaction.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email ?? "",
        action,
        targetUid: "all",
        details,
        createdAt: serverTimestamp(),
      });
    });
  };
  const baseDetails = {
    backupCreatedAt: inspection.createdAt,
    backupCreatedBy: inspection.createdBy,
    projectId: inspection.projectId,
    documentCount: documents.length,
  };
  await writeAudit("ADMIN_BACKUP_RESTORE_STARTED", baseDetails);

  let restoredCount = 0;
  let skippedCount = 0;
  try {
    for (const item of documents) {
      const reference = doc(db, item.path);
      const created = await runTransaction(db, async (transaction) => {
        const current = await transaction.get(reference);
        if (current.exists()) return false;
        transaction.set(reference, reviveBackupValue(item.data) as DocumentData);
        return true;
      });
      if (created) restoredCount += 1;
      else skippedCount += 1;
    }
    await writeAudit("ADMIN_BACKUP_RESTORED", {
      ...baseDetails, restoredCount, skippedCount, result: "completed",
    });
    return { restoredCount, skippedCount };
  } catch (error) {
    try {
      await writeAudit("ADMIN_BACKUP_RESTORE_PARTIAL", {
        ...baseDetails, restoredCount, skippedCount, result: "partial",
        error: error instanceof Error ? error.message.slice(0, 500) : "Falha não identificada",
      });
    } catch {
      // O erro original deve ser preservado; a interface informará que a operação pode ter sido parcial.
    }
    throw new Error(
      `A restauração foi interrompida após ${restoredCount} documentos criados e ${skippedCount} preservados. Nenhum documento existente foi sobrescrito. Verifique a auditoria antes de tentar novamente. Motivo: ${error instanceof Error ? error.message : "falha não identificada"}`,
    );
  }
}
