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
  onSnapshot,
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

async function firestoreStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    throw new Error(`Falha no Firestore na etapa "${step}"${code ? ` (${code})` : ""}. Verifique as regras e a configuração de homologação.`);
  }
}

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
    allowedProfileIds: Array.isArray(data.allowedProfileIds) ? data.allowedProfileIds.filter((id: unknown): id is string => typeof id === "string") : [],
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
  await firebaseAuthPersistenceReady;

  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  const identity = credential.user;
  const email = normalizedEmail(identity);

  if (!email || !identity.emailVerified) {
    await signOut(auth);
    throw new Error("Use uma conta Google empresarial com e-mail verificado.");
  }

  const userRef = doc(db, "users", identity.uid);
  const userSnapshot = await firestoreStep("leitura do perfil users/{uid}", () => getDoc(userRef));

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
  const requestSnapshot = await firestoreStep("leitura de accessRequests/{uid}", () => getDoc(requestRef));
  if (requestSnapshot.exists()) {
    const requestStatus = String(requestSnapshot.data().status ?? "pending");
    await signOut(auth);
    if (requestStatus === "rejected" || requestStatus === "blocked") {
      return { status: requestStatus, email };
    }
    return { status: "pending", email };
  }

  const domainSnapshot = await firestoreStep("leitura de settings/allowedDomains", () => getDoc(doc(db, ALLOWED_DOMAINS_DOC)));
  const domains = domainSnapshot.exists()
    ? (domainSnapshot.data().domains as unknown[] | undefined) ?? []
    : [];
  if (!domains.some((value) => String(value).trim().toLowerCase() === domainOf(email))) {
    await signOut(auth);
    return { status: "not-allowed", email };
  }

  await firestoreStep("gravação de accessRequests/{uid}", () => setDoc(requestRef, {
    uid: identity.uid,
    email,
    status: "pending",
    requestedAt: serverTimestamp(),
  }));

  await signOut(auth);
  return { status: "pending", email };
}

/**
 * Restaura e valida a sessão Firebase já persistida, sem abrir uma janela Google.
 * Aguarda o Firebase concluir a leitura inicial do estado de autenticação antes de
 * consultar currentUser. A sessão não concede acesso sem perfil aprovado.
 */
export type RestoredAccessResult = AccessResult | { status: "signed-out" };

export async function restoreCorporateGoogleSession(): Promise<RestoredAccessResult> {
  const { auth, db } = requireFirebase();
  await firebaseAuthPersistenceReady;
  await auth.authStateReady();

  const identity = auth.currentUser;
  if (!identity) return { status: "signed-out" };

  const email = normalizedEmail(identity);
  if (!email || !identity.emailVerified) {
    await signOut(auth);
    return { status: "not-allowed", email };
  }

  const userSnapshot = await getDoc(doc(db, "users", identity.uid));
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

  const requestSnapshot = await getDoc(doc(db, "accessRequests", identity.uid));
  if (requestSnapshot.exists()) {
    const requestStatus = String(requestSnapshot.data().status ?? "pending");
    await signOut(auth);
    if (requestStatus === "rejected" || requestStatus === "blocked") {
      return { status: requestStatus, email };
    }
    return { status: "pending", email };
  }

  await signOut(auth);
  return { status: "not-allowed", email };
}

/**
 * Observa a identidade e o perfil autorizado durante a sessão.
 * Se o perfil for removido ou deixar de estar aprovado, encerra a sessão.
 * A autorização real continua sendo imposta pelas regras do Firestore.
 */
export function observeCorporateAccess(
  callback: (result: RestoredAccessResult) => void,
  onError?: (error: Error) => void,
): () => void {
  const { auth, db } = requireFirebase();
  let stopProfileObserver: (() => void) | undefined;
  let generation = 0;

  const stopAuthObserver = onAuthStateChanged(auth, (identity) => {
    generation += 1;
    const currentGeneration = generation;
    stopProfileObserver?.();
    stopProfileObserver = undefined;

    if (!identity) {
      callback({ status: "signed-out" });
      return;
    }

    const email = normalizedEmail(identity);
    if (!email || !identity.emailVerified) {
      void signOut(auth).catch((error: unknown) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });
      callback({ status: "not-allowed", email });
      return;
    }

    stopProfileObserver = onSnapshot(
      doc(db, "users", identity.uid),
      (snapshot) => {
        if (currentGeneration !== generation) return;
        if (!snapshot.exists()) {
          // A conta autenticada pode ainda estar aguardando aprovação e, portanto,
          // não possuir users/{uid}. Não encerre a sessão aqui: o fluxo de login
          // precisa consultar/criar accessRequests/{uid} antes de decidir o acesso.
          callback({ status: "not-allowed", email });
          return;
        }

        const profile = asOrganizationalUser(identity.uid, snapshot.data());
        if (profile.status === "approved") {
          callback({ status: "approved", user: profile });
          return;
        }

        callback({
          status: profile.status === "blocked" || profile.status === "rejected"
            ? profile.status
            : "pending",
          email,
        });
        void signOut(auth).catch((error: unknown) => {
          onError?.(error instanceof Error ? error : new Error(String(error)));
        });
      },
      (error) => {
        if (currentGeneration === generation) onError?.(error);
      },
    );
  }, (error) => {
    onError?.(error);
  });

  return () => {
    generation += 1;
    stopAuthObserver();
    stopProfileObserver?.();
  };
}

export function observeFirebaseIdentity(callback: (user: User | null) => void): () => void {
  const { auth } = requireFirebase();
  return onAuthStateChanged(auth, callback);
}

export async function signOutCorporateGoogle(): Promise<void> {
  const { auth } = requireFirebase();
  await signOut(auth);
}
