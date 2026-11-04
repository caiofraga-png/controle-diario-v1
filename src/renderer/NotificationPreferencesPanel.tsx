import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { requireFirebase } from "../web/firebaseClient";
import { loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from "../web/firebaseNotificationService";

type OrgItem = { id: string; name: string; sectorId?: string; active: boolean };
export default function NotificationPreferencesPanel({ canManageAccess = false }: { canManageAccess?: boolean }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({ cobranca: true, promocoes: true, manutencoes: true });
  const [sectors, setSectors] = useState<OrgItem[]>([]);
  const [contacts, setContacts] = useState<OrgItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
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
          const [s, c, permission] = await Promise.all([
            getDocs(query(collection(db, "organizationSectors"), orderBy("name"))),
            getDocs(query(collection(db, "organizationContacts"), orderBy("name"))),
            getDoc(doc(db, "featurePermissions", "delinquency")),
          ]);
          if (!active) return;
          setSectors(s.docs.map(item => ({ id:item.id, ...item.data() } as OrgItem)).filter(item => item.active));
          setContacts(c.docs.map(item => ({ id:item.id, ...item.data() } as OrgItem)).filter(item => item.active));
          if (permission.exists()) {
            const data = permission.data();
            setEnabled(data.enabled === true);
            setSectorIds(Array.isArray(data.sectorIds) ? data.sectorIds : []);
            setContactIds(Array.isArray(data.contactIds) ? data.contactIds : []);
          }
        }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR AS PREFERÊNCIAS."); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [canManageAccess]);
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
        schemaVersion: 1, enabled, sectorIds, contactIds,
        updatedAt: serverTimestamp(), updatedByUid: auth.currentUser.uid,
      });
      setMessage("PERMISSÕES DE AVISOS DE INADIMPLÊNCIA SALVAS.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR AS PERMISSÕES."); }
    finally { setSaving(false); }
  }
  function toggle(list: string[], id: string, checked: boolean, setter: (value:string[])=>void) {
    setter(checked ? [...new Set([...list,id])] : list.filter(value => value !== id));
  }
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
      <p>Habilite os setores e/ou contatos que poderão cadastrar e publicar avisos. A seleção de um setor autoriza toda a equipe; contatos específicos podem ser liberados individualmente.</p>
      <label className="check-line"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span><strong>RECURSO HABILITADO</strong><small>Permite publicar avisos dentro dos escopos selecionados.</small></span></label>
      <h4>SETORES AUTORIZADOS</h4>
      {sectors.map(item=><label className="check-line" key={item.id}><input type="checkbox" checked={sectorIds.includes(item.id)} onChange={event=>toggle(sectorIds,item.id,event.target.checked,setSectorIds)}/>{item.name}</label>)}
      <h4>CONTATOS AUTORIZADOS</h4>
      {contacts.map(item=><label className="check-line" key={item.id}><input type="checkbox" checked={contactIds.includes(item.id)} onChange={event=>toggle(contactIds,item.id,event.target.checked,setContactIds)}/>{item.name}</label>)}
      <div className="config-actions"><button className="primary" disabled={saving || (!sectorIds.length && !contactIds.length && enabled)} onClick={()=>void savePermissions()}>SALVAR PERMISSÕES</button></div>
    </section>}
    {message && <p role="status" className="system-message">{message}</p>}
  </div>;
}
