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
  const [expandedContactIds, setExpandedContactIds] = useState<string[]>([]);
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
  const visibleContacts = useMemo(() => contacts.filter(item => sectorIds.includes(item.sectorId ?? "")), [contacts, sectorIds]);
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
        schemaVersion: 1, enabled, sectorIds, wholeSectorIds, contactIds, agentIds,
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
      setExpandedContactIds(current=>current.filter(value=>!removedContacts.includes(value)));
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
      <h4>SETORES</h4>
      <div className="notification-permission-list">
        {sectors.map(item=><div className="notification-permission-contact" key={item.id}>
          <label className="check-line"><input type="checkbox" checked={sectorIds.includes(item.id)} onChange={event=>toggleSector(item.id,event.target.checked)}/><span><strong>{item.name}</strong><small>Selecionar para configurar o acesso</small></span></label>
          {sectorIds.includes(item.id) && <div className="notification-permission-agents">
            <label className="check-line"><input type="checkbox" checked={wholeSectorIds.includes(item.id)} onChange={event=>toggle(wholeSectorIds,item.id,event.target.checked,setWholeSectorIds)}/><span><strong>HABILITAR SETOR INTEIRO</strong><small>Todos os contatos e agentes deste setor poderão publicar.</small></span></label>
          </div>}
        </div>)}
      </div>
      {visibleContacts.filter(contact=>!wholeSectorIds.includes(contact.sectorId??"")).length>0 && <>
        <h4>CONTATOS DO(S) SETOR(ES) SELECIONADO(S)</h4>
        <div className="notification-permission-list">
          {visibleContacts.filter(contact=>!wholeSectorIds.includes(contact.sectorId??"")).map(contact=><div className="notification-permission-contact" key={contact.id}>
            <label className="check-line"><input type="checkbox" checked={expandedContactIds.includes(contact.id)} onChange={event=>toggle(expandedContactIds,contact.id,event.target.checked,setExpandedContactIds)}/><span><strong>{contact.name}</strong><small>Selecionar para configurar o contato</small></span></label>
            {expandedContactIds.includes(contact.id) && <div className="notification-permission-agents">
              <label className="check-line"><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={event=>toggleWholeContact(contact,event.target.checked)}/><span><strong>HABILITAR CONTATO INTEIRO</strong><small>Todos os agentes deste contato poderão publicar.</small></span></label>
              {!contactIds.includes(contact.id) && <>
                <small>OU SELECIONE AGENTES ESPECÍFICOS</small>
                {agents.filter(agent=>agent.contactId===contact.id).map(agent=><label className="check-line" key={agent.uid}><input type="checkbox" checked={agentIds.includes(agent.uid)} onChange={event=>toggleAgent(agent.uid,event.target.checked)}/><span>{agent.agent}{agent.login? ` · ${agent.login}`:""}</span></label>)}
                {agents.every(agent=>agent.contactId!==contact.id)&&<small>NENHUM AGENTE APROVADO CADASTRADO NESTE CONTATO.</small>}
              </>}
            </div>}
          </div>)}
        </div>
      </>}
      <div className="config-actions"><button className="primary" disabled={saving || (!wholeSectorIds.length && !contactIds.length && !agentIds.length && enabled)} onClick={()=>void savePermissions()}>SALVAR PERMISSÕES</button></div>
    </section>}
    {message && <p role="status" className="system-message">{message}</p>}
  </div>;
}
