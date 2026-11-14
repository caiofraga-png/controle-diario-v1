import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";

type Scope = { enabled:boolean; wholeSectorIds:string[]; contactIds:string[]; agentIds:string[] };
type Sector = {id:string;name:string;active:boolean};
type Contact = {id:string;name:string;sectorId:string;active:boolean};
type Agent = {uid:string;agent:string;login:string;sectorId:string;contactId:string;status:string};
type Selection = {sector:string;contact:string;agent:string};

const types = [
  {id:"longCalls",title:"LIGAÇÕES PROLONGADAS"},
  {id:"googleChat",title:"SOLICITAÇÕES NO GOOGLE CHAT"},
  {id:"otherHelp",title:"OUTROS PEDIDOS DE AJUDA"},
] as const;
const emptyScope = ():Scope => ({enabled:false,wholeSectorIds:[],contactIds:[],agentIds:[]});
const emptySelection = ():Selection => ({sector:"",contact:"",agent:""});

export default function OverviewNoticesPermissionPanel(){
  const [sectors,setSectors]=useState<Sector[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [agents,setAgents]=useState<Agent[]>([]);
  const [scopes,setScopes]=useState<Record<string,Scope>>({longCalls:emptyScope(),googleChat:emptyScope(),otherHelp:emptyScope()});
  const [selections,setSelections]=useState<Record<string,Selection>>({longCalls:emptySelection(),googleChat:emptySelection(),otherHelp:emptySelection()});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{let active=true;void(async()=>{
    try{
      const {db}=requireFirebase();
      const [ss,cs,ps,us]=await Promise.all([
        getDocs(query(collection(db,"organizationSectors"),orderBy("name"))),
        getDocs(query(collection(db,"organizationContacts"),orderBy("name"))),
        getDoc(doc(db,"featurePermissions","overviewNotices")),
        getDocs(collection(db,"users")),
      ]);
      if(!active)return;
      setSectors(ss.docs.map(x=>({id:x.id,...x.data()} as Sector)).filter(x=>x.active));
      setContacts(cs.docs.map(x=>({id:x.id,...x.data()} as Contact)).filter(x=>x.active));
      setAgents(us.docs.map(x=>({uid:x.id,agent:String(x.data().agent??""),login:String(x.data().login??""),sectorId:String(x.data().sectorId??""),contactId:String(x.data().contactId??""),status:String(x.data().status??"")})).filter(x=>x.status==="approved"&&x.agent&&x.sectorId&&x.contactId));
      if(ps.exists()){
        const saved=ps.data().notices??{};
        setScopes({longCalls:{...emptyScope(),...(saved.longCalls??{})},googleChat:{...emptyScope(),...(saved.googleChat??{})},otherHelp:{...emptyScope(),...(saved.otherHelp??{})}});
      }
    }catch(e){if(active)setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CARREGAR AS PERMISSÕES.");}
    finally{if(active)setLoading(false);}
  })();return()=>{active=false;}},[]);

  function update(type:string,patch:Partial<Scope>){setScopes(current=>({...current,[type]:{...current[type],...patch}}));}
  function updateSelection(type:string,patch:Partial<Selection>){setSelections(current=>({...current,[type]:{...current[type],...patch}}));}
  function toggle(list:string[],id:string,checked:boolean){return checked?[...new Set([...list,id])]:list.filter(x=>x!==id);}
  function toggleSector(type:string,id:string,checked:boolean){
    const scope=scopes[type];
    const childContacts=contacts.filter(x=>x.sectorId===id).map(x=>x.id);
    const childAgents=agents.filter(x=>x.sectorId===id).map(x=>x.uid);
    update(type,{wholeSectorIds:toggle(scope.wholeSectorIds,id,checked),...(checked?{contactIds:scope.contactIds.filter(x=>!childContacts.includes(x)),agentIds:scope.agentIds.filter(x=>!childAgents.includes(x))}:{})});
  }
  function toggleContact(type:string,id:string,checked:boolean){
    const scope=scopes[type];
    const childAgents=agents.filter(x=>x.contactId===id).map(x=>x.uid);
    update(type,{contactIds:toggle(scope.contactIds,id,checked),...(checked?{agentIds:scope.agentIds.filter(x=>!childAgents.includes(x))}:{})});
  }
  async function save(){
    setSaving(true);setMessage("");
    try{
      const {auth,db}=requireFirebase();if(!auth.currentUser)throw new Error("FAÇA LOGIN PARA ALTERAR AS PERMISSÕES.");
      const notices=Object.fromEntries(types.map(t=>{const s=scopes[t.id];return[t.id,{enabled:s.enabled,wholeSectorIds:s.wholeSectorIds,contactIds:s.contactIds,agentIds:s.agentIds}]}));
      await setDoc(doc(db,"featurePermissions","overviewNotices"),{schemaVersion:1,notices,updatedAt:serverTimestamp(),updatedByUid:auth.currentUser.uid});
      setMessage("PERMISSÕES DA ÁREA AVISOS SALVAS.");
    }catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR AS PERMISSÕES.");}
    finally{setSaving(false);}
  }

  return <section className="config-form maintenance-permission-panel">
    <h3>PERMISSÕES DE ACESSO AOS AVISOS DA VISÃO GERAL</h3>
    <p>Configure cada tipo de aviso separadamente. A autorização libera somente a visualização da área Avisos, sem conceder acesso às ferramentas de Supervisão.</p>
    {loading?<p>CARREGANDO PERMISSÕES…</p>:<>
      {types.map(type=>{
        const scope=scopes[type.id];
        const selected=selections[type.id];
        const visibleContacts=contacts.filter(x=>x.sectorId===selected.sector);
        const visibleAgents=agents.filter(x=>x.sectorId===selected.sector&&x.contactId===selected.contact);
        return <section key={type.id} className="config-form">
          <h4>{type.title}</h4>
          <label className="check-line"><input type="checkbox" checked={scope.enabled} onChange={e=>update(type.id,{enabled:e.target.checked})}/><span><strong>AVISO HABILITADO</strong><small>Permite que os colaboradores selecionados visualizem este cartão.</small></span></label>
          <h4>SELECIONAR AUTORIZADOS</h4>
          <label>SETOR
            <select value={selected.sector} onChange={e=>updateSelection(type.id,{sector:e.target.value,contact:"",agent:""})}>
              <option value="">Selecione um setor</option>
              {sectors.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {selected.sector&&<>
            <label className="check-line"><input type="checkbox" checked={scope.wholeSectorIds.includes(selected.sector)} onChange={e=>toggleSector(type.id,selected.sector,e.target.checked)}/><span>HABILITAR SETOR INTEIRO</span></label>
            {!scope.wholeSectorIds.includes(selected.sector)&&<label>CONTATO
              <select value={selected.contact} onChange={e=>updateSelection(type.id,{contact:e.target.value,agent:""})}>
                <option value="">Selecione um contato</option>
                {visibleContacts.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>}
          </>}
          {selected.contact&&!scope.wholeSectorIds.includes(selected.sector)&&<>
            <label className="check-line"><input type="checkbox" checked={scope.contactIds.includes(selected.contact)} onChange={e=>toggleContact(type.id,selected.contact,e.target.checked)}/><span>HABILITAR CONTATO INTEIRO</span></label>
            {!scope.contactIds.includes(selected.contact)&&<label>AGENTE
              <select value={selected.agent} onChange={e=>updateSelection(type.id,{agent:e.target.value})}>
                <option value="">Selecione um agente</option>
                {visibleAgents.map(x=><option key={x.uid} value={x.uid}>{x.agent}{x.login?" · "+x.login:""}</option>)}
              </select>
            </label>}
            {selected.agent&&!scope.contactIds.includes(selected.contact)&&<button type="button" onClick={()=>{update(type.id,{agentIds:toggle(scope.agentIds,selected.agent,true)});updateSelection(type.id,{agent:""});}}>ADICIONAR AGENTE</button>}
          </>}
          <div className="notification-permission-list">
            {scope.wholeSectorIds.map(id=><div key={id}>SETOR INTEIRO: {sectors.find(x=>x.id===id)?.name??id} <button type="button" onClick={()=>toggleSector(type.id,id,false)}>REMOVER</button></div>)}
            {scope.contactIds.map(id=><div key={id}>CONTATO INTEIRO: {contacts.find(x=>x.id===id)?.name??id} <button type="button" onClick={()=>toggleContact(type.id,id,false)}>REMOVER</button></div>)}
            {scope.agentIds.map(id=><div key={id}>AGENTE: {agents.find(x=>x.uid===id)?.agent??id} <button type="button" onClick={()=>update(type.id,{agentIds:scope.agentIds.filter(x=>x!==id)})}>REMOVER</button></div>)}
          </div>
        </section>;
      })}
      <div className="config-actions"><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"SALVANDO…":"SALVAR PERMISSÕES DOS AVISOS"}</button></div>
    </>}
    {message&&<p role="status" className="system-message">{message}</p>}
  </section>;
}
