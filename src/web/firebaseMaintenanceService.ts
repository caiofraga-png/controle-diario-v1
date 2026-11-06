import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type MaintenanceStatus = "ongoing" | "completed";
export interface ExternalMaintenance {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  status: MaintenanceStatus;
  createdByUid: string;
  createdAt?: unknown;
  updatedByUid: string;
  updatedAt?: unknown;
}
export interface MaintenanceHistory {
  id: string;
  changedByUid: string;
  changedByName?: string;
  changedAt?: unknown;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}
export type ExternalMaintenanceInput = Pick<ExternalMaintenance, "title" | "date" | "location" | "description" | "status">;

async function currentUserCanManage(): Promise<boolean> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) return false;
  const [userSnapshot, permissionSnapshot] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "featurePermissions", "maintenance")),
  ]);
  if (!userSnapshot.exists()) return false;
  const profile = userSnapshot.data();
  if (profile.status !== "approved") return false;
  if (profile.role === "admin" || profile.isSupervisor === true) return true;
  if (!permissionSnapshot.exists()) return false;
  const permission = permissionSnapshot.data();
  if (permission.enabled !== true) return false;
  const sectors = Array.isArray(permission.wholeSectorIds) ? permission.wholeSectorIds : [];
  const contacts = Array.isArray(permission.contactIds) ? permission.contactIds : [];
  const agents = Array.isArray(permission.agentIds) ? permission.agentIds : [];
  return sectors.includes(profile.sectorId) || contacts.includes(profile.contactId) || agents.includes(user.uid);
}

function validateInput(input: ExternalMaintenanceInput): void {
  if (!input.title.trim()) throw new Error("INFORME O TÍTULO DA MANUTENÇÃO.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("INFORME UMA DATA VÁLIDA.");
  if (!input.location.trim()) throw new Error("INFORME O LOCAL DA MANUTENÇÃO.");
  if (!input.description.trim()) throw new Error("INFORME A DESCRIÇÃO DA MANUTENÇÃO.");
  if (input.status !== "ongoing" && input.status !== "completed") throw new Error("STATUS DE MANUTENÇÃO INVÁLIDO.");
}

export async function canCurrentUserManageMaintenances(): Promise<boolean> {
  return currentUserCanManage();
}

export async function saveExternalMaintenance(input: ExternalMaintenanceInput, id?: string): Promise<void> {
  validateInput(input);
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user || !(await currentUserCanManage())) {
    throw new Error("SEU SETOR, CONTATO OU USUÁRIO NÃO POSSUI PERMISSÃO PARA CADASTRAR OU EDITAR MANUTENÇÕES.");
  }

  const userProfile = await getDoc(doc(db, "users", user.uid));
  const changedByName = String(userProfile.data()?.agent ?? user.displayName ?? user.email ?? user.uid);
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const notificationRef = doc(collection(db, "sharedNotifications"));
  let savedMaintenanceId = id ?? "";

  if (id) {
    const maintenanceRef = doc(db, "externalMaintenances", id);
    savedMaintenanceId = id;
    const snapshot = await getDoc(maintenanceRef);
    if (!snapshot.exists()) throw new Error("MANUTENÇÃO NÃO ENCONTRADA.");
    const previous = snapshot.data();
    const before = {
      title: previous.title,
      date: previous.date,
      location: previous.location,
      description: previous.description,
      status: previous.status,
    };
    const changed = (Object.keys(before) as Array<keyof typeof before>)
      .some(key => before[key] !== input[key]);
    if (!changed) return;

    const historyRef = doc(collection(db, "externalMaintenances", id, "history"));
    batch.update(maintenanceRef, { ...input, updatedByUid: user.uid, updatedAt: now, lastHistoryId: historyRef.id, lastNotificationId: notificationRef.id });
    batch.set(historyRef, {
      maintenanceId: id,
      changedByUid: user.uid,
      changedByName,
      changedAt: now,
      before,
      after: input,
    });
  } else {
    const maintenanceRef = doc(collection(db, "externalMaintenances"));
    savedMaintenanceId = maintenanceRef.id;
    const historyRef = doc(collection(db, "externalMaintenances", maintenanceRef.id, "history"));
    batch.set(maintenanceRef, {
      ...input,
      createdByUid: user.uid,
      createdAt: now,
      updatedByUid: user.uid,
      updatedAt: now,
      lastHistoryId: historyRef.id,
      lastNotificationId: notificationRef.id,
    });
    batch.set(historyRef, {
      maintenanceId: maintenanceRef.id,
      changedByUid: user.uid,
      changedByName,
      changedAt: now,
      before: null,
      after: input,
    });
  }

  // Maintenance data, immutable audit entry and notification are committed together.
  batch.set(notificationRef, {
    category: "manutencoes",
    message: input.title,
    target: "manutencoes",
    maintenanceId: savedMaintenanceId,
    createdByUid: user.uid,
    createdAt: now,
  });
  await batch.commit();
}

export function subscribeExternalMaintenances(
  callback: (items: ExternalMaintenance[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(
    query(collection(db, "externalMaintenances"), orderBy("updatedAt", "desc")),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ExternalMaintenance))),
    error => onError?.(error),
  );
}

export async function loadMaintenanceHistory(id: string): Promise<MaintenanceHistory[]> {
  const { db } = requireFirebase();
  const snapshot = await getDocs(query(
    collection(db, "externalMaintenances", id, "history"),
    orderBy("changedAt", "desc"),
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() } as MaintenanceHistory));
}
