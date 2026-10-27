/// <reference types="vite/client" />
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
};

function readConfig(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const apiKey = String(env.VITE_FIREBASE_API_KEY ?? "").trim();
  const authDomain = String(env.VITE_FIREBASE_AUTH_DOMAIN ?? "").trim();
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? "").trim();
  const appId = String(env.VITE_FIREBASE_APP_ID ?? "").trim();

  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "").trim() || undefined,
    storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET ?? "").trim() || undefined,
  };
}

const config = readConfig();

/**
 * Firebase client initialization only.
 *
 * The Firebase web configuration identifies the project; it is not an admin
 * credential. Access control must be enforced by Firestore Security Rules.
 * Never place service-account credentials or Admin SDK secrets in VITE_* vars.
 */
export const firebaseConfigured = config !== null;

export const firebaseApp: FirebaseApp | null = config
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const firestore: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

export function requireFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!firebaseApp || !firebaseAuth || !firestore) {
    throw new Error(
      "FIREBASE NÃO CONFIGURADO. Defina VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID e VITE_FIREBASE_APP_ID no ambiente de compilação."
    );
  }
  return { app: firebaseApp, auth: firebaseAuth, db: firestore };
}
