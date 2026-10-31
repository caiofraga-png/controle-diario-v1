import { useEffect, useState } from "react";
import {
  approveAccessRequest,
  getAllowedDomains,
  listAccessRequests,
  listOrganizationalUsers,
  listSectors,
  listContacts,
  listRecentOperationalRecords,
  rejectAccessRequest,
  saveAllowedDomains,
  saveContact,
  saveSector,
  deleteContact,
  deleteSector,
  setAccountStatus,
  updateOrganizationalUser,
} from "../web/firebaseAdminService";
import type { OrganizationalContact, OrganizationalSector, OrganizationalUser } from "../shared/types/organization";
import { signInWithCorporateGoogle, signOutCorporateGoogle } from "../web/firebaseAuthService";
import { FirebasePersonalDataService } from "../web/firebasePersonalDataService";
import { loadSharedTaskCatalog, saveSharedTaskCatalog } from "../web/firebaseSharedTaskCatalogService";

type RequestItem = { id: string; uid?: string; email?: string; status?: string };

export default function FirebaseAdminPanel() {
  const [authorized, setAuthorized] = useState(false);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [signedEmail, setSignedEmail] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [users, setUsers] = useState<OrganizationalUser[]>([]);
  const [sectors, setSectors] = useState<OrganizationalSector[]>([]);
  const [contacts, setContacts] = useState<OrganizationalContact[]>([]);
  const [operationalRecords, setOperationalRecords] = useState<Record<string, unknown>[]>([]);
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
  const [catalogProfiles, setCatalogProfiles] = useState<Array<{ id: string; nome: string; ativo: boolean }>>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogPreflight, setCatalogPreflight] = useState<string>("");

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const [r, u, s, c, d, records, catalog] = await Promise.all([
        listAccessRequests(), listOrganizationalUsers(), listSectors(), listContacts(), getAllowedDomains(), listRecentOperationalRecords(100), loadSharedTaskCatalog(),
      ]);
      setRequests(r as RequestItem[]);
      setUsers(u);
      setSectors(s);
      setContacts(c);
      setDomains(d.join("\n"));
      setOperationalRecords(records as Record<string, unknown>[]);
      setCatalogReady(Boolean(catalog));
      setCatalogProfiles((catalog?.perfis.perfis ?? []).filter((profile) => profile.ativo).map((profile) => ({ id: profile.id, nome: profile.nome, ativo: profile.ativo })));
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
      if (result.status !== "approved" || (result.user.role !== "admin" && !result.user.isSupervisor)) {
        await signOutCorporateGoogle();
        setAuthorized(false);
        setIsAdministrator(false);
        setMessage("Esta conta não possui privilégios de Supervisão ou Administração aprovados.");
        return;
      }
      setAuthorized(true);
      setIsAdministrator(result.user.role === "admin");
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
      const editId = selected.startsWith("sector:") ? selected.slice(7) : "";
      await saveSector({ id: editId, name: sectorName.trim(), active: true });
      setSectorName("");
      setSelected("");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar setor."); }
    finally { setBusy(false); }
  }

  async function addContact() {
    if (!contactName.trim() || !contactSector) return;
    setBusy(true);
    try {
      const editId = selected.startsWith("contact:") ? selected.slice(8) : "";
      await saveContact({ id: editId, name: contactName.trim(), sectorId: contactSector, active: true });
      setContactName("");
      setSelected("");
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

  async function inspectSharedCatalogSource() {
    setBusy(true);
    setMessage("");
    setCatalogPreflight("");
    try {
      const config = await new FirebasePersonalDataService().loadConfiguration();
      if (!config) throw new Error("Não foi encontrada uma configuração pessoal para conferir.");
      const tasks = config.tarefas.tarefas;
      const profiles = config.perfis.perfis;
      const emails = config.email.emails;
      const taskIds = new Set(tasks.map((item) => item.id));
      const profileIds = new Set(profiles.map((item) => item.id));
      const emailIds = new Set(emails.map((item) => item.id));
      const issues: string[] = [];
      const duplicateNames = (items: Array<{id:string;nome:string}>, label:string) => {
        const seen = new Map<string,string>();
        for (const item of items) {
          const key = item.nome.trim().toLocaleLowerCase();
          const previous = seen.get(key);
          if (previous) issues.push(`${label}: nome repetido "${item.nome}" (IDs ${previous} e ${item.id}).`);
          else seen.set(key,item.id);
        }
      };
      duplicateNames(tasks,"Tarefa");
      duplicateNames(profiles,"Perfil");
      duplicateNames(emails,"E-mail");
      for (const task of tasks) for (const id of task.emailsVinculados ?? []) {
        if (!emailIds.has(id) && id !== `${task.id}_EMAIL`) issues.push(`Tarefa ${task.id}: e-mail vinculado inexistente (${id}).`);
      }
      for (const profile of profiles) for (const id of profile.tarefas ?? []) {
        if (!taskIds.has(id)) issues.push(`Perfil ${profile.id}: tarefa inexistente (${id}).`);
      }
      for (const email of emails) for (const id of email.perfisVinculados ?? []) {
        if (!profileIds.has(id)) issues.push(`E-mail ${email.id}: perfil vinculado inexistente (${id}).`);
      }
      for (const id of config.email.emailsGlobais ?? []) if (!emailIds.has(id)) issues.push(`Compilação global: e-mail inexistente (${id}).`);
      for (const id of config.layout.ordemPerfis ?? []) if (!profileIds.has(id)) issues.push(`Layout: perfil inexistente na ordem (${id}).`);
      for (const [profileId, order] of Object.entries(config.layout.ordemTarefas ?? {})) {
        if (profileId !== "GERAL" && !profileIds.has(profileId)) issues.push(`Layout: perfil inexistente na ordem de tarefas (${profileId}).`);
        for (const id of order) if (!taskIds.has(id)) issues.push(`Layout: tarefa inexistente na ordem (${profileId}: ${id}).`);
      }
      const count = (items: Array<{ativo:boolean}>) => ({ total:items.length, active:items.filter(x=>x.ativo).length, inactive:items.filter(x=>!x.ativo).length });
      const t=count(tasks), p=count(profiles), e=count(emails);
      const report = [
        "RELATÓRIO DE CONFERÊNCIA — FONTE PROPOSTA PARA O CATÁLOGO COMPARTILHADO",
        "MODO SOMENTE LEITURA: nenhum dado foi gravado, alterado ou inicializado.",
        "",
        `TAREFAS: ${t.total} total | ${t.active} ativas | ${t.inactive} inativas`,
        `PERFIS: ${p.total} total | ${p.active} ativos | ${p.inactive} inativos`,
        `E-MAILS: ${e.total} total | ${e.active} ativos | ${e.inactive} inativos`,
        `E-MAILS NA COMPILAÇÃO GLOBAL: ${config.email.emailsGlobais.length}`,
        `ORDEM DE PERFIS CONFIGURADA: ${config.layout.ordemPerfis.length} itens`,
        `GRUPOS DE ORDEM DE TAREFAS: ${Object.keys(config.layout.ordemTarefas).length}`,
        "",
        issues.length ? `PONTOS PARA REVISÃO (${issues.length}):` : "PONTOS PARA REVISÃO: nenhum vínculo ou nome duplicado foi identificado pelas verificações automáticas.",
        ...issues.map((item,index)=>`${index+1}. ${item}`),
        "",
        "O layout listado pertence à conta consultada e NÃO será copiado para o catálogo compartilhado; cada colaborador manterá seu próprio layout.",
        "A inicialização permanece bloqueada até a revisão e autorização expressa."
      ].join("\\n");
      setCatalogPreflight(report);
      setMessage("Conferência concluída. Nenhum dado foi alterado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao conferir a configuração."); }
    finally { setBusy(false); }
  }

  async function saveUser(user: OrganizationalUser) {
    setBusy(true);
    try {
      await updateOrganizationalUser(user.uid, {
        login: user.login, agent: user.agent, sectorId: user.sectorId, contactId: user.contactId,
        isSupervisor: user.isSupervisor, allowedProfileIds: user.allowedProfileIds ?? [],
      });
      setMessage("Cadastro atualizado.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar cadastro."); }
    finally { setBusy(false); }
  }

  return <main className="card" style={{ display: "grid", gap: 24 }}>
    <header>
      <h2>Gestão do Controle Diário</h2>
      <p>Supervisores gerenciam colaboradores, setores, contatos e perfis. Administradores mantêm também as configurações exclusivas do sistema. Expedientes são somente para consulta gerencial.</p>
      {!authorized
        ? <button type="button" disabled={busy} onClick={() => void signInAdmin()}>Entrar com conta Google empresarial</button>
        : <div><p>{isAdministrator ? "Administrador" : "Supervisor"} autenticado: {signedEmail}</p><button type="button" disabled={busy} onClick={() => void refresh()}>Atualizar dados</button> <button type="button" disabled={busy} onClick={() => { void signOutCorporateGoogle(); setAuthorized(false); setIsAdministrator(false); setSignedEmail(""); }}>Sair da administração</button></div>}
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
      <h3>Catálogo compartilhado de perfis</h3>
      <p>O catálogo é comum à organização. A configuração de layout continua individual. A inicialização usa a configuração atual da conta gerencial autenticada e não substitui o histórico.</p>
      {catalogReady
        ? <p>Catálogo compartilhado carregado: {catalogProfiles.length} perfis ativos.</p>
        : <><p>Nenhum catálogo compartilhado foi inicializado. Antes de qualquer gravação, gere e revise o relatório da configuração desta conta.</p><button type="button" disabled={busy} onClick={() => void inspectSharedCatalogSource()}>Conferir configuração (somente leitura)</button></>}
      {catalogPreflight && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>{catalogPreflight}</pre>}
    </section>

    <section>
      <h3>Colaboradores</h3>
      {users.map((user) => <div key={user.uid} style={{ borderTop: "1px solid #ddd", padding: 12, display: "grid", gap: 8 }}>
        <strong>{user.agent || user.email} · {user.email}</strong>
        <span>Login: {user.login} · Status: {user.status} · Perfil: {user.role} · {user.isSupervisor ? "Supervisor" : "Não supervisor"}</span>
        <label>Login <input value={user.login} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, login: event.target.value } : item))} /></label>
        <label>Agente <input value={user.agent} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, agent: event.target.value } : item))} /></label>
        <label>Setor <select value={user.sectorId} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, sectorId: event.target.value, contactId: "" } : item))}>
          <option value="">Selecione</option>{sectors.filter((sector) => sector.active).map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
        </select></label>
        <label>Contato <select value={user.contactId} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, contactId: event.target.value } : item))}>
          <option value="">Selecione</option>{contacts.filter((contact) => contact.active && contact.sectorId === user.sectorId).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
        </select></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={Boolean(user.isSupervisor)} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, isSupervisor: event.target.checked } : item))} />
          Supervisor — gerencia colaboradores e expedientes de todos os setores
        </label>
        <fieldset style={{ display: "grid", gap: 6 }}>
          <legend>Perfis que este colaborador pode selecionar</legend>
          {catalogProfiles.length === 0 ? <small>Inicialize o catálogo compartilhado para atribuir perfis.</small> : catalogProfiles.map((profile) => (
            <label key={profile.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={(user.allowedProfileIds ?? []).includes(profile.id)} onChange={(event) => setUsers((items) => items.map((item) => item.uid === user.uid ? { ...item, allowedProfileIds: event.target.checked ? [...new Set([...(item.allowedProfileIds ?? []), profile.id])] : (item.allowedProfileIds ?? []).filter((id) => id !== profile.id) } : item))} />
              {profile.nome}
            </label>
          ))}
        </fieldset>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => void saveUser(user)}>Salvar cadastro</button>
          {user.status === "blocked"
            ? <button type="button" disabled={busy} onClick={() => void changeStatus(user, "approved")}>Reativar conta</button>
            : <button type="button" disabled={busy || user.role === "admin"} onClick={() => void changeStatus(user, "blocked")}>Bloquear conta</button>}
        </div>
      </div>)}
    </section>

    <section>
      <h3>Expediente — visão geral</h3>
      <p>Visualização somente para acompanhamento. A estrutura final dos registros será conectada após a migração do expediente para o Firestore; este painel não disponibiliza edição ou exclusão.</p>
      {operationalRecords.length === 0
        ? <p>A seção está criada. Quando a gravação dos expedientes no Firestore for integrada, esta área poderá listar os cards e permitir filtros por Setor e Contato. Nenhum expediente foi migrado ou criado nesta etapa.</p>
        : <div style={{ display: "grid", gap: 8 }}>{operationalRecords.map((record, index) => <article key={String(record.id ?? index)} style={{ borderTop: "1px solid #ddd", padding: 12 }}>
          <strong>{String(record.agent ?? record.agente ?? record.login ?? record.uid ?? "Expediente")}</strong>
          <div>{String(record.date ?? record.data ?? record.completedAt ?? "Data não disponível")}</div>
          <div>{String(record.sectorName ?? record.setor ?? "Setor não disponível")} / {String(record.contactName ?? record.contato ?? "Contato não disponível")}</div>
          <small>{String(record.status ?? record.statusExpediente ?? "Registro histórico")}</small>
        </article>)}</div>}
    </section>

    <section>
      <h3>Setores</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input aria-label="Novo setor" placeholder="Nome do setor" value={sectorName} onChange={(event) => setSectorName(event.target.value)} />
        <button type="button" disabled={busy} onClick={() => void addSector()}>Adicionar setor</button>
      </div>
      <ul>{sectors.map((sector) => <li key={sector.id}>{sector.name} {sector.active ? "" : "(inativo)"} <button type="button" disabled={busy} onClick={() => { setSectorName(sector.name); setSelected("sector:"+sector.id); }}>Editar</button> <button type="button" disabled={busy} onClick={() => { if (window.confirm("Excluir este setor?")) void deleteSector(sector.id).then(refresh).catch(e => setMessage(e instanceof Error ? e.message : "Falha ao excluir setor.")); }}>Excluir</button></li>)}</ul>
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
      <ul>{contacts.map((contact) => <li key={contact.id}>{contact.name} — {sectors.find((sector) => sector.id === contact.sectorId)?.name ?? "Setor não encontrado"} <button type="button" disabled={busy} onClick={() => { setContactName(contact.name); setContactSector(contact.sectorId); setSelected("contact:"+contact.id); }}>Editar</button> <button type="button" disabled={busy} onClick={() => { if (window.confirm("Excluir este contato?")) void deleteContact(contact.id).then(refresh).catch(e => setMessage(e instanceof Error ? e.message : "Falha ao excluir contato.")); }}>Excluir</button></li>)}</ul>
    </section>

    <section>
      {isAdministrator && <><h3>Domínios empresariais permitidos</h3>
      <p>Um domínio permitido não aprova automaticamente uma conta; toda solicitação ainda depende de aprovação.</p>
      <textarea rows={4} value={domains} onChange={(event) => setDomains(event.target.value)} />
      <button type="button" disabled={busy} onClick={() => void saveDomains()}>Salvar domínios</button></>}
    </section>
    </>}
  </main>;
}
