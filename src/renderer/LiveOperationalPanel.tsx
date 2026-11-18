import { useEffect, useState } from "react";
import { subscribeLiveOperationalEvents, type LiveOperationalEvent } from "../web/firebaseLiveOperationalEvents";

type Collaborator = { uid?: string; colaborador?: string; login?: string; setor?: string; contato?: string };

const eventLabels: Record<LiveOperationalEvent["type"], string> = {
  EXPEDIENTE_INICIADO: "Expediente iniciado",
  EXPEDIENTE_FINALIZADO: "Expediente finalizado",
  TAREFA_FINALIZADA: "Tarefa finalizada",
};

export default function LiveOperationalPanel({ collaborators = [] }: { collaborators?: Collaborator[] }) {
  const [events, setEvents] = useState<LiveOperationalEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    return subscribeLiveOperationalEvents(setEvents, error => setError(error.message));
  }, []);

  const nameFor = (uid: string) => {
    const person = collaborators.find(item => item.uid === uid);
    return person?.colaborador || person?.login || uid;
  };

  return <section style={{display:"grid",gap:12}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div><h3 style={{margin:0}}>ACOMPANHAMENTO EM TEMPO REAL</h3><p style={{margin:"4px 0 0",fontSize:12,color:"var(--muted, #60746a)"}}>Eventos recebidos enquanto este painel estiver aberto.</p></div>
      <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12,fontWeight:700,color:"#16834a"}}><span style={{width:8,height:8,borderRadius:99,background:"#16a34a"}}/> CONECTADO</span>
    </div>
    {error && <p className="system-message" role="alert">{error}</p>}
    {!events.length && !error && <div style={{padding:20,border:"1px dashed var(--border, #cbd8ce)",borderRadius:10,textAlign:"center",color:"var(--muted, #60746a)"}}>Aguardando novos acontecimentos nos expedientes…</div>}
    <div style={{display:"grid",gap:8}}>
      {events.map(event => {
        const person = collaborators.find(item => item.uid === event.uid);
        const detail = event.type === "TAREFA_FINALIZADA" ? event.task : `Perfil: ${event.profile}`;
        const icon = event.type === "EXPEDIENTE_INICIADO" ? "▶" : event.type === "EXPEDIENTE_FINALIZADO" ? "■" : "✓";
        return <article key={event.id} style={{display:"grid",gridTemplateColumns:"34px minmax(0,1fr) auto",alignItems:"center",gap:10,padding:12,border:"1px solid var(--border, #dce5de)",borderRadius:9,background:"var(--surface, #fff)"}}>
          <span style={{display:"grid",placeItems:"center",width:32,height:32,borderRadius:8,background:"var(--surface-secondary, #f0f5f1)",fontWeight:800,color:"var(--accent, #187747)"}}>{icon}</span>
          <div style={{minWidth:0}}><strong>{eventLabels[event.type]}</strong><div style={{fontSize:13}}>{nameFor(event.uid)}{person?.setor ? ` · ${person.setor}` : ""}{person?.contato ? ` · ${person.contato}` : ""}</div><div style={{fontSize:12,color:"var(--muted, #60746a)",overflowWrap:"anywhere"}}>{detail}</div></div>
          <time style={{fontSize:12,color:"var(--muted, #60746a)",whiteSpace:"nowrap"}}>{new Date(event.occurredAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</time>
        </article>;
      })}
    </div>
  </section>;
}
