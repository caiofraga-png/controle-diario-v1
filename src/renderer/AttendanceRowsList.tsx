import type { AttendanceRecord } from "../shared/types/state";

export default function AttendanceRowsList({ rows }: { rows: AttendanceRecord[] }) {
  return <section className="attendance-saved-card">
    <div className="workspace-intro"><h2>Atendimentos do expediente</h2><p>Tickets registrados neste expediente. Eles serão preservados junto ao histórico quando o expediente for concluído.</p></div>
    {rows.length===0?<p>NENHUM TICKET REGISTRADO NESTE EXPEDIENTE.</p>:<div className="attendance-saved-list">
      {rows.map((row,index)=><article className="attendance-saved-row" key={row.id}>
        <strong>{index+1}. {row.nome || "Cliente sem nome"}</strong>
        <span>TICKET: {row.ticket}</span>
        <span>CÓDIGO: {row.codigo || "—"} · CANAL: {row.canal || "—"}</span>
        <span>TIPO: {row.tipo || "—"} · RESOLVIDO?: {row.resolvido || "—"}</span>
        {row.subtipo&&<span>SUBTIPO: {row.subtipo}</span>}
        {row.motivoResolucao&&<span>MOTIVO: {row.motivoResolucao}</span>}
      </article>)}
    </div>}
  </section>;
}
