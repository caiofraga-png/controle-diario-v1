import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

function normalizeSubtype(value: string) {
  const name = value.trim().replace(/\\s+/g, " ");
  if (!name) throw new Error("INFORME UM SUBTIPO VÁLIDO.");
  if (name.length > 80) throw new Error("O SUBTIPO DEVE TER ATÉ 80 CARACTERES.");
  return name;
}
function subtypeId(value: string) {
  return normalizeSubtype(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}
export async function ensureAttendanceSubtype(value: string) {
  const name = normalizeSubtype(value);
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA REGISTRAR O SUBTIPO.");
  const id = subtypeId(name);
  if (!id) throw new Error("O SUBTIPO INFORMADO É INVÁLIDO.");
  const ref = doc(db, "attendanceSubtypes", id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    if (existing.data().active === false) throw new Error("ESTE SUBTIPO ESTÁ DESATIVADO. ESCOLHA OUTRO OU SOLICITE À SUPERVISÃO.");
    return String(existing.data().name ?? name);
  }
  await setDoc(ref, { name, normalized: id, active: true, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
  return name;
}
export async function listAttendanceSubtypes() {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "attendanceSubtypes"), where("active", "==", true)));
  return snap.docs.map(item => ({ id: item.id, name: String(item.data().name ?? ""), active: item.data().active === true })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
export async function listAttendanceSubtypeCatalog() {
  const { db } = requireFirebase();
  const snap = await getDocs(collection(db, "attendanceSubtypes"));
  return snap.docs.map(item => ({ id: item.id, name: String(item.data().name ?? ""), active: item.data().active === true })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
export async function deactivateAttendanceSubtype(id: string) {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA CONTINUAR.");
  const { getDoc: readDoc, updateDoc } = await import("firebase/firestore");
  const user = await readDoc(doc(db, "users", auth.currentUser.uid));
  if (!user.exists() || (user.data().role !== "admin" && user.data().isSupervisor !== true)) throw new Error("SOMENTE ADMINISTRAÇÃO E SUPERVISÃO PODEM ADMINISTRAR SUBTIPOS.");
  const { doc: documentRef } = await import("firebase/firestore");
  const target = documentRef(db, "attendanceSubtypes", id);
  await updateDoc(target, { active: false, deactivatedAt: serverTimestamp(), deactivatedBy: auth.currentUser.uid });
}
