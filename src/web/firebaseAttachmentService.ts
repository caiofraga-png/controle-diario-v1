import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type AttachmentTarget = "task-creation" | "task-roteiro";
export type SharedAttachment = { id:string; targetType:AttachmentTarget; targetId:string; name:string; mimeType:string; size:number; data:string; createdByUid:string; createdAt?:unknown };
export const MAX_ATTACHMENT_BYTES = 500 * 1024;
const ALLOWED_EXTENSIONS = new Set(["doc","docx","xlsx","pdf","png","jpg","jpeg","gif","webp"]);
function extension(name:string){ return name.split(".").pop()?.toLowerCase() ?? ""; }
export function validateAttachmentFile(file:File){
  if(!ALLOWED_EXTENSIONS.has(extension(file.name))) throw new Error("FORMATO NÃO PERMITIDO. USE DOC, DOCX, XLSX, PDF OU IMAGEM.");
  if(file.size<=0 || file.size>MAX_ATTACHMENT_BYTES) throw new Error("O ARQUIVO DEVE TER ATÉ 500 KiB.");
}
export function subscribeAttachments(targetType:AttachmentTarget,targetId:string,callback:(items:SharedAttachment[])=>void,onError?:(error:Error)=>void):Unsubscribe{
  const {db}=requireFirebase();
  const q=query(collection(db,"sharedAttachments"),where("targetType","==",targetType),where("targetId","==",targetId),orderBy("createdAt","desc"));
  return onSnapshot(q,s=>callback(s.docs.map(d=>({id:d.id,...d.data()} as SharedAttachment))),e=>onError?.(e));
}
export async function uploadAttachment(targetType:AttachmentTarget,targetId:string,file:File){
  validateAttachmentFile(file);
  const {auth,db}=requireFirebase(); const user=auth.currentUser;
  if(!user) throw new Error("FAÇA LOGIN PARA ANEXAR ARQUIVOS.");
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("NÃO FOI POSSÍVEL LER O ARQUIVO."));reader.onload=()=>resolve(String(reader.result).split(",")[1]??"");reader.readAsDataURL(file);});
  const ref=doc(collection(db,"sharedAttachments"));
  await setDoc(ref,{targetType,targetId,name:file.name,mimeType:file.type||"application/octet-stream",size:file.size,data,createdByUid:user.uid,createdAt:serverTimestamp()});
}
export async function removeAttachment(id:string){ const {db}=requireFirebase(); await deleteDoc(doc(db,"sharedAttachments",id)); }
export function downloadAttachment(item:SharedAttachment){
  const binary=atob(item.data); const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:item.mimeType||"application/octet-stream"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=item.name;anchor.click();URL.revokeObjectURL(url);
}
