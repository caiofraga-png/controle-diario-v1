import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type AttendanceRow = {
  id: string;
  ticket: string;
  canal: string;
  codigo: string;
  nome: string;
  tipo: string;
  resolvido: string;
  subtipo: string;
  motivoResolucao: string;
  ownerUid: string;
  createdAt?: unknown;
};

function attendanceCollection() {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("FAÇA LOGIN PARA SALVAR O ATENDIMENTO.");
  return collection(db, "users", user.uid, "attendanceRows");
}

export async function saveAttendanceRow(input: Omit<AttendanceRow, "id" | "ownerUid" | "createdAt">): Promise<void> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user || !user.emailVerified) throw new Error("FAÇA LOGIN COM UMA CONTA EMPRESARIAL VERIFICADA.");
  const userRef = doc(db, "users", user.uid);
  const { getDoc } = await import("firebase/firestore");
  const profile = await getDoc(userRef);
  if (!profile.exists() || profile.data().status !== "approved") throw new Error("SOMENTE COLABORADORES APROVADOS PODEM SALVAR ATENDIMENTOS.");
  const ref = doc(attendanceCollection());
  await setDoc(ref, { ...input, ownerUid: user.uid, createdAt: serverTimestamp() });
}

export function subscribeAttendanceRows(callback: (rows: AttendanceRow[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const q = query(attendanceCollection(), orderBy("createdAt", "desc"));
  return onSnapshot(q, snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as AttendanceRow))), error => onError?.(error));
}
