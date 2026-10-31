/// <reference types="vite/client" />
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
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
 * Inicialização do Firebase no navegador.
 *
 * A configuração web identifica o projeto; não é uma credencial administrativa.
 * O controle de acesso deve ser aplicado pelas regras de segurança do Firestore.
 * Nunca coloque chaves de conta de serviço ou segredos do Admin SDK em variáveis VITE_*.
 */
export const firebaseConfigured = config !== null;

export const firebaseApp: FirebaseApp | null = config
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const firestore: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

/**
 * Mantém a sessão autenticada no armazenamento local do navegador.
 * O Firebase renova tokens quando possível; isso não impede uma nova autenticação
 * se o usuário sair, revogar o acesso, limpar os dados do navegador ou se uma
 * política corporativa exigir autenticação periódica.
 */
export const firebaseAuthPersistenceReady: Promise<void> = firebaseAuth
  ? setPersistence(firebaseAuth, browserLocalPersistence)
  : Promise.resolve();

export function requireFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!firebaseApp || !firebaseAuth || !firestore) {
    throw new Error(
      "FIREBASE NÃO CONFIGURADO. Defina VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID e VITE_FIREBASE_APP_ID no ambiente de compilação."
    );
  }
  return { app: firebaseApp, auth: firebaseAuth, db: firestore };
}
