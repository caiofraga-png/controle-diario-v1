import { useState } from "react";
import type { AttendanceRecord } from "../shared/types/state";

type AttendanceDraft = {
  ticket: string; canal: string; codigo: string; nome: string;
  tipo: string; resolvido: string; subtipo: string; motivoResolucao: string;
};
function valueAfterLabel(text: string, label: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const target = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim().replace(/:$/, "");
    const normalized = current.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized !== target) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate) return candidate;
    }
  }
  return "";
}
const channels = ["📞 ⬅", "☎ ➜", "🔵", "📱", "💬", "🏠", "💳", "📲"];
const types = ["🛒", "🛠️", "💰", "♻️"];
const resolutions = ["✅", "❌", "📌", "⬅ BACK", "♻️"];
const emptyDraft: AttendanceDraft = { ticket:"", canal:"", codigo:"", nome:"", tipo:"", resolvido:"", subtipo:"", motivoResolucao:"" };

export default function AtendimentosPanel({ onSave, hasExpediente }: { onSave: (record: AttendanceRecord) => Promise<void>; hasExpediente: boolean }) {
  const [ticketText, setTicketText] = useState("");
  const [ticketLink, setTicketLink] = useState("");
  const [draft, setDraft] = useState<AttendanceDraft | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof AttendanceDraft, value: string) => setDraft(current => current ? { ...current, [key]: value } : current);

  function processTicket() {
    setError(""); setCopied(false);
    const nome = valueAfterLabel(ticketText, "Cliente");
    const codigo = valueAfterLabel(ticketText, "Código do Cliente");
    if (!ticketLink.trim()) { setDraft(null); setError("INFORME O LINK DO TICKET."); return; }
    if (!nome || nome === "Informações do Cliente") { setDraft(null); setError("NÃO FOI POSSÍVEL IDENTIFICAR O NOME DO CLIENTE. CONFIRA O TEXTO COPIADO."); return; }
    setDraft({ ...emptyDraft, ticket: ticketLink.trim(), codigo, nome });
  }

  async function copyRow() {
    if (!draft || saving) return;
    setSaving(true); setError(""); setCopied(false);
    try {
      if (!hasExpediente) throw new Error("INICIE UM EXPEDIENTE ANTES DE COPIAR O TICKET.");
      await onSave({ ...draft, id: globalThis.crypto.randomUUID(), criadoEm: new Date().toISOString() });
      const cells = [draft.ticket, draft.canal, draft.codigo, draft.nome, draft.tipo, draft.resolvido, draft.subtipo, draft.motivoResolucao];
      try { await navigator.clipboard.writeText(cells.join("\t")); setCopied(true); }
      catch { setCopied(true); setError("ATENDIMENTO SALVO NO EXPEDIENTE. A CÓPIA AUTOMÁTICA FALHOU; COPIE OS CAMPOS MANUALMENTE."); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR O ATENDIMENTO.");
    } finally { setSaving(false); }
  }

  return <section className="attendances-workspace">
    <div className="workspace-intro"><h2>Atendimentos</h2><p>Processe o ticket, revise os campos e copie a linha para a planilha.</p></div>
    <div className="attendance-form-card">
      <label className="attendance-field"><span>LINK DO TICKET</span><input value={ticketLink} onChange={e=>{setTicketLink(e.target.value);setDraft(null);setCopied(false);}} /></label>
      <label className="attendance-field"><span>CONTEÚDO COPIADO</span><textarea value={ticketText} onChange={e=>{setTicketText(e.target.value);setDraft(null);setCopied(false);}} rows={12} placeholder="Cole o conteúdo do ticket aqui" /></label>
      <div className="attendance-actions">
        <button className="attendance-primary" onClick={processTicket} disabled={!ticketText.trim()||!ticketLink.trim()}>PROCESSAR TICKET</button>
        <button className="attendance-secondary" onClick={()=>{setTicketText("");setTicketLink("");setDraft(null);setError("");setCopied(false);}}>LIMPAR</button>
      </div>
      {!hasExpediente&&<p className="attendance-error">INICIE UM EXPEDIENTE PARA REGISTRAR OS TICKETS.</p>}{error&&<p className="attendance-error" role="alert">{error}</p>}
    </div>
    {draft&&<div className="attendance-preview-card">
      <div className="attendance-preview-head"><h3>CONFERÊNCIA DOS DADOS</h3><span>EDITÁVEL</span></div>
      <div className="attendance-edit-grid">
        <label className="attendance-field"><span>TICKET</span><input value={draft.ticket} onChange={e=>update("ticket",e.target.value)}/></label>
        <label className="attendance-field"><span>CANAL</span><select value={draft.canal} onChange={e=>update("canal",e.target.value)}><option value="">SELECIONE</option>{channels.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="attendance-field"><span>CÓDIGO</span><input value={draft.codigo} onChange={e=>update("codigo",e.target.value)}/></label>
        <label className="attendance-field"><span>NOME</span><input value={draft.nome} onChange={e=>update("nome",e.target.value)}/></label>
        <label className="attendance-field"><span>TIPO</span><select value={draft.tipo} onChange={e=>update("tipo",e.target.value)}><option value="">SELECIONE</option>{types.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="attendance-field"><span>RESOLVIDO?</span><select value={draft.resolvido} onChange={e=>update("resolvido",e.target.value)}><option value="">SELECIONE</option>{resolutions.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="attendance-field"><span>SUBTIPO</span><input value={draft.subtipo} onChange={e=>update("subtipo",e.target.value)} placeholder="Preenchimento manual"/></label>
        <label className="attendance-field"><span>MOTIVO RESOLUÇÃO/RETENÇÃO</span><textarea rows={3} value={draft.motivoResolucao} onChange={e=>update("motivoResolucao",e.target.value)} placeholder="Preenchimento manual"/></label>
      </div>
      <button className="attendance-primary" disabled={saving||!hasExpediente||!draft.ticket.trim()||!draft.nome.trim()} onClick={()=>void copyRow()}>{saving?"SALVANDO…":copied?"✓ COPIAR OUTRA VEZ":"COPIAR PARA PLANILHA"}</button>
      {copied&&<p className="attendance-success">LINHA SALVA NO EXPEDIENTE E COPIADA. COLE NA PLANILHA.</p>}
    </div>}
  </section>;
}
