import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, type Unsubscribe, onSnapshot } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";
import { publishSharedNotification } from "./firebaseNotificationService";

export type MaintenanceStatus = "ongoing" | "completed";
export interface ExternalMaintenance {
  id: string; title: string; date: string; location: string; description: string;
  status: MaintenanceStatus; createdByUid: string; createdAt?: unknown;
  updatedByUid: string; updatedAt?: unknown;
}
export interface MaintenanceHistory {
  id: string; changedByUid: string; changedAt?: unknown;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}
async function currentUserCanManage(): Promise<boolean> {
  const {auth,db}=requireFirebase(); const user=auth.currentUser;
  if(!user) return false;
  const [u,p]=await Promise.all([getDoc(doc(db,"users",user.uid)),getDoc(doc(db,"featurePermissions","maintenance"))]);
  if(!u.exists()||!p.exists()) return false;
  const profile=u.data(), permission=p.data();
  if(profile.status!=="approved"||permission.enabled!==true) return false;
  const sectors=Array.isArray(permission.wholeSectorIds)?permission.wholeSectorIds:[];
  const contacts=Array.isArray(permission.contactIds)?permission.contactIds:[];
  const agents=Array.isArray(permission.agentIds)?permission.agentIds:[];
  return sectors.includes(profile.sectorId)||contacts.includes(profile.contactId)||agents.includes(user.uid);
}
export async function saveExternalMaintenance(input: Omit<ExternalMaintenance,"id"|"createdByUid"|"createdAt"|"updatedByUid"|"updatedAt">, id?:string):Promise<void>{
  const {auth,db}=requireFirebase(); const user=auth.currentUser;
  if(!user||!(await currentUserCanManage())) throw new Error("SEU SETOR, CONTATO OU USUÁRIO NÃO POSSUI PERMISSÃO PARA EDITAR MANUTENÇÕES.");
  const now=serverTimestamp();
  if(id){
    const ref=doc(db,"externalMaintenances",id); const old=await getDoc(ref);
    if(!old.exists()) throw new Error("MANUTENÇÃO NÃO ENCONTRADA.");
    const before=old.data();
    const changed=["title","date","location","description","status"].some(key=>before[key]!==input[key as keyof typeof input]);
    if(!changed) return;
    await updateDoc(ref,{...input,updatedByUid:user.uid,updatedAt:now});
    const historyRef=doc(collection(db,"externalMaintenances",id,"history"));
    await setDoc(historyRef,{changedByUid:user.uid,changedAt:now,before:{title:before.title,date:before.date,location:before.location,description:before.description,status:before.status},after:input});
  }else{
    const ref=doc(collection(db,"externalMaintenances"));
    await setDoc(ref,{...input,createdByUid:user.uid,createdAt:now,updatedByUid:user.uid,updatedAt:now});
    const historyRef=doc(collection(db,"externalMaintenances",ref.id,"history"));
    await setDoc(historyRef,{changedByUid:user.uid,changedAt:now,before:null,after:input});
  }
  const notificationRef=doc(collection(db,"sharedNotifications"));
  await setDoc(notificationRef,{category:"manutencoes",message:"Atualização de manutenção",target:"manutencoes",createdByUid:user.uid,createdAt:now});
}
export function subscribeExternalMaintenances(callback:(items:ExternalMaintenance[])=>void,onError?:(error:Error)=>void):Unsubscribe{
 const {db}=requireFirebase();return onSnapshot(query(collection(db,"externalMaintenances"),orderBy("updatedAt","desc")),s=>callback(s.docs.map(d=>({id:d.id,...d.data()} as ExternalMaintenance))),e=>onError?.(e));
}
export async function loadMaintenanceHistory(id:string):Promise<MaintenanceHistory[]>{
 const {db}=requireFirebase();const s=await getDocs(query(collection(db,"externalMaintenances",id,"history"),orderBy("changedAt","desc")));
 return s.docs.map(d=>({id:d.id,...d.data()} as MaintenanceHistory));
}
