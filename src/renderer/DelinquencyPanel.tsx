import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";

type Notice = {
  id:string; type:"reducao"|"suspensao"; date:string; title:string;
  dueDate:string; customerCount:number; overdueDays:number; validUntil:string;
  status:"ongoing"|"completed"; createdByUid:string; createdAt?:unknown;
};
type Draft = Omit<Notice,"id"|"createdByUid"|"createdAt">;
const blank = ():Draft => ({type:"reducao",date:new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}),title:"",dueDate:"",customerCount:0,overdueDays:0,validUntil:"",status:"ongoing"});
const dateLabel=(value:string)=>value?value.split("-").reverse().join("/"):"—";

export default function DelinquencyPanel(){
  const [items,setItems]=useState<Notice[]>([]);
  const [tab,setTab]=useState<"ongoing"|"completed">("ongoing");
  const [draft,setDraft]=useState<Draft|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [canManage,setCanManage]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const {auth,db}=requireFirebase();
    const user=auth.currentUser;
    if(!user){setLoading(false);return;}
    let stop:Unsubscribe|undefined;
    void (async()=>{
      try{
        const {getDoc,doc}=await import("firebase/firestore");
        const profileSnap=await getDoc(doc(db,"users",user.uid));
        const profile=profileSnap.exists()?profileSnap.data():{};
        const manager=profile.role==="admin"||profile.isSupervisor===true;
        let permitted=manager;
        if(!manager){
          const permissionSnap=await getDoc(doc(db,"featurePermissions","delinquency"));
          const permission=permissionSnap.exists()?permissionSnap.data():{};
          permitted=profile.status==="approved"&&permission.enabled===true&&(
            (permission.wholeSectorIds??permission.sectorIds??[]).includes(profile.sectorId)||
            (permission.contactIds??[]).includes(profile.contactId)||
            (permission.agentIds??[]).includes(user.uid));
        }
        setCanManage(permitted);
      }catch(error){setMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL VERIFICAR AS PERMISSÕES.");}
      const q=query(collection(db,"delinquencyNotices"),orderBy("createdAt","desc"));
      stop=onSnapshot(q,snapshot=>{setItems(snapshot.docs.map(item=>({id:item.id,...item.data()} as Notice)));setLoading(false);},error=>{setMessage(error.message);setLoading(false);});
    })();
    return ()=>stop?.();
  },[]);
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  const classified=useMemo(()=>({
    ongoing:items.filter(item=>item.status!=="completed"&&(!item.validUntil||item.validUntil>=today)),
    completed:items.filter(item=>item.status==="completed"||Boolean(item.validUntil&&item.validUntil<today))
  }),[items,today]);
  const visible=tab==="ongoing"?classified.ongoing:classified.completed;
  function update<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(current=>current?{...current,[key]:value}:current);}
  async function save(){
    if(!draft)return;
    if(!draft.title.trim()){setMessage("INFORME O TÍTULO DO AVISO.");return;}
    if(!draft.date||!draft.dueDate||!draft.validUntil){setMessage("INFORME A DATA DO AVISO, O VENCIMENTO E O PRAZO.");return;}
    if(draft.validUntil<draft.date){setMessage("O PRAZO DO AVISO NÃO PODE TERMINAR ANTES DA DATA DE PUBLICAÇÃO.");return;}
    if(draft.customerCount<0||draft.overdueDays<0){setMessage("QUANTIDADES E DIAS NÃO PODEM SER NEGATIVOS.");return;}
    const {auth,db}=requireFirebase();if(!auth.currentUser)throw new Error("FAÇA LOGIN PARA PUBLICAR UM AVISO.");
    setBusy(true);setMessage("");
    try{
      const batch=writeBatch(db);
      const noticeRef=editingId?doc(db,"delinquencyNotices",editingId):doc(collection(db,"delinquencyNotices"));
      const notificationRef=doc(collection(db,"sharedNotifications"));
      const payload={...draft,updatedByUid:auth.currentUser.uid,updatedAt:serverTimestamp()};
      if(editingId)batch.update(noticeRef,payload);
      else batch.set(noticeRef,{...payload,notificationId:notificationRef.id,createdByUid:auth.currentUser.uid,createdAt:serverTimestamp()});
      if(!editingId)batch.set(notificationRef,{category:"cobranca",message:"Novo alerta de inadimplência",target:"inadimplencia",noticeId:noticeRef.id,createdByUid:auth.currentUser.uid,createdAt:serverTimestamp()});
      await batch.commit();
      setDraft(null);setEditingId(null);setTab(draft.status==="completed"?"completed":"ongoing");setMessage(editingId?"AVISO ATUALIZADO.":"AVISO PUBLICADO E NOTIFICAÇÃO ENVIADA.");
    }catch(error){setMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL SALVAR O AVISO.");}
    finally{setBusy(false);}
  }
  async function changeStatus(item:Notice,status:"ongoing"|"completed"){
    const {auth,db}=requireFirebase();if(!auth.currentUser)return;
    setBusy(true);setMessage("");
    try{const batch=writeBatch(db);batch.update(doc(db,"delinquencyNotices",item.id),{status,updatedByUid:auth.currentUser.uid,updatedAt:serverTimestamp()});await batch.commit();setMessage(status==="completed"?"AVISO CONCLUÍDO.":"AVISO REATIVADO.");}
    catch(error){setMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL ATUALIZAR O AVISO.");}
    finally{setBusy(false);}
  }
  return <section className="maintenance-workspace delinquency-workspace">
    <div className="workspace-intro maintenance-intro"><div><h2>Inadimplência</h2><p>Acompanhe os avisos de redução e suspensão e consulte o histórico de comunicados.</p></div>{canManage&&tab==="ongoing"&&!draft&&<button className="primary maintenance-new-button" onClick={()=>{setDraft(blank());setEditingId(null);setMessage("");}}>＋ NOVO AVISO</button>}</div>
    {message&&<p className="system-message" role="status">{message}</p>}
    <div className="maintenance-view-tabs" role="tablist" aria-label="Situação dos avisos">
      <button className={tab==="ongoing"?"active":""} onClick={()=>{setTab("ongoing");setDraft(null);}}>EM ANDAMENTO <span>{classified.ongoing.length}</span></button>
      <button className={tab==="completed"?"active":""} onClick={()=>{setTab("completed");setDraft(null);}}>CONCLUÍDOS / HISTÓRICO <span>{classified.completed.length}</span></button>
    </div>
    {loading?<div className="maintenance-empty">CARREGANDO AVISOS…</div>:draft?<div className="maintenance-form-card">
      <div className="maintenance-section-heading"><div><h3>{editingId?"EDITAR AVISO":"CADASTRAR NOVO AVISO"}</h3><p>Preencha os dados do comunicado de inadimplência.</p></div></div>
      <div className="maintenance-form">
        <label>TIPO DE AVISO<select value={draft.type} onChange={e=>update("type",e.target.value as Draft["type"])}><option value="reducao">REDUÇÃO</option><option value="suspensao">SUSPENSÃO</option></select></label>
        <label>TÍTULO<input value={draft.title} onChange={e=>update("title",e.target.value)} placeholder="Título do aviso"/></label>
        <div className="maintenance-form-grid">
          <label>DATA DO AVISO<input type="date" value={draft.date} onChange={e=>update("date",e.target.value)}/></label>
          <label>VENCIMENTO<input type="date" value={draft.dueDate} onChange={e=>update("dueDate",e.target.value)}/></label>
        </div>
        <div className="maintenance-form-grid">
          <label>QUANTIDADE DE CLIENTES<input type="number" min="0" step="1" value={draft.customerCount} onChange={e=>update("customerCount",Number(e.target.value))}/></label>
          <label>DIAS VENCIDOS<input type="number" min="0" step="1" value={draft.overdueDays} onChange={e=>update("overdueDays",Number(e.target.value))}/></label>
        </div>
        <label>PRAZO DO AVISO<input type="date" value={draft.validUntil} onChange={e=>update("validUntil",e.target.value)}/></label>
        <label>SITUAÇÃO<select value={draft.status} onChange={e=>update("status",e.target.value as Draft["status"])}><option value="ongoing">EM ANDAMENTO</option><option value="completed">CONCLUÍDO</option></select></label>
        <div className="maintenance-form-actions"><button className="secondary" type="button" onClick={()=>{setDraft(null);setEditingId(null);}}>CANCELAR</button><button className="primary" type="button" disabled={busy} onClick={()=>void save()}>PUBLICAR AVISO</button></div>
      </div>
    </div>:<div className="delinquency-grid">{visible.map(item=><article className="maintenance-card delinquency-card" key={item.id}>
      <div className="promotion-card-head"><span>{item.type==="reducao"?"REDUÇÃO":"SUSPENSÃO"}</span><strong>{item.title}</strong></div>
      <div className="delinquency-metrics"><div><small>CLIENTES</small><strong>{item.customerCount}</strong></div><div><small>DIAS VENCIDOS</small><strong>{item.overdueDays}</strong></div></div>
      <div className="promotion-detail"><strong>DATA DO AVISO</strong><p>{dateLabel(item.date)}</p></div><div className="promotion-detail"><strong>VENCIMENTO</strong><p>{dateLabel(item.dueDate)}</p></div>
      <div className="promotion-validity">AVISO VÁLIDO ATÉ {dateLabel(item.validUntil)}</div>
      {canManage&&<div className="maintenance-card-actions"><button className="secondary" onClick={()=>{setDraft({type:item.type,date:item.date,title:item.title,dueDate:item.dueDate,customerCount:item.customerCount,overdueDays:item.overdueDays,validUntil:item.validUntil,status:item.status});setEditingId(item.id);}}>EDITAR</button>{item.status!=="completed"?<button className="primary" disabled={busy} onClick={()=>void changeStatus(item,"completed")}>CONCLUIR</button>:<button className="primary" disabled={busy} onClick={()=>void changeStatus(item,"ongoing")}>REABRIR</button>}</div>}
    </article>)}{visible.length===0&&<div className="maintenance-empty">{tab==="ongoing"?"NÃO HÁ AVISOS DE INADIMPLÊNCIA EM ANDAMENTO.":"NÃO HÁ AVISOS CONCLUÍDOS NO HISTÓRICO."}</div>}</div>}
  </section>;
}
