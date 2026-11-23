import { useEffect, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
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
  const [ocrCards, setOcrCards] = useState<string[]>([]);
  const [ocrDiagnostic, setOcrDiagnostic] = useState<string>("");
  const [ocrPixelCount, setOcrPixelCount] = useState(0);
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
    setOcrBusy(true); setOcrText("Localizando cartões amarelos e lendo cada região…"); setOcrCards([]);
    try {
      const frame = document.createElement("canvas"); frame.width = 480; frame.height = 270;
      const frameCtx = frame.getContext("2d", { willReadFrequently: true });
      if (!frameCtx) throw new Error("Não foi possível preparar a imagem.");
      frameCtx.drawImage(video, 0, 0, frame.width, frame.height);
      const pixels = frameCtx.getImageData(0,0,frame.width,frame.height).data;
      const mask = new Uint8Array(frame.width*frame.height);
      for (let i=0,p=0;i<pixels.length;i+=4,p++) {
        const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        // Faixa ampla de amarelo/âmbar, para tolerar variações entre temas.
        if (r>125 && g>85 && b<190 && r>=g*0.92 && g>b*1.12 && r-b>45) mask[p]=1;
      }
      // Diagnóstico em magenta puro, para destacar claramente os pixels classificados.
      const diagnostic=document.createElement("canvas");diagnostic.width=frame.width;diagnostic.height=frame.height;
      const diagCtx=diagnostic.getContext("2d");if(diagCtx){diagCtx.drawImage(frame,0,0);let count=0;
        const img=diagCtx.getImageData(0,0,frame.width,frame.height);
        for(let p=0;p<mask.length;p++){if(mask[p]){count++;const k=p*4;img.data[k]=255;img.data[k+1]=0;img.data[k+2]=255;}}
        diagCtx.putImageData(img,0,0);setOcrDiagnostic(diagnostic.toDataURL("image/png"));setOcrPixelCount(count);}
      // Divide a tela em cinco regiões fixas do SOS Beta. As coordenadas
      // são aproximadas e relativas à captura; cada setor é analisado separadamente.
      const regions=[
        // Layout aproximado do painel: três setores na faixa superior e dois na inferior.
        // Evita sobreposição entre as regiões, que duplicava/fragmentava cartões.
        {name:"FINANCEIRO - LESTE",x:0,y:55,w:160,h:88},
        {name:"SUPORTE - LESTE",x:160,y:55,w:160,h:88},
        {name:"COMERCIAL - LESTE",x:320,y:55,w:160,h:88},
        {name:"CANCELAMENTO - LESTE",x:0,y:143,w:240,h:127},
        {name:"ATENDIMENTO - LESTE",x:240,y:143,w:240,h:127},
      ];
      const boxes:{x:number;y:number;w:number;h:number;area:number;region:string}[]=[];
      for(const region of regions){
        const rowCounts=new Int32Array(region.h),colCounts=new Int32Array(region.w);
        for(let y=0;y<region.h;y++)for(let x=0;x<region.w;x++)
          if(mask[(region.y+y)*frame.width+region.x+x])rowCounts[y]++;
        const bands:{start:number;end:number}[]=[];let bandStart=-1;
        for(let y=0;y<region.h;y++){
          if(rowCounts[y]>=Math.max(10,Math.floor(region.w*0.12))){if(bandStart<0)bandStart=y;}
          else if(bandStart>=0){if(y-bandStart>=4)bands.push({start:bandStart,end:y-1});bandStart=-1;}
        }
        if(bandStart>=0&&region.h-bandStart>=4)bands.push({start:bandStart,end:region.h-1});
        for(const band of bands){
          colCounts.fill(0);
          for(let y=band.start;y<=band.end;y++)for(let x=0;x<region.w;x++)
            if(mask[(region.y+y)*frame.width+region.x+x])colCounts[x]++;
          const spans:{start:number;end:number}[]=[];let spanStart=-1;
          for(let x=0;x<region.w;x++){
            if(colCounts[x]>=Math.max(2,Math.floor((band.end-band.start+1)*0.16))){if(spanStart<0)spanStart=x;}
            else if(spanStart>=0){if(x-spanStart>=18)spans.push({start:spanStart,end:x-1});spanStart=-1;}
          }
          if(spanStart>=0&&region.w-spanStart>=18)spans.push({start:spanStart,end:region.w-1});
          for(const span of spans){
            const w=span.end-span.start+1,h=band.end-band.start+1;
            if(w>=18&&h>=5&&w/h>=1.1){
              let area=0;for(let y=band.start;y<=band.end;y++)for(let x=span.start;x<=span.end;x++)
                if(mask[(region.y+y)*frame.width+region.x+x])area++;
              boxes.push({x:region.x+span.start,y:region.y+band.start,w,h,area,region:region.name});
            }
          }
        }
      }
      boxes.sort((a,b)=>regions.findIndex(r=>r.name===a.region)-regions.findIndex(r=>r.name===b.region)||a.y-b.y||a.x-b.x);
      if(!boxes.length){setOcrText("Pixels amarelos detectados, mas ainda não foi possível delimitar cartões individuais. Confira o mapa magenta.");return;}
      const worker=await createWorker("por+eng");
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        const found:string[]=[]; const sectorCounters:Record<string,number>={};
        for(let i=0;i<Math.min(boxes.length,30);i++){
          const b=boxes[i],pad=3,scale=8,crop=document.createElement("canvas");
          // Ampliação maior e limite de tamanho para evitar sobrecarga do navegador.
          crop.width=Math.min(1600,(b.w+pad*2)*scale);crop.height=Math.min(800,(b.h+pad*2)*scale);
          const cropCtx=crop.getContext("2d",{willReadFrequently:true});if(!cropCtx)continue;
          cropCtx.imageSmoothingEnabled=false;
          cropCtx.drawImage(frame,Math.max(0,b.x-pad),Math.max(0,b.y-pad),b.w+pad*2,b.h+pad*2,0,0,crop.width,crop.height);
          // Converte o fundo colorido em contraste alto para destacar o texto escuro.
          const image=cropCtx.getImageData(0,0,crop.width,crop.height);
          for(let p=0;p<image.data.length;p+=4){
            const gray=Math.round(image.data[p]*0.299+image.data[p+1]*0.587+image.data[p+2]*0.114);
            const value=gray>145?255:0;
            image.data[p]=image.data[p+1]=image.data[p+2]=value;
          }
          cropCtx.putImageData(image,0,0);
          const result=await worker.recognize(crop),txt=result.data.text.trim().replace(/\\s+/g," ");
          sectorCounters[b.region]=(sectorCounters[b.region]||0)+1;
          found.push(b.region+" · Card "+sectorCounters[b.region]+": "+(txt||"(texto não reconhecido)"));
        }
        setOcrCards(found);setOcrText("Leitura individual experimental por setor: "+boxes.length+" cartões delimitados (até 30 processados).");
      }finally{await worker.terminate();}
    }catch(err){setOcrText("Falha na leitura individual: "+(err instanceof Error?err.message:String(err)));}
    finally{setOcrBusy(false);}
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

  return <section className="live-operational-panel" style={{display:"grid",gap:12}}>
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
        <div style={{fontSize:12}}>Pixels classificados como amarelo: {ocrPixelCount}</div>
        {ocrDiagnostic ? <div style={{display:"grid",gap:4}}><strong>CAPTURA COM SOBREPOSIÇÃO (VERMELHO = PIXEL IDENTIFICADO)</strong><img src={ocrDiagnostic} alt="Mapa de diagnóstico de pixels amarelos" style={{width:"100%",maxWidth:960,background:"#111",borderRadius:6}} /></div> : null}
        <div style={{padding:8,border:"1px solid var(--border, #dce5de)",borderRadius:6,whiteSpace:"pre-wrap",fontSize:13}}>{ocrText || "Clique em LER NOMES para localizar e ler regiões amarelas individualmente. O processamento é local."}{ocrCards.length > 0 && <div style={{marginTop:8,display:"grid",gap:6}}>{ocrCards.map((card,i)=><div key={i} style={{padding:8,border:"1px solid var(--border, #dce5de)",borderRadius:6}}>{card}</div>)}</div>}</div>
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
          <div style={{minWidth:0}}><strong>{eventLabels[event.type]}</strong><div style={{fontSize:13}}>{nameFor(event.uid)}{person?.setor ? ` · ${person.setor}` : ""}{person?.contato ? ` · ${person.contato}` : ""}</div><div style={{fontSize:12,color:"var(--muted, #60746a)",overflowWrap:"anywhere"}}>{detail}{event.type === "TAREFA_FINALIZADA" && event.taskLink && <> · <a href={event.taskLink} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent, #187747)",fontWeight:700}}>Abrir tarefa</a></>}{event.type === "ATENDIMENTO_REGISTRADO" && event.ticket && <>{" · "}Ticket: <a href={event.ticket} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent, #187747)",fontWeight:700}}>Abrir atendimento</a></>}</div></div>
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
