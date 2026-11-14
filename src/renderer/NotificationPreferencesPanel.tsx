import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";
import { loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from "../web/firebaseNotificationService";

type OrgItem = { id: string; name: string; sectorId?: string; active: boolean };
type AgentItem = { uid: string; agent: string; login?: string; contactId: string; sectorId: string };
export default function NotificationPreferencesPanel({ canManageAccess = false }: { canManageAccess?: boolean }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({ cobranca: true, promocoes: true, manutencoes: true });
  const [sectors, setSectors] = useState<OrgItem[]>([]);
  const [contacts, setContacts] = useState<OrgItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [wholeSectorIds, setWholeSectorIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { db } = requireFirebase();
        const prefs = await loadNotificationPreferences();
        if (!active) return;
        setPreferences(prefs);
        if (canManageAccess) {
          const [s, c, permission, users] = await Promise.all([
            getDocs(query(collection(db, "organizationSectors"), orderBy("name"))),
            getDocs(query(collection(db, "organizationContacts"), orderBy("name"))),
            getDoc(doc(db, "featurePermissions", "delinquency")),
            getDocs(collection(db, "users")),
          ]);
          if (!active) return;
          setSectors(s.docs.map(item => ({ id:item.id, ...item.data() } as OrgItem)).filter(item => item.active));
          setContacts(c.docs.map(item => ({ id:item.id, ...item.data() } as OrgItem)).filter(item => item.active));
          setAgents(users.docs.map(item => {
            const data = item.data();
            return { uid:item.id, agent:String(data.agent ?? ""), login:String(data.login ?? ""), contactId:String(data.contactId ?? ""), sectorId:String(data.sectorId ?? ""), status:String(data.status ?? "") };
          }).filter((item:any) => item.status === "approved" && item.agent && item.contactId).map(({status: _status,...item}:any)=>item));
          if (permission.exists()) {
            const data = permission.data();
            setEnabled(data.enabled === true);
            setSectorIds(Array.isArray(data.sectorIds) ? data.sectorIds : []);
            setWholeSectorIds(Array.isArray(data.wholeSectorIds) ? data.wholeSectorIds : (Array.isArray(data.sectorIds) ? data.sectorIds : []));
            setContactIds(Array.isArray(data.contactIds) ? data.contactIds : []);
            setAgentIds(Array.isArray(data.agentIds) ? data.agentIds : []);
          }
        }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR AS PREFERÊNCIAS."); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [canManageAccess]);
  const visibleContacts = useMemo(() => contacts.filter(item => item.sectorId === selectedSector), [contacts, selectedSector]);
  const visibleAgents = useMemo(() => agents.filter(item => item.contactId === selectedContact), [agents, selectedContact]);
  async function savePreferences() {
    setSaving(true); setMessage("");
    try { await saveNotificationPreferences(preferences); setMessage("PREFERÊNCIAS DE AVISOS SALVAS."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR AS PREFERÊNCIAS."); }
    finally { setSaving(false); }
  }
  async function savePermissions() {
    setSaving(true); setMessage("");
    try {
      const { auth, db } = requireFirebase();
      if (!auth.currentUser) throw new Error("FAÇA LOGIN PARA ALTERAR AS PERMISSÕES.");
      await setDoc(doc(db, "featurePermissions", "delinquency"), {
        schemaVersion: 1, enabled, sectorIds: [...new Set([...sectorIds,...wholeSectorIds,...contacts.filter(item=>contactIds.includes(item.id)).map(item=>item.sectorId??""),...agents.filter(item=>agentIds.includes(item.uid)).map(item=>item.sectorId)])].filter(Boolean), wholeSectorIds, contactIds, agentIds,
        updatedAt: serverTimestamp(), updatedByUid: auth.currentUser.uid,
      });
      setMessage("PERMISSÕES DE AVISOS DE INADIMPLÊNCIA SALVAS.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR AS PERMISSÕES."); }
    finally { setSaving(false); }
  }
  function toggle(list: string[], id: string, checked: boolean, setter: (value:string[])=>void) {
    setter(checked ? [...new Set([...list,id])] : list.filter(value => value !== id));
  }
  function toggleSector(id:string, checked:boolean) {
    setSectorIds(current => checked ? [...new Set([...current,id])] : current.filter(value=>value!==id));
    if (!checked) {
      const removedContacts = contacts.filter(item=>item.sectorId===id).map(item=>item.id);
      setContactIds(current=>current.filter(value=>!removedContacts.includes(value)));
      const removedAgents = agents.filter(item=>item.sectorId===id).map(item=>item.uid);
      setAgentIds(current=>current.filter(value=>!removedAgents.includes(value)));
      setWholeSectorIds(current=>current.filter(value=>value!==id));

    }
  }
  function toggleWholeContact(contact:OrgItem, checked:boolean) {
    toggle(contactIds,contact.id,checked,setContactIds);
    if (checked) {
      const ids=agents.filter(item=>item.contactId===contact.id).map(item=>item.uid);
      setAgentIds(current=>current.filter(value=>!ids.includes(value)));
    }
  }
  function toggleAgent(uid:string,checked:boolean) { toggle(agentIds,uid,checked,setAgentIds); }
  return <div className="config-form">
    <h3>AVISOS</h3>
    <p>Escolha quais categorias devem gerar notificações no sininho. Desativar uma categoria não remove seu acesso aos respectivos menus.</p>
    {busy ? <p>CARREGANDO PREFERÊNCIAS…</p> : <>
      {([
        ["cobranca", "COBRANÇA", "Novos alertas de inadimplência."],
        ["promocoes", "PROMOÇÕES", "Novas promoções publicadas ou ativadas."],
        ["manutencoes", "MANUTENÇÕES", "Atualizações de manutenção."],
      ] as const).map(([key,label,description]) => <label className="check-line" key={key}>
        <input type="checkbox" checked={preferences[key]} onChange={event=>setPreferences(current=>({...current,[key]:event.target.checked}))}/>
        <span><strong>{label}</strong><small>{description}</small></span>
      </label>)}
      <div className="config-actions"><button className="primary" disabled={saving} onClick={()=>void savePreferences()}>SALVAR AVISOS</button></div>
    </>}
    {canManageAccess && <section className="config-form">
      <h3>PERMISSÃO PARA PUBLICAR AVISOS DE INADIMPLÊNCIA</h3>
      <p>Selecione um ou mais setores. Depois, se desejar, restrinja a autorização a contatos inteiros ou a agentes específicos.</p>
      <label className="check-line"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span><strong>RECURSO HABILITADO</strong><small>Permite publicar avisos dentro dos escopos selecionados.</small></span></label>
      <h4>SELECIONAR AUTORIZADOS</h4>
      <label>SETOR
        <select value={selectedSector} onChange={event=>{setSelectedSector(event.target.value);setSelectedContact("");setSelectedAgent("");}}>
          <option value="">Selecione um setor</option>
          {sectors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {selectedSector && <>
        <label className="check-line"><input type="checkbox" checked={wholeSectorIds.includes(selectedSector)} onChange={event=>{
          toggle(wholeSectorIds,selectedSector,event.target.checked,setWholeSectorIds);
          if(event.target.checked) setSectorIds(current=>[...new Set([...current,selectedSector])]);
        }}/><span>HABILITAR SETOR INTEIRO</span></label>
        {!wholeSectorIds.includes(selectedSector) && <label>CONTATO
          <select value={selectedContact} onChange={event=>{setSelectedContact(event.target.value);setSelectedAgent("");}}>
            <option value="">Selecione um contato</option>
            {visibleContacts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </>}
      {selectedContact && !wholeSectorIds.includes(selectedSector) && <>
        <label className="check-line"><input type="checkbox" checked={contactIds.includes(selectedContact)} onChange={event=>toggleWholeContact(contacts.find(item=>item.id===selectedContact)!,event.target.checked)}/><span>HABILITAR CONTATO INTEIRO</span></label>
        {!contactIds.includes(selectedContact) && <label>AGENTE
          <select value={selectedAgent} onChange={event=>setSelectedAgent(event.target.value)}>
            <option value="">Selecione um agente</option>
            {visibleAgents.map(item=><option key={item.uid} value={item.uid}>{item.agent}{item.login?` · ${item.login}`:""}</option>)}
          </select>
        </label>}
        {selectedAgent && !contactIds.includes(selectedContact) && <button type="button" onClick={()=>toggleAgent(selectedAgent,true)}>ADICIONAR AGENTE</button>}
      </>}
      <div className="notification-permission-list">
        {wholeSectorIds.map(id=><div key={id}>SETOR INTEIRO: {sectors.find(s=>s.id===id)?.name??id} <button type="button" onClick={()=>toggle(wholeSectorIds,id,false,setWholeSectorIds)}>REMOVER</button></div>)}
        {contactIds.map(id=><div key={id}>CONTATO INTEIRO: {contacts.find(s=>s.id===id)?.name??id} <button type="button" onClick={()=>toggle(contactIds,id,false,setContactIds)}>REMOVER</button></div>)}
        {agentIds.map(id=><div key={id}>AGENTE: {agents.find(s=>s.uid===id)?.agent??id} <button type="button" onClick={()=>toggle(agentIds,id,false,setAgentIds)}>REMOVER</button></div>)}
      </div>
      <div className="config-actions"><button className="primary" disabled={saving || (!wholeSectorIds.length && !contactIds.length && !agentIds.length && enabled)} onClick={()=>void savePermissions()}>SALVAR PERMISSÕES</button></div>
    </section>}
    {message && <p role="status" className="system-message">{message}</p>}
  </div>;
}
