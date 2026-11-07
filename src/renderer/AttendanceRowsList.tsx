import { useState } from "react";
import type { AttendanceRecord } from "../shared/types/state";

type Props = { rows: AttendanceRecord[]; editable?: boolean; onChange?: (rows: AttendanceRecord[]) => Promise<void> };
const fields: { key: keyof AttendanceRecord; label: string }[] = [
  { key: "nome", label: "NOME" }, { key: "ticket", label: "TICKET" },
  { key: "codigo", label: "CÓDIGO" }, { key: "canal", label: "CANAL" },
  { key: "tipo", label: "TIPO" }, { key: "resolvido", label: "RESOLVIDO?" },
  { key: "subtipo", label: "SUBTIPO" }, { key: "motivoResolucao", label: "MOTIVO" },
];
function cells(row: AttendanceRecord, index: number) {
  return [String(index + 1), row.nome, row.ticket, row.codigo, row.canal, row.tipo, row.resolvido, row.subtipo, row.motivoResolucao];
}
export default function AttendanceRowsList({ rows, editable = false, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AttendanceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function commit(next: AttendanceRecord[]) {
    if (!onChange || busy) return;
    setBusy(true); setMessage("");
    try { await onChange(next); setEditingId(null); setDraft(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL ATUALIZAR OS ATENDIMENTOS."); }
    finally { setBusy(false); }
  }
  async function copyList() {
    const text = rows.map((row, index) => cells(row, index).join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); setMessage("LISTA COPIADA. COLE NA PLANILHA."); }
    catch { setMessage("NÃO FOI POSSÍVEL COPIAR A LISTA. VERIFIQUE A PERMISSÃO DA ÁREA DE TRANSFERÊNCIA."); }
  }
  return <section className="attendance-saved-card">
    <div className="workspace-intro"><h2>Atendimentos do dia</h2><p>Tickets registrados até o momento.</p></div>
    {rows.length===0?<p>NENHUM TICKET REGISTRADO NESTE EXPEDIENTE.</p>:<>
      <div className="attendance-saved-list">
        {rows.map((row,index)=><article className="attendance-saved-row" key={row.id}>
          {editingId===row.id && draft ? <div className="attendance-edit-grid">
            {fields.map(field=><label className="attendance-field" key={field.key}><span>{field.label}</span><input value={String(draft[field.key] ?? "")} onChange={e=>setDraft(current=>current?({...current,[field.key]:e.target.value}):current)}/></label>)}
            <div className="attendance-actions"><button disabled={busy||!draft.ticket.trim()||!draft.nome.trim()} onClick={()=>void commit(rows.map(item=>item.id===draft.id?draft:item))}>SALVAR</button><button disabled={busy} onClick={()=>{setEditingId(null);setDraft(null);}}>CANCELAR</button></div>
          </div> : <>
            <div className="attendance-compact-line" aria-label={cells(row,index).join(" ")}>
              <strong>{index+1}. {row.nome}</strong>{" "}{row.ticket}{" "}{row.codigo}{" "}{row.canal}{" "}{row.tipo}{" "}{row.resolvido}{" "}{row.subtipo}{" "}{row.motivoResolucao}
            </div>
            {editable&&<div className="attendance-actions">
              <button disabled={busy||index===0} title="Mover para cima" onClick={()=>{const next=[...rows];[next[index-1],next[index]]=[next[index],next[index-1]];void commit(next);}}>↑</button>
              <button disabled={busy||index===rows.length-1} title="Mover para baixo" onClick={()=>{const next=[...rows];[next[index+1],next[index]]=[next[index],next[index+1]];void commit(next);}}>↓</button>
              <button disabled={busy} onClick={()=>{setEditingId(row.id);setDraft({...row});}}>EDITAR</button>
              <button disabled={busy} onClick={()=>{if(window.confirm("Deseja remover este ticket do expediente?"))void commit(rows.filter(item=>item.id!==row.id));}}>REMOVER</button>
            </div>}
          </>}
        </article>)}
      </div>
      <div className="attendance-actions"><button className="attendance-primary" disabled={busy} onClick={()=>void copyList()}>COPIAR LISTA</button></div>
    </>}
    {message&&<p className="attendance-success" role="status">{message}</p>}
  </section>;
}
