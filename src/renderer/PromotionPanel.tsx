import { useEffect, useMemo, useState } from "react";
import { canCurrentUserManagePromotions } from "../web/firebasePromotionsService";
import AttachmentPanel from "./AttachmentPanel";

type Promotion = {
  id: string; name?: string; category?: string; benefit?: string; eligible?: string;
  conditions?: string; startDate?: string; endDate?: string; status?: string;
  [key: string]: unknown;
};
type Props = { promotions: Promotion[]; message?: string; canManage: boolean; onSave: (items: Promotion[]) => Promise<void> };
const emptyPromotion = (): Promotion => ({ id: crypto.randomUUID(), name:"", category:"", benefit:"", eligible:"", conditions:"", startDate:"", endDate:"", status:"active" });

function todayBrazil() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const get = (key:string) => parts.find(part=>part.type===key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function dateLabel(value?:string) {
  if (!value) return "Sem data final de validade";
  const [year,month,day] = value.split("-");
  return `Validade: ${day}/${month}/${year}`;
}

export default function PromotionPanel({ promotions, message, canManage, onSave }:Props) {\n  const [canPublish,setCanPublish] = useState(false);\n  useEffect(()=>{let active=true; void canCurrentUserManagePromotions().then(value=>{if(active)setCanPublish(value)}).catch(()=>{if(active)setCanPublish(false)}); return ()=>{active=false}},[]);\n  const canEdit = canManage || canPublish;
  const [tab,setTab] = useState<"ongoing"|"completed">("ongoing");
  const [form,setForm] = useState<Promotion|null>(null);
  const [busy,setBusy] = useState(false);
  const [localMessage,setLocalMessage] = useState("");
  const today = todayBrazil();
  const classified = useMemo(() => ({
    ongoing: promotions.filter(item => item.status !== "closed" && (!item.endDate || item.endDate >= today)),
    completed: promotions.filter(item => item.status === "closed" || Boolean(item.endDate && item.endDate < today))
  }),[promotions,today]);
  function update(key:keyof Promotion,value:unknown) { setForm(current=>current?{...current,[key]:value}:current); }
  async function save() {
    if (!form) return;
    if (!String(form.name??"").trim()) { setLocalMessage("INFORME O NOME DA PROMOÇÃO."); return; }
    if (!String(form.benefit??"").trim()) { setLocalMessage("INFORME O BENEFÍCIO DA PROMOÇÃO."); return; }
    if (form.startDate && form.endDate && String(form.endDate)<String(form.startDate)) { setLocalMessage("A DATA FINAL NÃO PODE SER ANTERIOR À DATA INICIAL."); return; }
    const exists=promotions.some(item=>item.id===form.id);
    const next=exists?promotions.map(item=>item.id===form.id?form:item):[...promotions,form];
    setBusy(true); setLocalMessage("");
    try { await onSave(next); setForm(null); setTab(form.status==="closed"?"completed":"ongoing"); setLocalMessage("PROMOÇÃO SALVA COM SUCESSO."); }
    catch(error) { setLocalMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL SALVAR A PROMOÇÃO."); }
    finally { setBusy(false); }
  }
  async function changeStatus(item:Promotion,status:"active"|"closed") {
    setBusy(true); setLocalMessage("");
    try { await onSave(promotions.map(p=>p.id===item.id?{...p,status}:p)); setLocalMessage("STATUS DA PROMOÇÃO ATUALIZADO."); }
    catch(error) { setLocalMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL ATUALIZAR A PROMOÇÃO."); }
    finally { setBusy(false); }
  }
  const items=tab==="ongoing"?classified.ongoing:classified.completed;
  return <section className="maintenance-workspace promotions-workspace">
    <div className="workspace-intro maintenance-intro"><div><h2>Promoções</h2><p>Consulte benefícios, produtos elegíveis e condições comerciais das promoções em andamento e concluídas.</p></div>{canPublish && !form && tab === "ongoing" && <button className="primary maintenance-new-button" type="button" onClick={()=>{setForm(emptyPromotion());setLocalMessage("");}}>＋ NOVA PROMOÇÃO</button>}</div>
    {(localMessage||message)&&<p className="system-message">{localMessage||message}</p>}
    <div className="maintenance-view-tabs" role="tablist" aria-label="Situação das promoções">
      <button type="button" className={tab==="ongoing"?"active":""} onClick={()=>{setTab("ongoing");setForm(null);}}>EM ANDAMENTO <span>{classified.ongoing.length}</span></button>
      <button type="button" className={tab==="completed"?"active":""} onClick={()=>{setTab("completed");setForm(null);}}>CONCLUÍDAS / HISTÓRICO <span>{classified.completed.length}</span></button>
    </div>
    {form?<div className="maintenance-form-card"><div className="maintenance-section-heading"><div><h3>{promotions.some(item=>item.id===form.id)?"EDITAR PROMOÇÃO":"CADASTRAR NOVA PROMOÇÃO"}</h3><p>Preencha as informações e salve para atualizar as promoções disponíveis.</p></div></div><div className="maintenance-form">
      <label>NOME DA PROMOÇÃO<input value={String(form.name??"")} onChange={e=>update("name",e.target.value)}/></label>
      <label>CATEGORIA<input value={String(form.category??"")} onChange={e=>update("category",e.target.value)}/></label>
      <label>BENEFÍCIO<textarea rows={3} value={String(form.benefit??"")} onChange={e=>update("benefit",e.target.value)}/></label>
      <label>PRODUTOS / PLANOS ELEGÍVEIS<textarea rows={2} value={String(form.eligible??"")} onChange={e=>update("eligible",e.target.value)}/></label>
      <label>CONDIÇÕES<textarea rows={4} value={String(form.conditions??"")} onChange={e=>update("conditions",e.target.value)}/></label>
      <div className="maintenance-form-grid">
        <label>DATA INICIAL<input type="date" value={String(form.startDate??"")} onChange={e=>update("startDate",e.target.value)}/></label>
        <label>DATA FINAL<input type="date" value={String(form.endDate??"")} onChange={e=>update("endDate",e.target.value)}/></label>
      </div>
      <AttachmentPanel targetType="promotion" targetId={form.id} canUpload={canManage} />
      <label>STATUS<select value={String(form.status??"active")} onChange={e=>update("status",e.target.value)}><option value="active">EM ANDAMENTO</option><option value="suspended">SUSPENSA</option><option value="closed">CONCLUÍDA</option></select></label>
      <div className="maintenance-form-actions"><button type="button" className="secondary" onClick={()=>setForm(null)}>CANCELAR</button><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>SALVAR PROMOÇÃO</button></div>
    </div></div>:<>
      <div className="promotions-grid">{items.map(item=><article className="maintenance-card promotion-card" key={item.id}>
        <div className="promotion-card-head"><span>{item.category||"CAMPANHA"}</span><strong>{item.name}</strong></div>
        <div className="promotion-benefit">{item.benefit}</div>
        {item.eligible&&<div className="promotion-detail"><strong>PRODUTOS / PLANOS ELEGÍVEIS</strong><p>{item.eligible}</p></div>}
        {item.conditions&&<div className="promotion-detail"><strong>CONDIÇÕES</strong><p>{item.conditions}</p></div>}
        <div className="promotion-validity">{dateLabel(item.endDate)}</div>\n        <div className="maintenance-card-meta">Criado por: {String(item.createdByName??item.createdByUid??"Não informado")} · Última alteração por: {String(item.updatedByName??item.updatedByUid??"Não informado")}</div>
        {item.status==="suspended"&&<div className="promotion-status suspended">SUSPENSA</div>}
        {item.status==="closed"&&<div className="promotion-status closed">CONCLUÍDA</div>}
        {canEdit&&<div className="maintenance-card-actions"><button type="button" className="secondary" onClick={()=>{setForm({...item});setLocalMessage("");}}>EDITAR</button>{item.status!=="closed"?<button type="button" className="primary" disabled={busy} onClick={()=>void changeStatus(item,"closed")}>CONCLUIR</button>:<button type="button" className="primary" disabled={busy} onClick={()=>void changeStatus(item,"active")}>REABRIR</button>}</div>}
      </article>)}</div>
      {items.length===0&&<div className="maintenance-empty">{tab==="ongoing"?"NÃO HÁ PROMOÇÕES EM ANDAMENTO." :"NÃO HÁ PROMOÇÕES CONCLUÍDAS NO HISTÓRICO."}</div>}
    </>}
  </section>;
}
