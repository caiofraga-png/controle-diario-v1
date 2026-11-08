import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  orderBy,
  runTransaction,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import type { OrganizationalContact, OrganizationalSector, OrganizationalUser } from "../shared/types/organization";
import { loadSharedTaskCatalog } from "./firebaseSharedTaskCatalogService";

function asUser(id: string, data: DocumentData): OrganizationalUser {
  return {
    uid: id,
    email: String(data.email ?? ""),
    login: String(data.login ?? ""),
    agent: String(data.agent ?? ""),
    sectorId: String(data.sectorId ?? ""),
    contactId: String(data.contactId ?? ""),
    isSupervisor: data.isSupervisor === true,
    allowedProfileIds: Array.isArray(data.allowedProfileIds) ? data.allowedProfileIds.filter((id: unknown): id is string => typeof id === "string") : [],
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
  const { auth, db } = requireFirebase();
  const actor = auth.currentUser;
  if (!actor) throw new Error("É necessário autenticar-se para administrar o sistema.");
  const requestRef = doc(db, "accessRequests", input.uid);
  const userRef = doc(db, "users", input.uid);
  const auditRef = doc(collection(db, "adminAudit"));
  const now = new Date().toISOString();
  const email = input.email.trim().toLowerCase();

  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const userSnapshot = await transaction.get(userRef);
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") {
      throw new Error("A SOLICITAÇÃO NÃO EXISTE OU JÁ FOI DECIDIDA.");
    }
    if (String(requestSnapshot.data().email ?? "").trim().toLowerCase() !== email) {
      throw new Error("O E-MAIL DA SOLICITAÇÃO NÃO CONFERE COM O CADASTRO INFORMADO.");
    }
    if (userSnapshot.exists()) {
      throw new Error("JÁ EXISTE UM PERFIL ORGANIZACIONAL PARA ESTE USUÁRIO. REVISE O CADASTRO ANTES DE APROVAR.");
    }

    transaction.set(userRef, {
      uid: input.uid,
      email,
      login: input.login.trim(),
      agent: input.agent.trim(),
      sectorId: input.sectorId,
      contactId: input.contactId,
      isSupervisor: false,
      status: "approved",
      role: "employee",
      createdAt: now,
      updatedAt: now,
    });
    transaction.update(requestRef, {
      status: "approved",
      decidedAt: serverTimestamp(),
    });
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorEmail: actor.email ?? "",
      action: "ACCESS_APPROVED",
      targetUid: input.uid,
      details: { email },
      createdAt: serverTimestamp(),
    });
  });
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
  changes: Pick<OrganizationalUser, "login" | "agent" | "sectorId" | "contactId" | "isSupervisor" | "allowedProfileIds">
) {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "users", uid), {
    login: changes.login.trim(),
    agent: changes.agent.trim(),
    sectorId: changes.sectorId,
    contactId: changes.contactId,
    isSupervisor: changes.isSupervisor,
    allowedProfileIds: changes.allowedProfileIds ?? [],
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

export async function listRecentOperationalRecords(maxItems = 100, sectorId?: string) {
  const { db } = requireFirebase();
  // Supervisors and administrators can query the complete organization-wide
  // index; employees can only retrieve records they own under Firestore Rules.
  const base = collection(db, "Expediente");
  const recordQuery = sectorId
    ? query(base, where("sectorId", "==", sectorId), orderBy("completedAt", "desc"), limit(maxItems))
    : query(base, orderBy("completedAt", "desc"), limit(maxItems));
  const snapshot = await getDocs(recordQuery);
  return snapshot.docs.map((item) => ({ id: item.id, path: item.ref.path, ...item.data() }));
}

export async function deleteSector(id: string) {
  const { db } = requireFirebase();
  const { deleteDoc } = await import("firebase/firestore");
  const contacts = await getDocs(query(collection(db, "organizationContacts"), where("sectorId", "==", id)));
  if (!contacts.empty) throw new Error("Não é possível excluir um setor que ainda possui contatos. Remova ou transfira os contatos primeiro.");
  const users = await getDocs(query(collection(db, "users"), where("sectorId", "==", id)));
  if (!users.empty) throw new Error("Não é possível excluir um setor utilizado por colaboradores. Reatribua os colaboradores primeiro.");
  await deleteDoc(doc(db, "organizationSectors", id));
  await audit("SECTOR_DELETED", id);
}

export async function deleteContact(id: string) {
  const { db } = requireFirebase();
  const { deleteDoc } = await import("firebase/firestore");
  const users = await getDocs(query(collection(db, "users"), where("contactId", "==", id)));
  if (!users.empty) throw new Error("Não é possível excluir um contato utilizado por colaboradores. Reatribua os colaboradores primeiro.");
  await deleteDoc(doc(db, "organizationContacts", id));
  await audit("CONTACT_DELETED", id);
}

/**
 * Consolidated read-only operational view for administrators and supervisors.
 * Data is loaded only on explicit request to keep Firestore reads predictable.
 */
export async function loadManagementOverview() {
  const { db } = requireFirebase();
  const [users, sectorsSnapshot, contactsSnapshot, currentSnapshot, historySnapshot, catalog] = await Promise.all([
    listOrganizationalUsers(),
    getDocs(collection(db, "organizationSectors")),
    getDocs(collection(db, "organizationContacts")),
    getDocs(query(collectionGroup(db, "operational"), where("schemaVersion", "==", 1))),
    getDocs(collectionGroup(db, "entries")),
    loadSharedTaskCatalog(),
  ]);

  const managers = new Map(users.map(user => [user.uid, user] as const));
  const sectors = new Map(sectorsSnapshot.docs.map(item => [item.id, String(item.data().name ?? "")] as const));
  const contacts = new Map(contactsSnapshot.docs.map(item => [item.id, String(item.data().name ?? "")] as const));
  const profiles = catalog?.perfis.perfis ?? [];
  const profileNames = new Map(profiles.map(profile => [profile.id, profile.nome] as const));
  const assignments = (uid: string, snapshot?: Record<string, unknown>) => {
    const user = managers.get(uid);
    // Prefer the assignment saved with the historical record. Older records
    // do not contain this snapshot, so they fall back to the current user data.
    const source = snapshot && typeof snapshot === "object" ? snapshot : {};
    const sectorId = String(source.sectorId ?? user?.sectorId ?? "");
    const contactId = String(source.contactId ?? user?.contactId ?? "");
    return {
      uid,
      colaborador: String(source.login ?? user?.login ?? user?.email ?? uid),
      setor: String(source.sectorName ?? sectors.get(sectorId) ?? ""),
      setorId: sectorId,
      contato: String(source.contactName ?? contacts.get(contactId) ?? ""),
      contatoId: contactId,
      agente: String(source.agent ?? user?.agent ?? ""),
    };
  };

  const expedientes: Record<string, unknown>[] = [];
  const atendimentos: Record<string, unknown>[] = [];
  for (const item of currentSnapshot.docs) {
    if (item.id !== "currentState") continue;
    const uid = item.ref.path.split("/")[1] ?? "";
    if (!managers.has(uid)) continue;
    const state = item.data().estado;
    if (!state || typeof state !== "object") continue;
    const assignment = assignments(uid);
    expedientes.push({
      id: item.ref.path, ...assignment, perfil: String(state.perfil?.nome ?? ""),
      perfilId: String(state.perfil?.id ?? ""), data: String(state.data ?? ""),
      situacao: "NÃO CONCLUÍDO", status: "NAO_CONCLUIDO",
      tarefas: state.tarefas ?? [], observacao: String(state.observacao ?? ""),
      atendimentos: state.atendimentos ?? [],
    });
    for (const row of state.atendimentos ?? []) atendimentos.push({
      ...row, ...assignment, perfil: String(state.perfil?.nome ?? ""),
      data: String(state.data ?? ""), situacaoExpediente: "NÃO CONCLUÍDO",
    });
  }
  for (const item of historySnapshot.docs) {
    const uid = item.ref.path.split("/")[1] ?? "";
    if (!managers.has(uid)) continue;
    const record = item.data();
    if (record.status !== "CONCLUIDO") continue;
    const assignment = assignments(uid, record.assignment);
    expedientes.push({
      id: item.ref.path, ...assignment, perfil: String(record.perfil?.nome ?? ""),
      perfilId: String(record.perfil?.id ?? ""), data: String(record.data ?? ""),
      situacao: "CONCLUÍDO", status: "CONCLUIDO",
      tarefas: record.tarefas ?? [], observacao: String(record.observacao ?? ""),
      atendimentos: record.atendimentos ?? [], concluidoEm: String(record.concluidoEm ?? ""),
    });
    for (const row of record.atendimentos ?? []) atendimentos.push({
      ...row, ...assignment, perfil: String(record.perfil?.nome ?? ""),
      data: String(record.data ?? ""), situacaoExpediente: "CONCLUÍDO",
    });
  }
  expedientes.sort((a,b)=>String(b.data).localeCompare(String(a.data)) || String(a.colaborador).localeCompare(String(b.colaborador)));
  atendimentos.sort((a,b)=>String(b.data).localeCompare(String(a.data)) || String(a.ticket).localeCompare(String(b.ticket)));
  const estrutura = {
    colaboradores: users.map(user => ({ uid: user.uid, colaborador: user.login || user.email || user.uid, email: user.email, agente: user.agent, setor: sectors.get(user.sectorId) ?? "", contato: contacts.get(user.contactId) ?? "", perfis: (user.allowedProfileIds ?? []).map(id => profileNames.get(id) ?? id).join(", "), status: user.status })),
    setores: sectorsSnapshot.docs.map(item => ({ id: item.id, nome: String(item.data().name ?? ""), ativo: item.data().active === true })),
    contatos: contactsSnapshot.docs.map(item => ({ id: item.id, nome: String(item.data().name ?? ""), setor: sectors.get(String(item.data().sectorId ?? "")) ?? "", ativo: item.data().active === true })),
    agentes: [...new Set(users.map(user => user.agent.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(nome => ({
      nome,
      colaboradores: users.filter(user => user.agent.trim() === nome).map(user => user.login || user.email || user.uid).sort((a, b) => a.localeCompare(b, "pt-BR")),
    })),
    perfis: profiles.filter(profile => profile.ativo).map(profile => ({
      id: profile.id,
      nome: profile.nome,
      colaboradores: users.filter(user => (user.allowedProfileIds ?? []).includes(profile.id)).map(user => user.login || user.email || user.uid).sort((a, b) => a.localeCompare(b, "pt-BR")),
    })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
  return { expedientes, atendimentos, estrutura, totalColaboradores: users.filter(user => user.status === "approved").length, updatedAt: new Date().toISOString() };
}
