import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type NotificationCategory = "cobranca" | "promocoes" | "manutencoes";
export type NotificationPreferences = Record<NotificationCategory, boolean>;
export interface SharedNotification {
  id: string;
  category: NotificationCategory;
  message: string;
  target: "inadimplencia" | "promocoes" | "manutencoes";
  createdAt?: unknown;
  createdByUid: string;
}
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  cobranca: true, promocoes: true, manutencoes: true,
};
const preferencesRef = () => {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA CONFIGURAR OS AVISOS.");
  return doc(db, "users", auth.currentUser.uid, "preferences", "notifications");
};
export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const snapshot = await getDoc(preferencesRef());
  if (!snapshot.exists()) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const value = snapshot.data().categories ?? {};
  return {
    cobranca: value.cobranca !== false,
    promocoes: value.promocoes !== false,
    manutencoes: value.manutencoes !== false,
  };
}
export async function saveNotificationPreferences(categories: NotificationPreferences): Promise<void> {
  const { db } = requireFirebase();
  await setDoc(preferencesRef(), {
    schemaVersion: 1,
    categories: {
      cobranca: categories.cobranca === true,
      promocoes: categories.promocoes === true,
      manutencoes: categories.manutencoes === true,
    },
    updatedAt: serverTimestamp(),
  });
}
export async function canCurrentUserPublishDelinquency(): Promise<boolean> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) return false;
  const [userSnapshot, permissionSnapshot] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "featurePermissions", "delinquency")),
  ]);
  if (!userSnapshot.exists() || !permissionSnapshot.exists()) return false;
  const profile = userSnapshot.data();
  const permission = permissionSnapshot.data();
  if (profile.status !== "approved" || permission.enabled !== true) return false;
  const sectors = Array.isArray(permission.sectorIds) ? permission.sectorIds : [];
  const contacts = Array.isArray(permission.contactIds) ? permission.contactIds : [];
  return sectors.includes(profile.sectorId) || contacts.includes(profile.contactId);
}
export function subscribeSharedNotifications(callback: (items: SharedNotification[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const { db } = requireFirebase();
  const q = query(collection(db, "sharedNotifications"), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as SharedNotification)));
  }, error => onError?.(error));
}
export async function publishSharedNotification(input: Omit<SharedNotification, "id" | "createdAt" | "createdByUid">): Promise<void> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("FAÇA LOGIN PARA PUBLICAR UM AVISO.");
  const userSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = userSnapshot.exists() ? userSnapshot.data() : null;
  if (profile?.status !== "approved" || (profile.role !== "admin" && profile.isSupervisor !== true)) {
    throw new Error("SOMENTE ADMINISTRADORES E SUPERVISORES PODEM PUBLICAR AVISOS INSTITUCIONAIS.");
  }
  if (!["cobranca", "promocoes", "manutencoes"].includes(input.category)) throw new Error("CATEGORIA DE AVISO INVÁLIDA.");
  const ref = doc(collection(db, "sharedNotifications"));
  await setDoc(ref, { ...input, createdByUid: user.uid, createdAt: serverTimestamp() });
}
