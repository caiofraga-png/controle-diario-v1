import { useEffect, useMemo, useState } from "react";

type HistorySummary = { data: string; versao: number; nome: string; concluidoEm: string; origemVersao: string | null };
type HistoryRecord = {
  data: string; versao: number; perfil: { nome: string }; tarefas: Array<{ id: string; nome: string; concluida: boolean; emailsVinculados?: Array<{ id: string; nome: string; concluido: boolean }> }>;
  emailsGlobais: Array<{ id: string; nome: string; concluido: boolean }>; atendimentos?: Array<Record<string, any>>; observacao: string; concluidoEm: string; origemVersao: string | null;
};
function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p=>p.type==="year")?.value}-${parts.find(p=>p.type==="month")?.value}`;
}
function formatDate(value: string) { const [y,m,d] = value.split("-"); return `${d}/${m}/${y}`; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR"); }
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}
function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function tally(record: HistoryRecord) {
  const emails = new Map<string, boolean>();
  for (const email of record.emailsGlobais ?? []) emails.set(email.id, email.concluido);
  for (const task of record.tarefas ?? []) for (const email of task.emailsVinculados ?? []) emails.set(email.id, email.concluido);
  const doneTasks = (record.tarefas ?? []).filter(task => task.concluida).length;
  const doneEmails = [...emails.values()].filter(Boolean).length;
  return { done: doneTasks + doneEmails, total: (record.tarefas ?? []).length + emails.size };
}
const panel: React.CSSProperties = { width: "min(920px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: 22, borderRadius: 16, background: "var(--surface, #fff)", color: "var(--text, #183b2b)", boxShadow: "0 18px 60px rgba(0,0,0,.25)" };
const card: React.CSSProperties = { border: "1px solid var(--border, #d8e5dc)", borderRadius: 12, padding: 14, display: "grid", gap: 9 };
const muted: React.CSSProperties = { color: "var(--muted, #60746a)", fontSize: 13 };
const calendarCell: React.CSSProperties = { minWidth: 0, minHeight: 48, borderRadius: 9, border: "1px solid var(--border, #d8e5dc)", background: "var(--surface, #fff)", color: "var(--text, #183b2b)", display: "grid", placeItems: "center", gap: 2, padding: "5px 2px" };
const activeCalendarCell: React.CSSProperties = { ...calendarCell, background: "var(--accent-soft, #e5f4e9)", border: "1px solid var(--accent, #27834b)", fontWeight: 700, cursor: "pointer" };
const selectedCalendarCell: React.CSSProperties = { ...activeCalendarCell, background: "var(--accent, #27834b)", color: "#fff", borderColor: "var(--accent, #27834b)" };
export default function MyHistoryPanel({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const [year, monthNumber] = month.split("-").map(Number);
    setBusy(true); setMessage(""); setSelectedDate(null); setSelected(null);
    window.controleDiario.firebase.workflow.historicoMensal(year, monthNumber)
      .then((result: HistorySummary[]) => { if (active) setItems(result); })
      .catch((error: unknown) => { if (active) { setItems([]); setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR SEU HISTÓRICO."); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [month, reload]);
  const ordered = useMemo(() => [...items].sort((a,b)=>b.data.localeCompare(a.data)||b.versao-a.versao), [items]);
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, HistorySummary[]>();
    for (const item of ordered) grouped.set(item.data, [...(grouped.get(item.data) ?? []), item]);
    return grouped;
  }, [ordered]);
  const calendarDays = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const offset = (firstWeekday + 6) % 7;
    const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    })];
  }, [month]);
  async function open(item: HistorySummary) {
    setBusy(true); setMessage(""); setSelected(null);
    try { const record = await window.controleDiario.firebase.readHistory(item.nome); setSelected(record); }
    catch (error) { setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ABRIR ESTE EXPEDIENTE."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Meu histórico" onClick={onClose}>
    <section style={panel} onClick={event=>event.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div><h2 style={{margin:"0 0 4px"}}>MEU HISTÓRICO</h2><p style={muted}>Selecione um dia destacado para consultar seus expedientes concluídos. Os registros são somente para leitura.</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar histórico">✕</button>
      </div>
      <section style={{...card, maxWidth:460, margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <button type="button" aria-label="Mês anterior" disabled={busy} onClick={()=>setMonth(value=>shiftMonth(value,-1))}>‹</button>
          <strong style={{textTransform:"capitalize"}}>{monthLabel(month)}</strong>
          <button type="button" aria-label="Próximo mês" disabled={busy} onClick={()=>setMonth(value=>shiftMonth(value,1))}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:5}}>
          {["SEG","TER","QUA","QUI","SEX","SÁB","DOM"].map(day=><span key={day} style={{...muted,textAlign:"center",fontWeight:700,fontSize:11}}>{day}</span>)}
          {calendarDays.map((date,index)=>date ? <button key={date} type="button" disabled={busy || !itemsByDate.has(date)} aria-label={`${formatDate(date)}${itemsByDate.has(date) ? ", possui expediente concluído" : ", sem expediente concluído"}`} aria-pressed={selectedDate===date} onClick={()=>{setSelectedDate(date);setSelected(null);setMessage("");}} style={selectedDate===date?selectedCalendarCell:itemsByDate.has(date)?activeCalendarCell:{...calendarCell,opacity:.48,cursor:"default"}}>{Number(date.slice(-2))}{itemsByDate.has(date)&&<span style={{fontSize:10,lineHeight:1}}>{itemsByDate.get(date)!.length===1?"●":`● ${itemsByDate.get(date)!.length}`}</span>}</button> : <span key={`blank-${index}`} />)}
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"center",flexWrap:"wrap"}}>
          <span style={{...muted,display:"inline-flex",alignItems:"center",gap:5}}><span style={{color:"var(--accent, #27834b)"}}>●</span> Dia com expediente</span>
          <span style={muted}>Escolha o mês pelas setas</span>
        </div>
      </section>
      {busy && <p style={{...muted,textAlign:"center"}}>CARREGANDO…</p>}
      {message && <p className="system-message" role="alert">{message}</p>}
      {!busy && !message && ordered.length===0 && <p style={{...muted,textAlign:"center"}}>NENHUM EXPEDIENTE CONCLUÍDO NESTE MÊS.</p>}
      {!busy && selectedDate && !selected && <section style={{display:"grid",gap:10}}>
        <h3 style={{margin:"8px 0 0"}}>EXPEDIENTES DE {formatDate(selectedDate)}</h3>
        {(itemsByDate.get(selectedDate)??[]).map(item=><article key={item.nome} style={card}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><strong>{item.origemVersao ? "ERRATA" : "EXPEDIENTE CONCLUÍDO"}</strong><span style={muted}>R{String(item.versao).padStart(3,"0")}</span></div>
          <span style={muted}>Concluído em {formatDateTime(item.concluidoEm)}</span>
          <button type="button" disabled={busy} onClick={()=>void open(item)}>VER DETALHES</button>
        </article>)}
      </section>}
      {selected && <section style={{display:"grid",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><h3 style={{margin:"0 0 4px"}}>{formatDate(selected.data)} · {selected.perfil?.nome ?? "Perfil não informado"}</h3><span style={muted}>R{String(selected.versao).padStart(3,"0")} · Concluído em {formatDateTime(selected.concluidoEm)}</span></div><button type="button" onClick={()=>setSelected(null)}>VOLTAR AO DIA</button></div>
        <div style={card}><strong>PROGRESSO FINAL</strong><span>{tally(selected).done}/{tally(selected).total} obrigações concluídas</span><span style={muted}>Situação: CONCLUÍDO</span></div>
        <div style={card}><strong>TAREFAS E E-MAILS</strong>
          {(selected.tarefas??[]).map(task=><div key={task.id} style={{display:"grid",gap:5}}><span>{task.concluida?"✓":"○"} {task.nome}</span>{(task.emailsVinculados??[]).map(email=><span key={email.id} style={{paddingLeft:18,...muted}}>{email.concluido?"✓":"○"} {email.nome}</span>)}</div>)}
          {(selected.emailsGlobais??[]).map(email=><span key={email.id}>{email.concluido?"✓":"○"} {email.nome}</span>)}
        </div>
        <div style={card}><strong>ATENDIMENTOS ({(selected.atendimentos??[]).length})</strong>{(selected.atendimentos??[]).length===0?<span style={muted}>Nenhum atendimento registrado.</span>:(selected.atendimentos??[]).map((item,index)=><div key={String(item.id??index)} style={{borderTop:"1px solid var(--border, #d8e5dc)",paddingTop:8}}><strong>Ticket: {item.ticket||"—"}</strong><div style={muted}>Código: {item.codigo||"—"} · Nome: {item.nome||"—"} · Tipo: {item.tipo||"—"} · Subtipo: {item.subtipo||"—"} · Canal: {item.canal||"—"} · Resolvido: {item.resolvido||"—"}</div></div>)}</div>
        <div style={card}><strong>OBSERVAÇÕES</strong><p style={{whiteSpace:"pre-wrap",margin:0}}>{selected.observacao||"Sem observações."}</p></div>
      </section>}
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap"}}><button type="button" onClick={()=>setReload(value=>value+1)}>ATUALIZAR</button><button type="button" onClick={onClose}>FECHAR</button></div>
    </section>
  </div>;
}
