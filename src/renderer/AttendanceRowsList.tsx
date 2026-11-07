import { useEffect, useState } from "react";
import { subscribeAttendanceRows, type AttendanceRow } from "../web/firebaseAttendanceService";

export default function AttendanceRowsList() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => subscribeAttendanceRows(setRows, e => setError(e.message)), []);
  return <section className="attendance-saved-card">
    <div className="workspace-intro"><h2>Atendimentos copiados</h2><p>Histórico particular dos atendimentos que você enviou para a planilha.</p></div>
    {error&&<p className="attendance-error">{error}</p>}
    {rows.length===0?<p>NENHUM ATENDIMENTO COPIADO AINDA.</p>:<div className="attendance-saved-list">
      {rows.map((row,index)=><article className="attendance-saved-row" key={row.id}>
        <strong>{rows.length-index}. {row.nome || "Cliente sem nome"}</strong>
        <span>TICKET: {row.ticket}</span>
        <span>CÓDIGO: {row.codigo || "—"} · CANAL: {row.canal || "—"}</span>
        <span>TIPO: {row.tipo || "—"} · RESOLVIDO?: {row.resolvido || "—"}</span>
        {row.subtipo&&<span>SUBTIPO: {row.subtipo}</span>}
        {row.motivoResolucao&&<span>MOTIVO: {row.motivoResolucao}</span>}
      </article>)}
    </div>}
  </section>;
}
