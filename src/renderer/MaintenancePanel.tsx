import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  canCurrentUserManageMaintenances,
  loadMaintenanceHistory,
  saveExternalMaintenance,
  subscribeExternalMaintenances,
  type ExternalMaintenance,
  type ExternalMaintenanceInput,
  type MaintenanceHistory,
} from "../web/firebaseMaintenanceService";

type View = "ongoing" | "completed";
const EMPTY_FORM: ExternalMaintenanceInput = {
  title: "",
  date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  location: "",
  description: "",
  status: "ongoing",
};

function timestampLabel(value: unknown): string {
  if (!value) return "Data não disponível";
  const date = typeof (value as any)?.toDate === "function" ? (value as any).toDate() : new Date(value as any);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string): string {
  return status === "completed" ? "Concluída" : "Em andamento";
}

export default function MaintenancePanel() {
  const [items, setItems] = useState<ExternalMaintenance[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("ongoing");
  const [editing, setEditing] = useState<ExternalMaintenance | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ExternalMaintenanceInput>(EMPTY_FORM);
  const [historyItem, setHistoryItem] = useState<ExternalMaintenance | null>(null);
  const [history, setHistory] = useState<MaintenanceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const stop = subscribeExternalMaintenances(
      next => { if (active) { setItems(next); setLoading(false); } },
      error => { if (active) { setMessage(error.message); setLoading(false); } },
    );
    void canCurrentUserManageMaintenances()
      .then(value => { if (active) setCanManage(value); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL VERIFICAR A PERMISSÃO."); });
    return () => { active = false; stop(); };
  }, []);

  const visibleItems = useMemo(
    () => items.filter(item => item.status === view).sort((a,b) => b.date.localeCompare(a.date)),
    [items, view],
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setCreating(true);
    setMessage("");
  }

  function openEdit(item: ExternalMaintenance) {
    setEditing(item);
    setForm({
      title: item.title,
      date: item.date,
      location: item.location,
      description: item.description,
      status: item.status,
    });
    setCreating(true);
    setMessage("");
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await saveExternalMaintenance({
        title: form.title.trim(),
        date: form.date,
        location: form.location.trim(),
        description: form.description.trim(),
        status: form.status,
      }, editing?.id);
      closeForm();
      setView(form.status);
      setMessage(editing ? "MANUTENÇÃO ATUALIZADA COM SUCESSO." : "MANUTENÇÃO CADASTRADA COM SUCESSO.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR A MANUTENÇÃO.");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(item: ExternalMaintenance) {
    setHistoryItem(item);
    setHistory([]);
    setHistoryLoading(true);
    setMessage("");
    try {
      setHistory(await loadMaintenanceHistory(item.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR O HISTÓRICO.");
    } finally {
      setHistoryLoading(false);
    }
  }

  return <section className="maintenance-workspace">
    <div className="workspace-intro maintenance-intro">
      <div>
        <h2>Área Falha</h2>
        <p>Acompanhe manutenções em andamento e consulte os registros concluídos.</p>
      </div>
      {canManage && view === "ongoing" && !creating && !historyItem && <button className="primary maintenance-new-button" onClick={openCreate}>＋ NOVA MANUTENÇÃO</button>}
    </div>

    {message && <p role="status" className="system-message">{message}</p>}

    {creating ? <section className="maintenance-form-card">
      <div className="maintenance-section-heading">
        <div><h3>{editing ? "EDITAR MANUTENÇÃO" : "CADASTRAR MANUTENÇÃO"}</h3><p>Preencha os dados e salve para registrar a alteração no histórico.</p></div>
      </div>
      <form className="maintenance-form" onSubmit={event => void submitForm(event)}>
        <label>TÍTULO<input value={form.title} maxLength={120} required onChange={event=>setForm(current=>({...current,title:event.target.value}))} placeholder="Ex.: Manutenção de rede externa"/></label>
        <div className="maintenance-form-row">
          <label>DATA<input type="date" value={form.date} required onChange={event=>setForm(current=>({...current,date:event.target.value}))}/></label>
          <label>LOCAL<input value={form.location} maxLength={160} required onChange={event=>setForm(current=>({...current,location:event.target.value}))} placeholder="Bairro, endereço ou referência"/></label>
        </div>
        <label>DESCRIÇÃO<textarea value={form.description} maxLength={2000} rows={4} required onChange={event=>setForm(current=>({...current,description:event.target.value}))} placeholder="Descreva o serviço, impacto e informações relevantes."/></label>
        <label>STATUS<select value={form.status} onChange={event=>setForm(current=>({...current,status:event.target.value as ExternalMaintenanceInput["status"]}))}>
          <option value="ongoing">Em andamento</option><option value="completed">Concluída</option>
        </select></label>
        <div className="maintenance-form-actions">
          <button type="button" className="secondary" disabled={saving} onClick={closeForm}>CANCELAR</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "SALVANDO…" : "SALVAR MANUTENÇÃO"}</button>
        </div>
      </form>
    </section> : historyItem ? <section className="maintenance-history-card">
      <div className="maintenance-section-heading">
        <div><h3>HISTÓRICO DA MANUTENÇÃO</h3><p>{historyItem.title} · {historyItem.location}</p></div>
        <button className="secondary" onClick={()=>setHistoryItem(null)}>VOLTAR</button>
      </div>
      {historyLoading ? <p>CARREGANDO HISTÓRICO…</p> : history.length === 0 ? <p>NENHUMA ALTERAÇÃO REGISTRADA.</p> :
        <ol className="maintenance-history-list">{history.map(entry=><li key={entry.id}>
          <div className="maintenance-history-meta"><strong>{timestampLabel(entry.changedAt)}</strong><span>Responsável: {entry.changedByName || entry.changedByUid}</span></div>
          {entry.before === null ? <p>Cadastro inicial da manutenção.</p> : <div className="maintenance-history-diff">
            {(["title","date","location","description","status"] as const).filter(key=>entry.before?.[key]!==entry.after?.[key]).map(key=><div key={key}>
              <strong>{{title:"Título",date:"Data",location:"Local",description:"Descrição",status:"Status"}[key]}</strong>
              <span>Anterior: {key==="status"?statusLabel(String(entry.before?.[key])):String(entry.before?.[key]??"—")}</span>
              <span>Atual: {key==="status"?statusLabel(String(entry.after?.[key])):String(entry.after?.[key]??"—")}</span>
            </div>)}
          </div>}
        </li>)}</ol>}
    </section> : <>
      <div className="maintenance-view-tabs" role="tablist" aria-label="Visualização de manutenções">
        <button className={view==="ongoing"?"active":""} onClick={()=>setView("ongoing")}>EM ANDAMENTO <span>{items.filter(item=>item.status==="ongoing").length}</span></button>
        <button className={view==="completed"?"active":""} onClick={()=>setView("completed")}>CONCLUÍDAS / HISTÓRICO <span>{items.filter(item=>item.status==="completed").length}</span></button>
      </div>
      {loading ? <div className="maintenance-empty">CARREGANDO MANUTENÇÕES…</div> : visibleItems.length === 0 ?
        <div className="maintenance-empty">{view==="ongoing"?"NÃO HÁ MANUTENÇÕES EM ANDAMENTO.":"NENHUMA MANUTENÇÃO CONCLUÍDA ATÉ O MOMENTO."}</div> :
        <div className="maintenance-grid">{visibleItems.map(item=><article className="maintenance-card" key={item.id}>
          <div className="maintenance-card-top"><span className={item.status==="completed"?"maintenance-status completed":"maintenance-status"}>{statusLabel(item.status)}</span><span className="maintenance-date">{item.date.split("-").reverse().join("/")}</span></div>
          <h3>{item.title}</h3>
          <p className="maintenance-location">⌖ {item.location}</p>
          <p className="maintenance-description">{item.description}</p>
          <div className="maintenance-card-meta">Atualizada em {timestampLabel(item.updatedAt)}</div>
          <div className="maintenance-card-actions">
            <button className="secondary" onClick={()=>void openHistory(item)}>HISTÓRICO</button>
            {canManage && <button className="primary" onClick={()=>openEdit(item)}>EDITAR</button>}
          </div>
        </article>)}</div>}
    </>}
  </section>;
}
