import { useEffect, useRef, useState } from "react";
import { subscribeLiveOperationalEvents, type LiveOperationalEvent } from "../web/firebaseLiveOperationalEvents";

type Collaborator = { uid?: string; colaborador?: string; login?: string; setor?: string; contato?: string };

const eventLabels: Record<LiveOperationalEvent["type"], string> = {
  EXPEDIENTE_INICIADO: "Expediente iniciado",
  EXPEDIENTE_FINALIZADO: "Expediente finalizado",
  TAREFA_FINALIZADA: "Tarefa finalizada",
  ATENDIMENTO_REGISTRADO: "Atendimento registrado",
};

export default function LiveOperationalPanel({ collaborators = [] }: { collaborators?: Collaborator[] }) {
  const [events, setEvents] = useState<LiveOperationalEvent[]>([]);
  const [error, setError] = useState("");
  const [captureMessage, setCaptureMessage] = useState("A captura ainda não foi iniciada.");
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);

  function stopCapture() {
    captureStreamRef.current?.getTracks().forEach(track => track.stop());
    captureStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
    setCaptureMessage("Captura encerrada. Nenhuma imagem foi armazenada.");
  }

  async function startCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureMessage("Este navegador não disponibilizou a captura de tela para esta página.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      captureStreamRef.current = stream;
      const [track] = stream.getVideoTracks();
      track?.addEventListener("ended", () => {
        if (captureStreamRef.current === stream) {
          captureStreamRef.current = null;
          setCapturing(false);
          setCaptureMessage("O compartilhamento foi encerrado pelo navegador.");
        }
      }, { once: true });
      setCapturing(true);
      setCaptureMessage("Captura ativa somente nesta aba. As imagens não são gravadas nem enviadas ao Firebase.");
    } catch (captureError) {
      const name = captureError instanceof Error ? captureError.name : "";
      setCaptureMessage(name === "NotAllowedError"
        ? "O compartilhamento foi cancelado ou bloqueado pelo navegador."
        : `Não foi possível iniciar a captura: ${captureError instanceof Error ? captureError.message : String(captureError)}`);
    }
  }

  useEffect(() => {
    if (!capturing || !videoRef.current || !captureStreamRef.current) return;
    const video = videoRef.current;
    video.srcObject = captureStreamRef.current;
    void video.play().catch(() => setCaptureMessage("A captura foi autorizada, mas o navegador não conseguiu reproduzir a prévia."));
    return () => { video.srcObject = null; };
  }, [capturing]);

  useEffect(() => () => {
    captureStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

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
    <section style={{display:"grid",gap:10,padding:14,border:"1px solid var(--border, #dce5de)",borderRadius:10,background:"var(--surface-secondary, #f4f7f5)"}}>
      <div>
        <strong>TESTE TEMPORÁRIO DE CAPTURA DO SOS BETA</strong>
        <p style={{margin:"4px 0 0",fontSize:12,color:"var(--muted, #60746a)"}}>Autorize o compartilhamento da aba do SOS Beta para verificarmos se o Chrome permite a leitura visual. Este teste não grava imagens e não envia conteúdo ao Firebase.</p>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" onClick={() => void startCapture()} disabled={capturing}>INICIAR TESTE DE CAPTURA</button>
        <button type="button" onClick={stopCapture} disabled={!capturing}>ENCERRAR CAPTURA</button>
      </div>
      <p role="status" aria-live="polite" style={{margin:0,fontSize:12}}>{captureMessage}</p>
      {capturing && <video ref={videoRef} autoPlay muted playsInline style={{width:"100%",maxHeight:360,objectFit:"contain",background:"#202020",borderRadius:8}} />}
    </section>
    {!events.length && !error && <div style={{padding:20,border:"1px dashed var(--border, #cbd8ce)",borderRadius:10,textAlign:"center",color:"var(--muted, #60746a)"}}>Aguardando novos acontecimentos nos expedientes…</div>}
    <div style={{display:"grid",gap:8}}>
      {events.map(event => {
        const person = collaborators.find(item => item.uid === event.uid);
        const detail = event.type === "TAREFA_FINALIZADA"
          ? event.task
          : event.type === "ATENDIMENTO_REGISTRADO"
            ? `Subtipo: ${event.subtype || "Não informado"}`
            : `Perfil: ${event.profile}`;
        const icon = event.type === "EXPEDIENTE_INICIADO" ? "▶" : event.type === "EXPEDIENTE_FINALIZADO" ? "■" : event.type === "ATENDIMENTO_REGISTRADO" ? "▤" : "✓";
        return <article key={event.id} style={{display:"grid",gridTemplateColumns:"34px minmax(0,1fr) auto",alignItems:"center",gap:10,padding:12,border:"1px solid var(--border, #dce5de)",borderRadius:9,background:"var(--surface, #fff)"}}>
          <span style={{display:"grid",placeItems:"center",width:32,height:32,borderRadius:8,background:"var(--surface-secondary, #f0f5f1)",fontWeight:800,color:"var(--accent, #187747)"}}>{icon}</span>
          <div style={{minWidth:0}}><strong>{eventLabels[event.type]}</strong><div style={{fontSize:13}}>{nameFor(event.uid)}{person?.setor ? ` · ${person.setor}` : ""}{person?.contato ? ` · ${person.contato}` : ""}</div><div style={{fontSize:12,color:"var(--muted, #60746a)",overflowWrap:"anywhere"}}>{detail}{event.type === "ATENDIMENTO_REGISTRADO" && event.ticket && <>{" · "}Ticket: <a href={event.ticket} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent, #187747)",fontWeight:700}}>Abrir atendimento</a></>}</div></div>
          <time style={{fontSize:12,color:"var(--muted, #60746a)",whiteSpace:"nowrap"}}>{new Date(event.occurredAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</time>
        </article>;
      })}
    </div>
  </section>;
}
