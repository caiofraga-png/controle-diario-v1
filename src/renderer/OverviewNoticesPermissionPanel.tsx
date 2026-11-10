import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";

type Scope = { enabled:boolean; wholeSectorIds:string[]; contactIds:string[]; agentIds:string[] };
type Sector = {id:string;name:string;active:boolean};
type Contact = {id:string;name:string;sectorId:string;active:boolean};
type Agent = {uid:string;agent:string;login:string;status:string};

const types = [
  {id:"longCalls",title:"LIGAÇÕES PROLONGADAS"},
  {id:"googleChat",title:"SOLICITAÇÕES NO GOOGLE CHAT"},
  {id:"otherHelp",title:"OUTROS PEDIDOS DE AJUDA"},
] as const;
const emptyScope = ():Scope => ({enabled:false,wholeSectorIds:[],contactIds:[],agentIds:[]});

export default function OverviewNoticesPermissionPanel(){
  const [sectors,setSectors]=useState<Sector[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [agents,setAgents]=useState<Agent[]>([]);
  const [scopes,setScopes]=useState<Record<string,Scope>>({longCalls:emptyScope(),googleChat:emptyScope(),otherHelp:emptyScope()});
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
      setAgents(us.docs.map(x=>({uid:x.id,agent:String(x.data().agent??""),login:String(x.data().login??""),status:String(x.data().status??"")})).filter(x=>x.status==="approved"&&x.agent));
      if(ps.exists()){
        const saved=ps.data().notices??{};
        setScopes({longCalls:{...emptyScope(),...(saved.longCalls??{})},googleChat:{...emptyScope(),...(saved.googleChat??{})},otherHelp:{...emptyScope(),...(saved.otherHelp??{})}});
      }
    }catch(e){if(active)setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CARREGAR AS PERMISSÕES.");}
    finally{if(active)setLoading(false);}
  })();return()=>{active=false;}},[]);

  function update(type:string,patch:Partial<Scope>){setScopes(current=>({...current,[type]:{...current[type],...patch}}));}
  function toggle(type:string,field:"wholeSectorIds"|"contactIds"|"agentIds",id:string,checked:boolean){
    const scope=scopes[type];const next=checked?[...new Set([...scope[field],id])]:scope[field].filter(x=>x!==id);
    update(type,{[field]:next});
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
      {types.map(type=>{const scope=scopes[type.id];return <section key={type.id} className="config-form">
        <h4>{type.title}</h4>
        <label className="check-line"><input type="checkbox" checked={scope.enabled} onChange={e=>update(type.id,{enabled:e.target.checked})}/><span><strong>AVISO HABILITADO</strong><small>Permite que os colaboradores selecionados visualizem este cartão.</small></span></label>
        <strong>SETORES</strong>
        {sectors.map(s=><label className="check-line" key={s.id}><input type="checkbox" checked={scope.wholeSectorIds.includes(s.id)} onChange={e=>toggle(type.id,"wholeSectorIds",s.id,e.target.checked)}/>{s.name}</label>)}
        <strong>CONTATOS</strong>
        {contacts.map(c=><label className="check-line" key={c.id}><input type="checkbox" checked={scope.contactIds.includes(c.id)} onChange={e=>toggle(type.id,"contactIds",c.id,e.target.checked)}/>{c.name}</label>)}
        <strong>AGENTES</strong>
        {agents.map(a=><label className="check-line" key={a.uid}><input type="checkbox" checked={scope.agentIds.includes(a.uid)} onChange={e=>toggle(type.id,"agentIds",a.uid,e.target.checked)}/>{a.agent}{a.login?" · "+a.login:""}</label>)}
      </section>})}
      <div className="config-actions"><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"SALVANDO…":"SALVAR PERMISSÕES DOS AVISOS"}</button></div>
    </>}
    {message&&<p role="status" className="system-message">{message}</p>}
  </section>;
}
