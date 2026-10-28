import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { firebaseAuthPersistenceReady, requireFirebase } from "./firebaseClient";
import type { AccountStatus, OrganizationalUser, UserRole } from "../shared/types/organization";

export type AccessResult =
  | { status: "approved"; user: OrganizationalUser }
  | { status: "pending"; email: string }
  | { status: "blocked" | "rejected"; email: string }
  | { status: "not-allowed"; email: string };

const ALLOWED_DOMAINS_DOC = "settings/allowedDomains";

function normalizedEmail(user: User): string {
  return (user.email ?? "").trim().toLowerCase();
}

function domainOf(email: string): string {
  return email.split("@").at(-1)?.toLowerCase() ?? "";
}

function asOrganizationalUser(uid: string, data: DocumentData): OrganizationalUser {
  return {
    uid,
    email: String(data.email ?? ""),
    login: String(data.login ?? ""),
    agent: String(data.agent ?? ""),
    sectorId: String(data.sectorId ?? ""),
    contactId: String(data.contactId ?? ""),
    isSupervisor: data.isSupervisor === true,
    status: data.status as AccountStatus,
    role: data.role as UserRole,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

/**
 * Autentica com Google e respeita a persistência local do Firebase.
 * A sessão não substitui a aprovação administrativa nem as regras do Firestore.
 */
export async function signInWithCorporateGoogle(): Promise<AccessResult> {
  const { auth, db } = requireFirebase();
  // Garante que a persistência local foi configurada antes de iniciar o login.
  await firebaseAuthPersistenceReady;

  const provider = new GoogleAuthProvider();
  // Não força a tela de seleção de conta em toda autenticação.
  // O usuário ainda poderá trocar de conta ao sair e iniciar novo login.

  const credential = await signInWithPopup(auth, provider);
  const identity = credential.user;
  const email = normalizedEmail(identity);

  if (!email || !identity.emailVerified) {
    await signOut(auth);
    throw new Error("Use uma conta Google empresarial com e-mail verificado.");
  }

  const userRef = doc(db, "users", identity.uid);
  const userSnapshot = await getDoc(userRef);

  if (userSnapshot.exists()) {
    const profile = asOrganizationalUser(identity.uid, userSnapshot.data());
    if (profile.status === "approved") {
      return { status: "approved", user: profile };
    }
    await signOut(auth);
    return {
      status: profile.status === "blocked" || profile.status === "rejected"
        ? profile.status
        : "pending",
      email,
    };
  }

  const requestRef = doc(db, "accessRequests", identity.uid);
  const requestSnapshot = await getDoc(requestRef);
  if (requestSnapshot.exists()) {
    const requestStatus = String(requestSnapshot.data().status ?? "pending");
    await signOut(auth);
    if (requestStatus === "rejected" || requestStatus === "blocked") {
      return { status: requestStatus, email };
    }
    return { status: "pending", email };
  }

  const domainSnapshot = await getDoc(doc(db, ALLOWED_DOMAINS_DOC));
  const domains = domainSnapshot.exists()
    ? (domainSnapshot.data().domains as unknown[] | undefined) ?? []
    : [];
  if (!domains.some((value) => String(value).trim().toLowerCase() === domainOf(email))) {
    await signOut(auth);
    return { status: "not-allowed", email };
  }

  // As regras do Firestore também validam o e-mail verificado e o domínio.
  // A solicitação não cria perfil aprovado nem concede privilégios.
  await setDoc(requestRef, {
    uid: identity.uid,
    email,
    status: "pending",
    requestedAt: serverTimestamp(),
  });

  await signOut(auth);
  return { status: "pending", email };
}

export function observeFirebaseIdentity(callback: (user: User | null) => void): () => void {
  const { auth } = requireFirebase();
  return onAuthStateChanged(auth, callback);
}

export async function signOutCorporateGoogle(): Promise<void> {
  const { auth } = requireFirebase();
  await signOut(auth);
}
