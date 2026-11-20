import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { subscribeLiveOperationalEvents, type LiveOperationalEvent } from "../web/firebaseLiveOperationalEvents";

type Collaborator = { uid?: string; colaborador?: string; login?: string; setor?: string; contato?: string };
type PurpleCardTrack = { id: number; x: number; y: number; area: number; startedAt: number; missing: number };

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
  const [purpleDetected, setPurpleDetected] = useState(false);
  const [callName, setCallName] = useState("");
  const [callElapsed, setCallElapsed] = useState(0);
  const [purpleCards, setPurpleCards] = useState<PurpleCardTrack[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const tracksRef = useRef<PurpleCardTrack[]>([]);
  const nextTrackIdRef = useRef(1);
  const callStartedAtRef = useRef<number | null>(null);
  const purpleFramesRef = useRef(0);
  const [eventPage, setEventPage] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);

  async function readCardNames() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) { setOcrText("A captura ainda não está pronta."); return; }
    setOcrBusy(true); setOcrText("Preparando reconhecimento de texto local…");
    try {
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível preparar a imagem.");
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const worker = await createWorker("por+eng");
      try { const result = await worker.recognize(canvas); setOcrText(result.data.text.trim() || "Nenhum texto reconhecido. Tente aproximar ou ampliar a captura."); } finally { await worker.terminate(); }
    } catch (err) { setOcrText("Falha no OCR: " + (err instanceof Error ? err.message : String(err))); }
    finally { setOcrBusy(false); }
  }

  function stopCapture() {
    captureStreamRef.current?.getTracks().forEach(track => track.stop());
    captureStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
    setPurpleDetected(false);
    callStartedAtRef.current = null;
    purpleFramesRef.current = 0;
    setCallElapsed(0);
    tracksRef.current = []; setPurpleCards([]);
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
          setPurpleDetected(false);
          callStartedAtRef.current = null;
          setCallElapsed(0);
          tracksRef.current = []; setPurpleCards([]);
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

  // Detector experimental de cartões roxos separados por componentes conectados; processamento local.
  useEffect(() => {
    if (!capturing) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const mask = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (r > 105 && b > 105 && g < 105 && r > g * 1.35 && b > g * 1.35) mask[p] = 1;
      }
      const visited = new Uint8Array(mask.length), components: {x:number;y:number;area:number}[] = [];
      for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || visited[start]) continue;
        const queue = [start]; visited[start] = 1; let head = 0, area = 0, sx = 0, sy = 0;
        while (head < queue.length) {
          const idx = queue[head++], x = idx % canvas.width, y = Math.floor(idx / canvas.width);
          area++; sx += x; sy += y;
          const neighbors = [idx-1,idx+1,idx-canvas.width,idx+canvas.width];
          for (const n of neighbors) {
            if (n < 0 || n >= mask.length || visited[n] || !mask[n]) continue;
            if ((n === idx-1 && x === 0) || (n === idx+1 && x === canvas.width-1)) continue;
            visited[n] = 1; queue.push(n);
          }
        }
        if (area >= 22) components.push({x:sx/area,y:sy/area,area});
      }
      const now = Date.now(), previous = tracksRef.current, used = new Set<number>();
      const next: PurpleCardTrack[] = [];
      for (const comp of components) {
        let best: PurpleCardTrack | undefined, bestDist = 36*36;
        for (const old of previous) {
          if (used.has(old.id)) continue;
          const d = (old.x-comp.x)**2 + (old.y-comp.y)**2;
          if (d < bestDist) { bestDist = d; best = old; }
        }
        if (best) { used.add(best.id); next.push({...best,x:comp.x,y:comp.y,area:comp.area,missing:0}); }
        else next.push({id:nextTrackIdRef.current++,x:comp.x,y:comp.y,area:comp.area,startedAt:now,missing:0});
      }
      for (const old of previous) if (!used.has(old.id) && !components.some(comp => (old.x-comp.x)**2+(old.y-comp.y)**2 < 36*36)) {
        if (old.missing < 2) next.push({...old,missing:old.missing+1});
      }
      tracksRef.current = next; setPurpleCards(next);
      setPurpleDetected(next.some(card=>card.missing===0));
      setCallElapsed(next.length ? Math.floor((now - Math.min(...next.map(card=>card.startedAt)))/1000) : 0);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [capturing]);

  useEffect(() => () => {
    captureStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    return subscribeLiveOperationalEvents(setEvents, error => setError(error.message));
  }, []);

  const formatElapsed = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2,"0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
  const visibleEvents = events.slice(eventPage * pageSize, (eventPage + 1) * pageSize);

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
      {capturing && <div style={{display:"grid",gap:8,padding:10,border:"1px solid var(--border, #dce5de)",borderRadius:8}}>
        <strong>TESTE EXPERIMENTAL DE RECONHECIMENTO DE NOMES (OCR)</strong>
        <button type="button" onClick={() => void readCardNames()} disabled={ocrBusy}>{ocrBusy ? "LENDO TEXTO…" : "LER NOMES DOS CARDS VISÍVEIS"}</button>
        <div style={{padding:8,border:"1px solid var(--border, #dce5de)",borderRadius:6,whiteSpace:"pre-wrap",fontSize:13}}>{ocrText || "Clique em LER NOMES para testar cartões amarelos, brancos ou roxos. O processamento é local."}</div>
        <strong>MONITOR EXPERIMENTAL DE LIGAÇÃO (DETECTOR VISUAL ROXO)</strong>
        <label style={{fontSize:12}}>Identificação manual do colaborador: <input value={callName} onChange={e=>setCallName(e.target.value)} placeholder="Nome do colaborador" style={{marginLeft:6}} /></label>
        <div style={{fontWeight:800,color:purpleDetected?"#9b27b0":"var(--muted, #60746a)"}}>{purpleDetected ? "CARTÃO ROXO DETECTADO" : "NENHUM CARTÃO ROXO DETECTADO"} · {formatElapsed(callElapsed)}</div>
        <p style={{margin:0,fontSize:12}}>Experimento local: separa áreas roxas em cartões aproximados e acompanha cada um individualmente. Ainda não gera alertas nem identifica nomes automaticamente; pode confundir ou perder cartões.</p>
      </div>}
      {capturing && <div style={{display:"grid",gap:6}}><strong>Cartões roxos acompanhados: {purpleCards.filter(card=>card.missing===0).length}</strong>{purpleCards.map(card=><div key={card.id} style={{padding:8,border:"1px solid var(--border, #dce5de)",borderRadius:6,display:"flex",justifyContent:"space-between",gap:8}}><span>Cartão experimental #{card.id}{card.missing ? " (confirmando ausência)" : ""}</span><strong>{formatElapsed(Math.floor((Date.now()-card.startedAt)/1000))}</strong></div>)}{!purpleCards.length && <span style={{fontSize:12}}>Nenhum cartão individual localizado ainda.</span>}</div>}{capturing && <video ref={videoRef} autoPlay muted playsInline style={{width:"100%",maxHeight:360,objectFit:"contain",background:"#202020",borderRadius:8}} />}
    </section>
    {!events.length && !error && <div style={{padding:20,border:"1px dashed var(--border, #cbd8ce)",borderRadius:10,textAlign:"center",color:"var(--muted, #60746a)"}}>Aguardando novos acontecimentos nos expedientes…</div>}
    <div style={{display:"grid",gap:8}}>
      {visibleEvents.map(event => {
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
    {events.length > pageSize && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",paddingTop:8}}>
      <span style={{fontSize:12,color:"var(--muted, #60746a)"}}>Página {eventPage+1} de {pageCount} · {events.length} avisos carregados</span>
      <div style={{display:"flex",gap:8}}><button type="button" onClick={()=>setEventPage(p=>Math.max(0,p-1))} disabled={eventPage===0}>ANTERIOR</button><button type="button" onClick={()=>setEventPage(p=>Math.min(pageCount-1,p+1))} disabled={eventPage>=pageCount-1}>PRÓXIMA</button></div>
    </div>}
  </section>;
}
