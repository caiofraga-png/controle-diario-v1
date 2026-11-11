import { doc, getDoc } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type PublicationFeature = "maintenance" | "promotions" | "delinquency";
export type PublicationRecordScope = {
  createdByUid?: string;
  ownerSectorId?: string;
  ownerContactId?: string;
};
export type PublicationAccess = {
  uid: string;
  manager: boolean;
  canPublish: boolean;
  enabled: boolean;
  wholeSectorIds: string[];
  contactIds: string[];
  agentIds: string[];
};

export async function loadPublicationAccess(feature: PublicationFeature): Promise<PublicationAccess | null> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) return null;
  const [userSnapshot, permissionSnapshot] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "featurePermissions", feature)),
  ]);
  if (!userSnapshot.exists()) return null;
  const profile = userSnapshot.data();
  if (profile.status !== "approved") return null;
  const manager = profile.role === "admin" || profile.isSupervisor === true;
  const permission = permissionSnapshot.exists() ? permissionSnapshot.data() : {};
  const wholeSectorIds = Array.isArray(permission.wholeSectorIds) ? permission.wholeSectorIds : [];
  const contactIds = Array.isArray(permission.contactIds) ? permission.contactIds : [];
  const agentIds = Array.isArray(permission.agentIds) ? permission.agentIds : [];
  const canPublish = manager || (permission.enabled === true
    && (wholeSectorIds.includes(profile.sectorId)
      || contactIds.includes(profile.contactId)
      || agentIds.includes(user.uid)));
  return { uid: user.uid, manager, canPublish, enabled: permission.enabled === true, wholeSectorIds, contactIds, agentIds };
}

/**
 * Record snapshots allow the UI to mirror the server-side owner-scope rule
 * without reading other collaborators' private user documents.
 * Legacy records without snapshots are editable only by their creator or a manager.
 */
export function canEditPublicationRecord(
  access: PublicationAccess | null,
  record: PublicationRecordScope,
): boolean {
  if (!access) return false;
  if (access.manager) return true;
  if (!access.enabled) return false;
  if (record.createdByUid === access.uid) return access.canPublish;
  if (!record.ownerSectorId && !record.ownerContactId) return false;
  return (Boolean(record.ownerSectorId) && access.wholeSectorIds.includes(record.ownerSectorId!))
    || (Boolean(record.ownerContactId) && access.contactIds.includes(record.ownerContactId!))
    || (Boolean(record.createdByUid) && access.agentIds.includes(record.createdByUid!));
}
