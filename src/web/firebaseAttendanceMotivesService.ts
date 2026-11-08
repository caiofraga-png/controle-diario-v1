import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export const DEFAULT_ATTENDANCE_MOTIVES = [
  "Área Falha",
  "Abertura Visita",
  "Confirmação de Visita",
  "Resolvido",
  "Retorno Telefônico Gerado",
];

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) throw new Error("A LISTA DE MOTIVOS É INVÁLIDA.");
  const result = values.map(value => String(value).trim()).filter(Boolean);
  if (result.length > 50 || result.some(value => value.length > 120)) throw new Error("A LISTA PODE TER ATÉ 50 RESPOSTAS, COM 120 CARACTERES CADA.");
  const unique = new Set(result.map(value => value.toLocaleLowerCase("pt-BR")));
  if (unique.size !== result.length) throw new Error("NÃO REPITA RESPOSTAS NA LISTA.");
  return result;
}
const ref = () => {
  const { db } = requireFirebase();
  return doc(db, "settings", "attendanceMotives");
};
export async function loadAttendanceMotives(): Promise<string[]> {
  const snapshot = await getDoc(ref());
  if (!snapshot.exists()) return [...DEFAULT_ATTENDANCE_MOTIVES];
  return clean(snapshot.data().items ?? DEFAULT_ATTENDANCE_MOTIVES);
}
export async function saveAttendanceMotives(values: string[]): Promise<void> {
  const { auth } = requireFirebase();
  if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA CONTINUAR.");
  await setDoc(ref(), { schemaVersion: 1, items: clean(values), updatedByUid: auth.currentUser.uid, updatedAt: serverTimestamp() });
}
