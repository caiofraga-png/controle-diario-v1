import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import type { OrganizationalContact, OrganizationalSector, OrganizationalUser } from "../shared/types/organization";

function asUser(id: string, data: DocumentData): OrganizationalUser {
  return {
    uid: id,
    email: String(data.email ?? ""),
    login: String(data.login ?? ""),
    agent: String(data.agent ?? ""),
    sectorId: String(data.sectorId ?? ""),
    contactId: String(data.contactId ?? ""),
    status: data.status,
    role: data.role,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

async function audit(action: string, targetUid: string, details: Record<string, unknown> = {}) {
  const { auth, db } = requireFirebase();
  const actor = auth.currentUser;
  if (!actor) throw new Error("É necessário autenticar-se para administrar o sistema.");
  const auditRef = doc(collection(db, "adminAudit"));
  await setDoc(auditRef, {
    actorUid: actor.uid,
    actorEmail: actor.email ?? "",
    action,
    targetUid,
    details,
    createdAt: serverTimestamp(),
  });
}

export async function listAccessRequests() {
  const { db } = requireFirebase();
  const snapshot = await getDocs(query(collection(db, "accessRequests"), orderBy("requestedAt", "asc"), limit(200)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listOrganizationalUsers() {
  const { db } = requireFirebase();
  const snapshot = await getDocs(query(collection(db, "users"), limit(500)));
  return snapshot.docs.map((item) => asUser(item.id, item.data()));
}

export async function approveAccessRequest(input: {
  uid: string;
  email: string;
  login: string;
  agent: string;
  sectorId: string;
  contactId: string;
}) {
  const { db } = requireFirebase();
  const now = new Date().toISOString();
  await setDoc(doc(db, "users", input.uid), {
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    login: input.login.trim(),
    agent: input.agent.trim(),
    sectorId: input.sectorId,
    contactId: input.contactId,
    status: "approved",
    role: "employee",
    createdAt: now,
    updatedAt: now,
  });
  await updateDoc(doc(db, "accessRequests", input.uid), {
    status: "approved",
    decidedAt: serverTimestamp(),
  });
  await audit("ACCESS_APPROVED", input.uid, { email: input.email });
}

export async function rejectAccessRequest(uid: string, reason = "") {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "accessRequests", uid), {
    status: "rejected",
    reason: reason.trim(),
    decidedAt: serverTimestamp(),
  });
  await audit("ACCESS_REJECTED", uid, { reason: reason.trim() });
}

export async function updateOrganizationalUser(
  uid: string,
  changes: Pick<OrganizationalUser, "login" | "agent" | "sectorId" | "contactId">
) {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "users", uid), {
    login: changes.login.trim(),
    agent: changes.agent.trim(),
    sectorId: changes.sectorId,
    contactId: changes.contactId,
    updatedAt: new Date().toISOString(),
  });
  await audit("ORGANIZATIONAL_PROFILE_UPDATED", uid, changes);
}

export async function setAccountStatus(uid: string, status: "blocked" | "approved") {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "users", uid), {
    status,
    updatedAt: new Date().toISOString(),
  });
  await audit(status === "blocked" ? "ACCOUNT_BLOCKED" : "ACCOUNT_REACTIVATED", uid);
}

export async function listSectors(): Promise<OrganizationalSector[]> {
  const { db } = requireFirebase();
  const snapshot = await getDocs(query(collection(db, "organizationSectors"), orderBy("name")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OrganizationalSector));
}

export async function saveSector(input: Pick<OrganizationalSector, "id" | "name" | "active">) {
  const { db } = requireFirebase();
  const id = input.id.trim() || doc(collection(db, "organizationSectors")).id;
  const now = new Date().toISOString();
  await setDoc(doc(db, "organizationSectors", id), { ...input, id, name: input.name.trim(), updatedAt: now, createdAt: now }, { merge: true });
  await audit("SECTOR_SAVED", id, { name: input.name.trim() });
  return id;
}

export async function listContacts(): Promise<OrganizationalContact[]> {
  const { db } = requireFirebase();
  const snapshot = await getDocs(query(collection(db, "organizationContacts"), orderBy("name")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OrganizationalContact));
}

export async function saveContact(input: Pick<OrganizationalContact, "id" | "sectorId" | "name" | "active">) {
  const { db } = requireFirebase();
  const id = input.id.trim() || doc(collection(db, "organizationContacts")).id;
  const now = new Date().toISOString();
  await setDoc(doc(db, "organizationContacts", id), { ...input, id, name: input.name.trim(), updatedAt: now, createdAt: now }, { merge: true });
  await audit("CONTACT_SAVED", id, { sectorId: input.sectorId, name: input.name.trim() });
  return id;
}

export async function getAllowedDomains(): Promise<string[]> {
  const { db } = requireFirebase();
  const { getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(db, "settings", "allowedDomains"));
  return snapshot.exists() ? (snapshot.data().domains as string[] | undefined) ?? [] : [];
}

export async function saveAllowedDomains(domains: string[]) {
  const { db } = requireFirebase();
  const normalized = [...new Set(domains.map((domain) => domain.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
  await setDoc(doc(db, "settings", "allowedDomains"), { domains: normalized, updatedAt: new Date().toISOString() }, { merge: true });
  await audit("ALLOWED_DOMAINS_UPDATED", "settings/allowedDomains", { domains: normalized });
}

export async function listRecentOperationalRecords(maxItems = 100) {
  const { db } = requireFirebase();
  // Admin read-only oversight view. The final schema will standardize recordType
  // and completedAt before this is used by the management dashboard.
  const snapshot = await getDocs(query(collectionGroup(db, "operational"), orderBy("completedAt", "desc"), limit(maxItems)));
  return snapshot.docs.map((item) => ({ id: item.id, path: item.ref.path, ...item.data() }));
}
