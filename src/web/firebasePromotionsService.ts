import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type PromotionStatus = "active" | "suspended" | "closed";
export interface Promotion {
  id: string; name: string; category: string; benefit: string; eligible: string;
  conditions: string; startDate: string; endDate: string; status: PromotionStatus;
  createdAt?: unknown; updatedAt?: unknown; createdByUid?: string; updatedByUid?: string; createdByName?: string; updatedByName?: string; lastNotificationId?: string; ownerSectorId?: string; ownerContactId?: string;
}

const legacyRef = () => {
  const { db } = requireFirebase();
  return doc(db, "sharedPromotions", "current");
};

export function initialPromotions(): Promotion[] {
  return [
    { id:"PROMO-SOLUCOES", name:"SOLUÇÕES", category:"Produtos", benefit:"Pro rata grátis para todos os produtos elegíveis.", eligible:"Nobreak; Câmera; Mesh; Pacote avulso", conditions:"Benefício de pro rata grátis para todos os produtos mencionados.", startDate:"", endDate:"2026-10-31", status:"active" },
    { id:"PROMO-CHIP", name:"CHIP", category:"Telefonia", benefit:"Valor promocional de R$ 12,00.", eligible:"Chip", conditions:"Valor promocional informado pela campanha.", startDate:"", endDate:"2026-10-31", status:"active" },
    { id:"PROMO-REATIVACAO", name:"REATIVAÇÃO", category:"Retenção", benefit:"Abono integral dos débitos de faturas em aberto.", eligible:"Clientes com serviços cancelados", conditions:"Mediante reativação bem-sucedida do plano e cumprimento das condições da campanha.", startDate:"", endDate:"2026-10-31", status:"active" },
    { id:"PROMO-ATIVACAO-NOVO-PONTO", name:"ATIVAÇÃO E NOVO PONTO", category:"Fibra", benefit:"3 meses com 50% de desconto.", eligible:"Planos de fibra ou fibra + streaming", conditions:"Permanência mínima de 12 meses.", startDate:"", endDate:"2026-10-31", status:"active" },
  ];
}

function validatePromotions(value: unknown): Promotion[] {
  if (!Array.isArray(value)) throw new Error("O CATÁLOGO DE PROMOÇÕES ESTÁ INVÁLIDO.");
  return value.map((item:any) => {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) throw new Error("EXISTE UMA PROMOÇÃO COM IDENTIFICAÇÃO OU NOME INVÁLIDO.");
    const status:PromotionStatus = item.status === "suspended" || item.status === "closed" ? item.status : "active";
    const startDate = typeof item.startDate === "string" ? item.startDate : "";
    const endDate = typeof item.endDate === "string" ? item.endDate : "";
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) throw new Error("AS DATAS DA PROMOÇÃO DEVEM ESTAR NO FORMATO VÁLIDO.");
    if (startDate && endDate && endDate < startDate) throw new Error("A DATA FINAL NÃO PODE SER ANTERIOR À DATA INICIAL.");
    return { id:item.id, name:item.name.trim(), category:String(item.category??"").trim(), benefit:String(item.benefit??""), eligible:String(item.eligible??""), conditions:String(item.conditions??""), startDate, endDate, status, ...(item.createdAt !== undefined ? {createdAt:item.createdAt} : {}), ...(item.updatedAt !== undefined ? {updatedAt:item.updatedAt} : {}), ...(typeof item.createdByUid === "string" ? {createdByUid:item.createdByUid} : {}), ...(typeof item.updatedByUid === "string" ? {updatedByUid:item.updatedByUid} : {}), ...(typeof item.createdByName === "string" ? {createdByName:item.createdByName} : {}), ...(typeof item.updatedByName === "string" ? {updatedByName:item.updatedByName} : {}), ...(typeof item.lastNotificationId === "string" ? {lastNotificationId:item.lastNotificationId} : {}), ...(typeof item.ownerSectorId === "string" ? {ownerSectorId:item.ownerSectorId} : {}), ...(typeof item.ownerContactId === "string" ? {ownerContactId:item.ownerContactId} : {}) };
  });
}

export async function canCurrentUserManagePromotions(): Promise<boolean> {
  const {auth,db}=requireFirebase();
  const user=auth.currentUser;
  if(!user) return false;
  const [userSnapshot,permissionSnapshot]=await Promise.all([
    getDoc(doc(db,"users",user.uid)),
    getDoc(doc(db,"featurePermissions","promotions")),
  ]);
  if(!userSnapshot.exists()) return false;
  const profile=userSnapshot.data();
  if(profile.status!=="approved") return false;
  if(profile.role==="admin"||profile.isSupervisor===true) return true;
  if(!permissionSnapshot.exists()) return false;
  const permission=permissionSnapshot.data();
  return permission.enabled===true
    && ((Array.isArray(permission.wholeSectorIds)&&permission.wholeSectorIds.includes(profile.sectorId))
      || (Array.isArray(permission.contactIds)&&permission.contactIds.includes(profile.contactId))
      || (Array.isArray(permission.agentIds)&&permission.agentIds.includes(user.uid)));
}

export async function loadPromotions(): Promise<Promotion[]> {
  const {db}=requireFirebase();
  const [snapshot,legacy]=await Promise.all([
    getDocs(collection(db,"sharedPromotions")),
    getDoc(legacyRef()),
  ]);
  const merged=new Map<string,Promotion>();
  if(legacy.exists()) {
    const data=legacy.data();
    if(data.schemaVersion!==1) throw new Error("A VERSÃO DO CATÁLOGO DE PROMOÇÕES É INVÁLIDA.");
    for(const item of validatePromotions(data.promotions)) merged.set(item.id,item);
  }
  // Registros individuais prevalecem sobre a versão legada, sem ocultar
  // campanhas históricas que ainda não foram migradas para documentos próprios.
  for(const snapshotItem of snapshot.docs) {
    if(snapshotItem.id==="current") continue;
    const item=validatePromotions([{id:snapshotItem.id,...snapshotItem.data()}])[0];
    merged.set(item.id,item);
  }
  return merged.size ? [...merged.values()] : initialPromotions();
}

export async function savePromotions(promotions: Promotion[]): Promise<void> {
  const {auth,db}=requireFirebase();
  const user=auth.currentUser;
  if(!user) throw new Error("FAÇA LOGIN PARA GERENCIAR AS PROMOÇÕES.");
  const [userSnapshot,permissionSnapshot,recordsSnapshot,legacySnapshot]=await Promise.all([
    getDoc(doc(db,"users",user.uid)),
    getDoc(doc(db,"featurePermissions","promotions")),
    getDocs(collection(db,"sharedPromotions")),
    getDoc(legacyRef()),
  ]);
  const userData=userSnapshot.exists()?userSnapshot.data():null;
  if(userData?.status!=="approved") throw new Error("SOMENTE COLABORADORES APROVADOS PODEM PUBLICAR PROMOÇÕES.");
  const manager=userData.role==="admin"||userData.isSupervisor===true;
  const permission=permissionSnapshot.exists()?permissionSnapshot.data():null;
  const publisher=permission?.enabled===true && (
    (Array.isArray(permission.wholeSectorIds)&&permission.wholeSectorIds.includes(userData.sectorId))
    || (Array.isArray(permission.contactIds)&&permission.contactIds.includes(userData.contactId))
    || (Array.isArray(permission.agentIds)&&permission.agentIds.includes(user.uid))
  );
  if(!manager&&!publisher) throw new Error("VOCÊ NÃO POSSUI PERMISSÃO PARA CADASTRAR PROMOÇÕES.");
  const validated=validatePromotions(promotions);
  const ids=new Set<string>();
  for(const item of validated){if(ids.has(item.id))throw new Error("EXISTE UMA PROMOÇÃO COM ID DUPLICADO.");ids.add(item.id);}
  const previousById=new Map<string,Promotion>();
  if(legacySnapshot.exists()) {
    const legacyData=legacySnapshot.data();
    if(legacyData.schemaVersion!==1) throw new Error("A VERSÃO DO CATÁLOGO DE PROMOÇÕES É INVÁLIDA.");
    for(const item of validatePromotions(legacyData.promotions)) previousById.set(item.id,item);
  }
  // Os documentos individuais têm prioridade, mas não eliminam o histórico legado.
  for(const snapshotItem of recordsSnapshot.docs) {
    if(snapshotItem.id==="current") continue;
    const item=validatePromotions([{id:snapshotItem.id,...snapshotItem.data()}])[0];
    previousById.set(item.id,item);
  }
  const todayBrazil=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const eligibleToday=(item:Promotion)=>(!item.startDate||item.startDate<=todayBrazil)&&(!item.endDate||item.endDate>=todayBrazil);
  for(const item of validated){
    const old=previousById.get(item.id);
    if(!manager && !publisher) throw new Error("VOCÊ NÃO POSSUI PERMISSÃO PARA ALTERAR PROMOÇÕES.");
    if(!manager && !old && item.id.startsWith("PROMO-")) continue;
    const changed= !old || ["name","category","benefit","eligible","conditions","startDate","endDate","status"]
      .some(key=>String((old as any)?.[key]??"")!==String((item as any)[key]??""));
    if(!changed) continue;

    const batch=writeBatch(db);
    const ref=doc(db,"sharedPromotions",item.id);
    const now=serverTimestamp();
    const shouldNotify=(!old&&item.status==="active"&&eligibleToday(item))
      || (old&&item.status==="closed"&&old.status!=="closed");
    const notificationRef=shouldNotify?doc(collection(db,"sharedNotifications")):null;
    batch.set(ref,{
      ...item,
      ...(notificationRef?{lastNotificationId:notificationRef.id}:{}),
      createdByUid:old?.createdByUid??user.uid,
      createdByName:old?.createdByName??String(userData.agent??user.displayName??user.email??user.uid),
      ...(old?.ownerSectorId ? {ownerSectorId:old.ownerSectorId} : (!old?.createdByUid ? {ownerSectorId:String(userData.sectorId??"")} : {})),
      ...(old?.ownerContactId ? {ownerContactId:old.ownerContactId} : (!old?.createdByUid ? {ownerContactId:String(userData.contactId??"")} : {})),
      createdAt:old?.createdAt??now,
      updatedByUid:user.uid,
      updatedByName:String(userData.agent??user.displayName??user.email??user.uid),
      updatedAt:now,
    });
    if(notificationRef){
      const statusText=item.status==="closed"?"Encerrado":"Em Andamento";
      batch.set(notificationRef,{
        category:"promocoes",
        message:`Promoção - ${item.name} - ${statusText}`,
        target:"promocoes",
        referenceId:item.id,
        createdByUid:user.uid,
        createdAt:now,
      });
    }
    await batch.commit();
  }
}
