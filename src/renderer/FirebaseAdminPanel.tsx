import { useEffect, useState } from "react";
import {
  approveAccessRequest,
  getAllowedDomains,
  listAccessRequests,
  listOrganizationalUsers,
  listSectors,
  listContacts,
  rejectAccessRequest,
  saveAllowedDomains,
  saveContact,
  saveSector,
  setAccountStatus,
  updateOrganizationalUser,
} from "../web/firebaseAdminService";
import type { OrganizationalContact, OrganizationalSector, OrganizationalUser } from "../shared/types/organization";
import { signInWithCorporateGoogle, signOutCorporateGoogle } from "../web/firebaseAuthService";

type RequestItem = { id: string; uid?: string; email?: string; status?: string };

export default function FirebaseAdminPanel() {
  const [authorized, setAuthorized] = useState(false);
  const [signedEmail, setSignedEmail] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [users, setUsers] = useState<OrganizationalUser[]>([]);
  const [sectors, setSectors] = useState<OrganizationalSector[]>([]);
  const [contacts, setContacts] = useState<OrganizationalContact[]>([]);
  const [domains, setDomains] = useState("");
  const [selected, setSelected] = useState("");
  const [login, setLogin] = useState("");
  const [agent, setAgent] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [contactId, setContactId] = useState("");
  const [sectorName, setSectorName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactSector, setContactSector] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const [r, u, s, c, d] = await Promise.all([
        listAccessRequests(), listOrganizationalUsers(), listSectors(), listContacts(), getAllowedDomains(),
      ]);
      setRequests(r as RequestItem[]);
      setUsers(u);
      setSectors(s);
      setContacts(c);
      setDomains(d.join("\n"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os dados administrativos.");
    } finally {
      setBusy(false);
    }
  }

  async function signInAdmin() {
    setBusy(true);
    setMessage("");
    try {
      const result = await signInWithCorporateGoogle();
      if (result.status !== "approved" || result.user.role !== "admin") {
        await signOutCorporateGoogle();
        setAuthorized(false);
        setMessage("Esta conta não possui privilégios administrativos aprovados.");
        return;
      }
      setAuthorized(true);
      setSignedEmail(result.user.email);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autenticar o administrador.");
    } finally { setBusy(false); }
  }

  useEffect(() => { /* Administrative data is loaded only after role verification. */ }, []);

  function chooseRequest(item: RequestItem) {
    setSelected(item.id);
    setLogin((item.email ?? "").split("@")[0] ?? "");
    setAgent("");
    setSectorId(sectors.find((sector) => sector.active)?.id ?? "");
    setContactId("");
  }

  async function approve() {
    const item = requests.find((request) => request.id === selected);
    if (!item?.email || !item.uid || !login.trim() || !agent.trim() || !sectorId || !contactId) {
      setMessage("Preencha Login, Agente, Setor e Contato antes de aprovar.");
      return;
    }
    setBusy(true);
    try {
      await approveAccessRequest({ uid: item.uid, email: item.email, login, agent, sectorId, contactId });
      setMessage("Solicitação aprovada. O colaborador já possui cadastro organizacional.");
      setSelected("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao aprovar a solicitação.");
    } finally { setBusy(false); }
  }

  async function reject(item: RequestItem) {
    setBusy(true);
    try { await rejectAccessRequest(item.id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao rejeitar a solicitação."); }
    finally { setBusy(false); }
  }

  async function saveDomains() {
    setBusy(true);
    try {
      await saveAllowedDomains(domains.split(/[\n,;]+/));
      setMessage("Domínios permitidos salvos.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar domínios."); }
    finally { setBusy(false); }
  }

  async function addSector() {
    if (!sectorName.trim()) return;
    setBusy(true);
    try {
      await saveSector({ id: "", name: sectorName.trim(), active: true });
      setSectorName("");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar setor."); }
    finally { setBusy(false); }
  }

  async function addContact() {
    if (!contactName.trim() || !contactSector) return;
    setBusy(true);
    try {
      await saveContact({ id: "", name: contactName.trim(), sectorId: contactSector, active: true });
      setContactName("");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar contato."); }
    finally { setBusy(false); }
  }

  async function changeStatus(user: OrganizationalUser, status: "approved" | "blocked") {
    setBusy(true);
    try { await setAccountStatus(user.uid, status); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar a conta."); }
    finally { setBusy(false); }
  }

  async function saveUser(user: OrganizationalUser) {
    setBusy(true);
    try {
      await updateOrganizationalUser(user.uid, {
        login: user.login, agent: user.agent, sectorId: user.sectorId, contactId: user.contactId,
      });
      setMessage("Cadastro atualizado.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar cadastro."); }
    finally { setBusy(false); }
  }

  return <main className="card" style={{ display: "grid", gap: 24 }}>
    <header>
      <h2>Administração do Leste - Controle Diário</h2>
      <p>Gerencie acessos e cadastros organizacionais. Os expedientes são somente para consulta gerencial; este painel não oferece edição nem exclusão dos registros operacionais.</p>
      {!authorized
        ? <button type="button" disabled={busy} onClick={() => void signInAdmin()}>Entrar com conta Google empresarial</button>
        : <div><p>Administrador autenticado: {signedEmail}</p><button type="button" disabled={busy} onClick={() => void refresh()}>Atualizar dados</button> <button type="button" disabled={busy} onClick={() => { void signOutCorporateGoogle(); setAuthorized(false); setSignedEmail(""); }}>Sair da administração</button></div>}
    </header>
    {message && <p role="status" className="system-message">{message}</p>}
    {!authorized ? <p>Entre com uma conta previamente aprovada com privilégios administrativos para acessar esta área.</p> : <>

    <section>
      <h3>Solicitações de acesso</h3>
      {requests.filter((item) => item.status !== "rejected" && item.status !== "approved").length === 0
        ? <p>Nenhuma solicitação pendente.</p>
        : requests.filter((item) => item.status !== "rejected" && item.status !== "approved").map((item) =>
          <div key={item.id} style={{ borderTop: "1px solid #ddd", padding: 12, display: "grid", gap: 8 }}>
            <strong>{item.email ?? item.id}</strong>
            <span>Status: {item.status ?? "pending"}</span>
            <button type="button" onClick={() => chooseRequest(item)}>Cadastrar e aprovar</button>
            <button type="button" disabled={busy} onClick={() => void reject(item)}>Rejeitar</button>
          </div>)}
      {selected && <div style={{ display: "grid", gap: 8, maxWidth: 560, padding: 12 }}>
        <h4>Cadastro do colaborador</h4>
        <label>Login <input value={login} onChange={(event) => setLogin(event.target.value)} /></label>
        <label>Agente <input value={agent} onChange={(event) => setAgent(event.target.value)} /></label>
        <label>Setor <select value={sectorId} onChange={(event) => { setSectorId(event.target.value); setContactId(""); }}>
          <option value="">Selecione</option>{sectors.filter((sector) => sector.active).map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
        </select></label>
        <label>Contato <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
          <option value="">Selecione</option>{contacts.filter((contact) => contact.active && contact.sectorId === sectorId).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
        </select></label>
        <button type="button" disabled={busy} onClick={() => void approve()}>Aprovar colaborador</button>
      </div>}
    </section>

    <section>
      <h3>Colaboradores</h3>
      {users.map((user) => <div key={user.uid} style={{ borderTop: "1px solid #ddd", padding: 12, display: "grid", gap: 8 }}>
        <strong>{user.agent || user.email} · {user.email}</strong>
        <span>Login: {user.login} · Status: {user.status} · Perfil: {user.role}</span>
        <label>Login <input value={user.login} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, login: event.target.value } : item))} /></label>
        <label>Agente <input value={user.agent} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, agent: event.target.value } : item))} /></label>
        <label>Setor <select value={user.sectorId} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, sectorId: event.target.value, contactId: "" } : item))}>
          <option value="">Selecione</option>{sectors.filter((sector) => sector.active).map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
        </select></label>
        <label>Contato <select value={user.contactId} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, contactId: event.target.value } : item))}>
          <option value="">Selecione</option>{contacts.filter((contact) => contact.active && contact.sectorId === user.sectorId).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
        </select></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => void saveUser(user)}>Salvar cadastro</button>
          {user.status === "blocked"
            ? <button type="button" disabled={busy} onClick={() => void changeStatus(user, "approved")}>Reativar conta</button>
            : <button type="button" disabled={busy || user.role === "admin"} onClick={() => void changeStatus(user, "blocked")}>Bloquear conta</button>}
        </div>
      </div>)}
    </section>

    <section>
      <h3>Setores</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input aria-label="Novo setor" placeholder="Nome do setor" value={sectorName} onChange={(event) => setSectorName(event.target.value)} />
        <button type="button" disabled={busy} onClick={() => void addSector()}>Adicionar setor</button>
      </div>
      <ul>{sectors.map((sector) => <li key={sector.id}>{sector.name} {sector.active ? "" : "(inativo)"}</li>)}</ul>
    </section>

    <section>
      <h3>Contatos</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select aria-label="Setor do novo contato" value={contactSector} onChange={(event) => setContactSector(event.target.value)}>
          <option value="">Setor do contato</option>{sectors.filter((sector) => sector.active).map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
        </select>
        <input aria-label="Novo contato" placeholder="Nome do contato" value={contactName} onChange={(event) => setContactName(event.target.value)} />
        <button type="button" disabled={busy} onClick={() => void addContact()}>Adicionar contato</button>
      </div>
      <ul>{contacts.map((contact) => <li key={contact.id}>{contact.name} — {sectors.find((sector) => sector.id === contact.sectorId)?.name ?? "Setor não encontrado"}</li>)}</ul>
    </section>

    <section>
      <h3>Domínios empresariais permitidos</h3>
      <p>Um domínio permitido não aprova automaticamente uma conta; toda solicitação ainda depende de aprovação.</p>
      <textarea rows={4} value={domains} onChange={(event) => setDomains(event.target.value)} />
      <button type="button" disabled={busy} onClick={() => void saveDomains()}>Salvar domínios</button>
    </section>
    </>}
  </main>;
}
