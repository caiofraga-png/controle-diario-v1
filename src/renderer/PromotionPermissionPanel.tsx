import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";

type Sector = { id: string; name: string; active: boolean };
type Contact = { id: string; name: string; sectorId: string; active: boolean };
type Agent = { uid: string; agent: string; login: string; sectorId: string; contactId: string; status: string };

export default function PromotionPermissionPanel() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [wholeSectorIds, setWholeSectorIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { db } = requireFirebase();
        const [sectorSnapshot, contactSnapshot, permissionSnapshot, userSnapshot] = await Promise.all([
          getDocs(query(collection(db, "organizationSectors"), orderBy("name"))),
          getDocs(query(collection(db, "organizationContacts"), orderBy("name"))),
          getDoc(doc(db, "featurePermissions", "promotions")),
          getDocs(collection(db, "users")),
        ]);
        if (!active) return;
        setSectors(sectorSnapshot.docs.map(item => ({ id:item.id, ...item.data() } as Sector)).filter(item=>item.active));
        setContacts(contactSnapshot.docs.map(item => ({ id:item.id, ...item.data() } as Contact)).filter(item=>item.active));
        setAgents(userSnapshot.docs.map(item => {
          const data = item.data();
          return { uid:item.id, agent:String(data.agent??""), login:String(data.login??""), sectorId:String(data.sectorId??""), contactId:String(data.contactId??""), status:String(data.status??"") };
        }).filter(item=>item.status==="approved" && item.agent && item.sectorId && item.contactId));
        if (permissionSnapshot.exists()) {
          const permission = permissionSnapshot.data();
          setEnabled(permission.enabled===true);
          setWholeSectorIds(Array.isArray(permission.wholeSectorIds)?permission.wholeSectorIds:[]);
          setContactIds(Array.isArray(permission.contactIds)?permission.contactIds:[]);
          setAgentIds(Array.isArray(permission.agentIds)?permission.agentIds:[]);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL CARREGAR AS PERMISSÕES.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active=false; };
  }, []);

  const visibleContacts = useMemo(()=>contacts.filter(item=>item.sectorId===selectedSector),[contacts,selectedSector]);
  const visibleAgents = useMemo(()=>agents.filter(item=>item.contactId===selectedContact && item.sectorId===selectedSector),[agents,selectedContact,selectedSector]);

  function toggle(list:string[],id:string,checked:boolean,setter:(value:string[])=>void) {
    setter(checked?[...new Set([...list,id])]:list.filter(value=>value!==id));
  }

  function toggleSector(id:string,checked:boolean) {
    toggle(wholeSectorIds,id,checked,setWholeSectorIds);
    if (checked) {
      const contactSet = contacts.filter(item=>item.sectorId===id).map(item=>item.id);
      const agentSet = agents.filter(item=>item.sectorId===id).map(item=>item.uid);
      setContactIds(current=>current.filter(value=>!contactSet.includes(value)));
      setAgentIds(current=>current.filter(value=>!agentSet.includes(value)));
    }
  }

  function toggleContact(id:string,checked:boolean) {
    toggle(contactIds,id,checked,setContactIds);
    if (checked) {
      const agentSet=agents.filter(item=>item.contactId===id).map(item=>item.uid);
      setAgentIds(current=>current.filter(value=>!agentSet.includes(value)));
    }
  }

  async function save() {
    setSaving(true); setMessage("");
    try {
      const {auth,db}=requireFirebase();
      if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA ALTERAR AS PERMISSÕES.");
      const sectorIds=[...new Set([
        ...wholeSectorIds,
        ...contacts.filter(item=>contactIds.includes(item.id)).map(item=>item.sectorId),
        ...agents.filter(item=>agentIds.includes(item.uid)).map(item=>item.sectorId),
      ])];
      await setDoc(doc(db,"featurePermissions","promotions"),{
        schemaVersion:1, enabled, sectorIds, wholeSectorIds, contactIds, agentIds,
        updatedAt:serverTimestamp(), updatedByUid:auth.currentUser.uid,
      });
      setMessage("PERMISSÕES DE PROMOÇÕES SALVAS.");
    } catch(error) {
      setMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL SALVAR AS PERMISSÕES.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="config-form maintenance-permission-panel">
    <h3>PERMISSÃO PARA CADASTRAR E EDITAR PROMOÇÕES</h3>
    <p>Administradores e supervisores podem liberar a publicação por setor inteiro, contato ou agente específico. A consulta das promoções permanece disponível para todos os colaboradores aprovados.</p>
    {loading ? <p>CARREGANDO PERMISSÕES…</p> : <>
      <label className="check-line"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span><strong>RECURSO HABILITADO</strong><small>Ativa as autorizações selecionadas para cadastro e edição.</small></span></label>
      <h4>SELECIONAR AUTORIZADOS</h4>
      <label>SETOR
        <select value={selectedSector} onChange={event=>{setSelectedSector(event.target.value);setSelectedContact("");setSelectedAgent("");}}>
          <option value="">Selecione um setor</option>
          {sectors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {selectedSector && <>
        <label className="check-line"><input type="checkbox" checked={wholeSectorIds.includes(selectedSector)} onChange={event=>toggleSector(selectedSector,event.target.checked)}/><span>HABILITAR SETOR INTEIRO</span></label>
        {!wholeSectorIds.includes(selectedSector) && <label>CONTATO
          <select value={selectedContact} onChange={event=>{setSelectedContact(event.target.value);setSelectedAgent("");}}>
            <option value="">Selecione um contato</option>
            {visibleContacts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </>}
      {selectedContact && !wholeSectorIds.includes(selectedSector) && <>
        <label className="check-line"><input type="checkbox" checked={contactIds.includes(selectedContact)} onChange={event=>toggleContact(selectedContact,event.target.checked)}/><span>HABILITAR CONTATO INTEIRO</span></label>
        {!contactIds.includes(selectedContact) && <label>AGENTE
          <select value={selectedAgent} onChange={event=>setSelectedAgent(event.target.value)}>
            <option value="">Selecione um agente</option>
            {visibleAgents.map(item=><option key={item.uid} value={item.uid}>{item.agent}{item.login ? " · " + item.login : ""}</option>)}
          </select>
        </label>}
        {selectedAgent && !contactIds.includes(selectedContact) && <button type="button" onClick={()=>{toggle(agentIds,selectedAgent,true,setAgentIds);setSelectedAgent("");}}>ADICIONAR AGENTE</button>}
      </>}
      <div className="notification-permission-list">
        {wholeSectorIds.map(id=><div key={id}>SETOR INTEIRO: {sectors.find(item=>item.id===id)?.name??id} <button type="button" onClick={()=>toggle(wholeSectorIds,id,false,setWholeSectorIds)}>REMOVER</button></div>)}
        {contactIds.map(id=><div key={id}>CONTATO INTEIRO: {contacts.find(item=>item.id===id)?.name??id} <button type="button" onClick={()=>toggle(contactIds,id,false,setContactIds)}>REMOVER</button></div>)}
        {agentIds.map(id=><div key={id}>AGENTE: {agents.find(item=>item.uid===id)?.agent??id} <button type="button" onClick={()=>toggle(agentIds,id,false,setAgentIds)}>REMOVER</button></div>)}
      </div>
      <div className="config-actions"><button className="primary" disabled={saving || (!wholeSectorIds.length&&!contactIds.length&&!agentIds.length&&enabled)} onClick={()=>void save()}>{saving?"SALVANDO…":"SALVAR PERMISSÕES"}</button></div>
    </>}
    {message && <p role="status" className="system-message">{message}</p>}
  </section>;
}
