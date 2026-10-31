import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type PromotionStatus = "active" | "suspended" | "closed";
export interface Promotion {
  id: string;
  name: string;
  category: string;
  benefit: string;
  eligible: string;
  conditions: string;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const promotionsRef = () => {
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
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) {
      throw new Error("EXISTE UMA PROMOÇÃO COM IDENTIFICAÇÃO OU NOME INVÁLIDO.");
    }
    const status:PromotionStatus = item.status === "suspended" || item.status === "closed" ? item.status : "active";
    const startDate = typeof item.startDate === "string" ? item.startDate : "";
    const endDate = typeof item.endDate === "string" ? item.endDate : "";
    if ((startDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)) || (endDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate))) {
      throw new Error("AS DATAS DA PROMOÇÃO DEVEM ESTAR NO FORMATO VÁLIDO.");
    }
    if (startDate && endDate && endDate < startDate) throw new Error("A DATA FINAL NÃO PODE SER ANTERIOR À DATA INICIAL.");
    return {
      id:item.id, name:item.name.trim(), category:String(item.category??"").trim(),
      benefit:String(item.benefit??""), eligible:String(item.eligible??""),
      conditions:String(item.conditions??""), startDate, endDate, status,
      createdAt:item.createdAt, updatedAt:item.updatedAt,
    };
  });
}

export async function loadPromotions(): Promise<Promotion[]> {
  const snapshot = await getDoc(promotionsRef());
  if (!snapshot.exists()) return initialPromotions();
  const data = snapshot.data();
  if (data.schemaVersion !== 1) throw new Error("A VERSÃO DO CATÁLOGO DE PROMOÇÕES É INVÁLIDA.");
  return validatePromotions(data.promotions);
}

export async function savePromotions(promotions: Promotion[]): Promise<void> {
  const { auth, db } = requireFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("FAÇA LOGIN PARA GERENCIAR AS PROMOÇÕES.");
  const userSnapshot = await getDoc(doc(db, "users", user.uid));
  const userData = userSnapshot.exists() ? userSnapshot.data() : null;
  if (userData?.status !== "approved" || (userData.role !== "admin" && userData.isSupervisor !== true)) {
    throw new Error("SOMENTE ADMINISTRADORES E SUPERVISORES PODEM GERENCIAR PROMOÇÕES.");
  }
  const validated = validatePromotions(promotions);
  const ids = new Set<string>();
  for (const item of validated) {
    if (ids.has(item.id)) throw new Error("EXISTE UMA PROMOÇÃO COM ID DUPLICADO.");
    ids.add(item.id);
  }
  await setDoc(promotionsRef(), {
    schemaVersion:1,
    promotions:validated.map(item=>({...item,updatedAt:serverTimestamp()})),
    updatedAt:serverTimestamp(),
    updatedByUid:user.uid,
  });
}
