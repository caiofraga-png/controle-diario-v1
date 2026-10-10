import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import ConfigurationPanel from "./ConfigurationPanel";
import RoteiroEditor from "./RoteiroEditor";
import { installWebBridge } from "../web/webBridge";

installWebBridge();

interface Bridge {
  sistema: { status: () => Promise<any>; autorizarGoogle: () => Promise<any>; definirPastaRaiz: (id: string) => Promise<any>; selecionarPasta: () => Promise<any>; testarConexao: () => Promise<boolean> };
  tarefas: { iniciar: (p: { data: string; perfilId: string }) => Promise<any>; trocarPerfil: (perfilId:string) => Promise<any>; marcar: (p: { tipo: "tarefa" | "email"; id: string; concluido: boolean }) => Promise<any>; observacao: (v: string) => Promise<any>; concluir: () => Promise<any>; abandonar: () => Promise<any> };
  dados: { carregar: () => Promise<any>; salvarCalendario: (calendario: unknown) => Promise<any> };
  calendario: { mes: (p: { year: number; month: number }) => Promise<any>; salvarData: (p: { data: string; folga: boolean; feriado: boolean }) => Promise<any> };
  config: { salvar: (config: unknown) => Promise<any>; novaTarefa: (input:{nome:string;link:string;criacao:string})=>Promise<any>; novoPerfil:(input:{nome:string;tarefas:string[]})=>Promise<any>; novoEmail:(input:{nome:string;titulo:string;corpo:string;global?:boolean})=>Promise<any>; salvarTarefa:(p:{id:string;criacao?:string;roteiro?:any})=>Promise<any> };
  historico: { versoes: (date: string) => Promise<any>; ler: (p: { date: string; versao: number }) => Promise<any>; errata: (p: { source: unknown; edited: unknown }) => Promise<any> };
}
declare global { interface Window { controleDiario: Bridge } }

function brazilTodayParts() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: string) => parts.find(p => p.type === type)?.value ?? "0"; return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) }; }
function today() { const { year, month, day } = brazilTodayParts(); return dateFromParts(year, month, day); }
function brDate(value: string) { const [y,m,d] = value.split("-"); return `${d}/${m}/${y}`; }
const monthNames = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
function monthLabel(y: number, m: number) { return `${monthNames[m - 1]} DE ${y}`; }
function dateFromParts(y:number,m:number,d:number) { return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }


function resolveEmailVariables(value:string){
  const { year, month, day } = brazilTodayParts();
  const pad=(n:number)=>String(n).padStart(2,"0");
  const hoje=`${year}${pad(month)}${pad(day)}`;
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1));
  const ontem=`${pad(yesterday.getUTCDate())}${pad(yesterday.getUTCMonth()+1)}${yesterday.getUTCFullYear()}`;
  return value.replaceAll("\\n", "\n").replaceAll("{HOJE_YYYYMMDD}",hoje).replaceAll("{ONTEM_DDMMYYYY}",ontem);
}
function App() {
  const [tab, setTab] = useState<"tarefas" | "calendario" | "configuracao" | "importacao" | "sistema">("tarefas");
  const [status, setStatus] = useState<any>(null);
  const [folderId, setFolderId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [observation, setObservation] = useState("");
  const [emailPanel, setEmailPanel] = useState<any>(null);
  const [taskPanel, setTaskPanel] = useState<any>(null);
  const [roteiroPanel, setRoteiroPanel] = useState<any>(null);
  const [profileSwitch, setProfileSwitch] = useState(false);
  const observationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => { const { year, month } = brazilTodayParts(); return { year, month }; });
  const [calendarData, setCalendarData] = useState<any>(null);
  const [dayPanel, setDayPanel] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [historyRecord, setHistoryRecord] = useState<any>(null);
  const [historySource, setHistorySource] = useState<any>(null);
  const [historyMode, setHistoryMode] = useState<"view"|"edit"|null>(null);

  async function refresh() { const result = await window.controleDiario.sistema.status(); setStatus(result); setFolderId(result.bootstrap?.drive?.pastaRaizId ?? ""); }
  async function loadData() { try { const result = await window.controleDiario.dados.carregar(); setData(result); if (result.estado) { setObservation(result.estado.observacao ?? ""); setSelectedDate(result.estado.data); } else { setSelectedDate(today()); } } catch (e) { setData({ erro: e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CARREGAR OS DADOS." }); } }
  async function loadMonth() { if (!status?.auth?.authenticated || !status?.bootstrap?.drive?.pastaRaizId) return; try { setCalendarData(await window.controleDiario.calendario.mes(calendarCursor)); } catch (e) { setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CARREGAR O CALENDÁRIO."); } }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (status?.auth?.authenticated && status?.bootstrap?.drive?.pastaRaizId) void loadData(); else setData(null); }, [status?.auth?.authenticated, status?.bootstrap?.drive?.pastaRaizId]);
  useEffect(() => { if (tab === "calendario") void loadMonth(); }, [tab, calendarCursor.year, calendarCursor.month, status?.auth?.authenticated, status?.bootstrap?.drive?.pastaRaizId]);
  useEffect(() => () => { if (observationTimer.current) clearTimeout(observationTimer.current); }, []);

  const config = data?.configuracao, state = data?.estado;
  const profiles = useMemo(() => config ? (config.layout?.ordemPerfis ?? []).map((id:string)=>config.perfis.perfis.find((p:any)=>p.id===id)).filter((p:any)=>p?.ativo) : [], [config]);
  const geralHasTasks = Boolean(config?.tarefas?.tarefas?.some((t:any)=>t.ativo) || config?.email?.emailsGlobais?.length);
  const expansionMode = config?.layout?.criacaoRoteiro?.modo ?? "POPUP";
  const expansionPosition = config?.layout?.expansaoLateral?.posicao ?? "direita";
  function progress(s:any) { if (!s) return {done:0,total:0,percentage:0}; const ids=new Set<string>(); for(const e of s.emailsGlobais??[])ids.add(e.id); for(const t of s.tarefas??[])for(const e of t.emailsVinculados??[])ids.add(e.id); let done=(s.tarefas??[]).filter((t:any)=>t.concluida).length; for(const id of ids){const e=(s.emailsGlobais??[]).find((x:any)=>x.id===id)??(s.tarefas??[]).flatMap((t:any)=>t.emailsVinculados??[]).find((x:any)=>x.id===id);if(e?.concluido)done++;} const total=(s.tarefas??[]).length+ids.size; return {done,total,percentage:total?Math.round(done/total*100):0}; }
  const prog = progress(state);
  async function start(profileId:string){setBusy(true);setMessage("");try{await window.controleDiario.tarefas.iniciar({data:selectedDate,perfilId:profileId});await loadData();}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL INICIAR O EXPEDIENTE.");}finally{setBusy(false);}}
  async function mark(tipo:"tarefa"|"email",id:string,concluido:boolean){setBusy(true);try{const r=await window.controleDiario.tarefas.marcar({tipo,id,concluido});setData((o:any)=>o?({...o,estado:r.state}):o);}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A MARCAÇÃO.");}finally{setBusy(false);}}
  function changeObservation(value:string){setObservation(value);if(observationTimer.current)clearTimeout(observationTimer.current);observationTimer.current=setTimeout(async()=>{try{const r=await window.controleDiario.tarefas.observacao(value);setData((o:any)=>o?({...o,estado:r}):o);}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A OBSERVAÇÃO.");}},600);}
  async function conclude(){if(prog.percentage!==100)return;setBusy(true);try{await window.controleDiario.tarefas.concluir();await loadData();await loadMonth();setMessage("EXPEDIENTE CONCLUÍDO.");}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CONCLUIR O EXPEDIENTE.");}finally{setBusy(false);}}
  async function switchProfile(profileId:string){
    if (!state || profileId===state.perfil.id) { setProfileSwitch(false); return; }
    const pName = profileId === "GERAL" ? "GERAL" : profiles.find((p:any)=>p.id===profileId)?.nome ?? profileId;
    if (!window.confirm(`TROCAR PARA O PERFIL ${pName}? As marcações das tarefas/e-mails que também existirem no novo perfil serão preservadas.`)) return;
    setBusy(true); setMessage("");
    try { await window.controleDiario.tarefas.trocarPerfil(profileId); await loadData(); setProfileSwitch(false); }
    catch(e){ setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL TROCAR O PERFIL."); }
    finally { setBusy(false); }
  }

  async function saveTaskCreation(task:any, value:string){
    if(!config) return; const next=JSON.parse(JSON.stringify(config)); const t=next.tarefas.tarefas.find((x:any)=>x.id===task.id); if(!t)return; t.criacao=value; setBusy(true); try { const saved=await window.controleDiario.config.salvarTarefa({id:task.id,criacao:value}); setData(saved); setTaskPanel(null); } catch(e){ setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A CRIAÇÃO."); } finally { setBusy(false); }
  }

  async function saveTaskRoteiro(task:any, value:any){
    if(!config) return; const next=JSON.parse(JSON.stringify(config)); const t=next.tarefas.tarefas.find((x:any)=>x.id===task.id); if(!t)return; t.roteiro=JSON.parse(JSON.stringify(value)); setBusy(true); try { const saved=await window.controleDiario.config.salvarTarefa({id:task.id,roteiro:value}); setData(saved); setRoteiroPanel(null); } catch(e){ setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR O ROTEIRO."); } finally { setBusy(false); }
  }

  async function abandon(){if(!window.confirm(`ABANDONAR EXPEDIENTE? O registro em produção de ${brDate(state.data)} será descartado. Nenhum histórico será criado.`))return;setBusy(true);try{await window.controleDiario.tarefas.abandonar();await loadData();setObservation("");}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL ABANDONAR O EXPEDIENTE.");}finally{setBusy(false);}}
  async function saveConfig(nextConfig:any){ setBusy(true); setMessage(""); try { const result=await window.controleDiario.config.salvar(nextConfig); setData(result); setMessage("CONFIGURAÇÃO SALVA."); } catch(e){ setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A CONFIGURAÇÃO."); throw e; } finally { setBusy(false); } }
  async function systemAction(action:()=>Promise<any>,success?:string){setBusy(true);setMessage("");try{await action();await refresh();if(success)setMessage(success);}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");}finally{setBusy(false);}}

  type CalendarSpecial = { data: string; folga?: boolean; feriado?: boolean };
  const specialByDate = useMemo<Map<string, CalendarSpecial>>(()=>new Map(((calendarData?.special??[]) as CalendarSpecial[]).map(x=>[x.data,x])),[calendarData]);
  const completed = new Set<string>(calendarData?.completedDates??[]);
  const first = new Date(calendarCursor.year, calendarCursor.month-1, 1).getDay();
  const days = new Date(calendarCursor.year, calendarCursor.month, 0).getDate();
  const cells = Array.from({length:first+days},(_,i)=>i<first?null:i-first+1);

  async function openDay(date:string){
    setDayPanel(date); setHistoryRecord(null); setHistoryMode(null);
    const vs = await window.controleDiario.historico.versoes(date); setVersions(vs);
  }
  async function openVersion(v:number){ const rec=await window.controleDiario.historico.ler({date:dayPanel!,versao:v});setHistoryRecord(rec);setHistorySource(rec);setHistoryMode("view"); }
  async function saveCalendarMark(date:string, field:"folga"|"feriado"){
    if(state?.data===date){setMessage("A DATA DO EXPEDIENTE EM PRODUÇÃO DEVE SER ALTERADA EM TAREFAS.");return;}
    const current=specialByDate.get(date)??{data:date,folga:false,feriado:false};
    const payload={data:date,folga:field==="folga"?!current.folga:Boolean(current.folga),feriado:field==="feriado"?!current.feriado:Boolean(current.feriado)};
    setBusy(true);try{await window.controleDiario.calendario.salvarData(payload);await loadMonth();}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR O CALENDÁRIO.");}finally{setBusy(false);}
  }
  function editHistoryTask(taskId:string,checked:boolean){setHistoryRecord((r:any)=>({...r,tarefas:r.tarefas.map((t:any)=>t.id===taskId?{...t,concluida:checked,emailsVinculados:t.emailsVinculados.map((e:any)=>({...e,concluido:checked}))}:t),emailsGlobais:r.emailsGlobais.map((e:any)=>{const t=r.tarefas.find((x:any)=>x.id===taskId);return t?.emailsVinculados?.some((x:any)=>x.id===e.id)?{...e,concluido:checked}:e})}));}
  function editHistoryEmail(emailId:string,checked:boolean){setHistoryRecord((r:any)=>({...r,emailsGlobais:r.emailsGlobais.map((e:any)=>e.id===emailId?{...e,concluido:checked}:e),tarefas:r.tarefas.map((t:any)=>({...t,emailsVinculados:t.emailsVinculados.map((e:any)=>e.id===emailId?{...e,concluido:checked}:e)}))}));}
  async function saveErrata(){if(!historySource||!historyRecord)return;setBusy(true);try{const saved=await window.controleDiario.historico.errata({source:historySource,edited:{tarefas:historyRecord.tarefas,emailsGlobais:historyRecord.emailsGlobais,observacao:historyRecord.observacao}});setHistoryRecord(saved);setHistorySource(saved);setHistoryMode("view");setVersions(await window.controleDiario.historico.versoes(dayPanel!));await loadMonth();}catch(e){setMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A ERRATA.");}finally{setBusy(false);}}

  return <div className="app app-shell">
    <aside className="app-sidebar">
      <div className="sidebar-brand"><span className="sidebar-monogram">CD</span><div><strong>CONTROLE</strong><span>DIÁRIO</span></div></div>
      <div className="sidebar-company-top"><img src="./leste-logo.svg" alt="Leste Telecom" /></div>
      <div className="sidebar-section-label">EXPEDIENTE</div>
      <button className={`sidebar-item ${tab==="tarefas"?"active":""}`} onClick={()=>setTab("tarefas")}><span className="sidebar-icon">✓</span><span>Tarefas</span></button>
      <button className={`sidebar-item ${tab==="calendario"?"active":""}`} onClick={()=>setTab("calendario")}><span className="sidebar-icon">▦</span><span>Calendário</span></button>
      <div className="sidebar-section-label">GERENCIAMENTO</div>
      <button className={`sidebar-item ${tab==="importacao"?"active":""}`} onClick={()=>setTab("importacao")}><span className="sidebar-icon">⇧</span><span>Importação</span></button>
      <button className={`sidebar-item ${tab==="configuracao"?"active":""}`} onClick={()=>setTab("configuracao")}><span className="sidebar-icon">⚙</span><span>Configuração</span></button>
      <button className={`sidebar-item ${tab==="sistema"?"active":""}`} onClick={()=>setTab("sistema")}><span className="sidebar-icon">◈</span><span>Sistema</span></button>
      <div className="sidebar-company-footer"><img src="./leste-logo.svg" alt="Leste Telecom" /></div>
      <div className="sidebar-footer"><span className={status?.auth?.authenticated?"connection-dot connected":"connection-dot"}></span><span>{status?.auth?.authenticated?"Google conectado":"Google não conectado"}</span></div>
    </aside>
    <div className="app-main">
    <header className="header"><div><div className="page-eyebrow">CONTROLE DIÁRIO</div><strong>{{tarefas:"Tarefas do expediente",calendario:"Calendário de trabalho",configuracao:"Configuração",importacao:"Importação",sistema:"Sistema"}[tab]}</strong></div><div className="header-status">{busy?"Salvando alterações…":"Organização do expediente"}</div></header>
    <main className="content">
      {tab==="configuracao" ? (data?.configuracao ? <ConfigurationPanel initial={data.configuracao} onSave={saveConfig} onClose={()=>setTab("tarefas")} busy={busy} embedded/> : <section className="card"><div className="profile">CARREGANDO CONFIGURAÇÃO…</div></section>)
      : tab==="sistema" ? <section className="system-workspace"><div className="workspace-intro"><h2>Conexão e armazenamento</h2><p>Gerencie a conta Google e a pasta usada pelo CONTROLE DIÁRIO.</p></div><div className="system-workspace-grid"><div className="system-workspace-card"><span className="system-workspace-label">CONTA GOOGLE</span><strong>{status?.auth?.email??"NÃO AUTORIZADA"}</strong><p>{status?.auth?.authenticated?"Conta autorizada para acessar o serviço.":"Autorize sua conta Google para iniciar o acesso ao Drive."}</p><button disabled={busy} onClick={()=>void systemAction(()=>window.controleDiario.sistema.autorizarGoogle(),"CONTA GOOGLE AUTORIZADA.")}>AUTORIZAR GOOGLE</button></div><div className="system-workspace-card"><span className="system-workspace-label">PASTA RAIZ</span><strong className="folder-id">{folderId||"NÃO CONFIGURADA"}</strong><p>Selecione a pasta raiz do CONTROLE DIÁRIO ou informe o ID manualmente.</p><div className="system-actions"><button disabled={busy||!status?.auth?.authenticated} onClick={()=>void systemAction(()=>window.controleDiario.sistema.selecionarPasta(),"PASTA RAIZ CONFIGURADA.")}>SELECIONAR PASTA</button></div><div className="manual-folder"><input value={folderId} onChange={e=>setFolderId(e.target.value)} placeholder="ID da pasta do Google Drive"/><button disabled={busy||!status?.auth?.authenticated} onClick={()=>void systemAction(()=>window.controleDiario.sistema.definirPastaRaiz(folderId),"PASTA RAIZ CONFIGURADA.")}>USAR ID</button></div><button className="test-button" disabled={busy||!folderId} onClick={()=>void systemAction(()=>window.controleDiario.sistema.testarConexao(),"CONEXÃO CONFIRMADA.")}>TESTAR CONEXÃO</button></div></div>{message&&<p className="system-message">{message}</p>}</section>
      : tab==="importacao" ? <section className="import-workspace"><div className="workspace-intro"><h2>Importação</h2><p>Área de trabalho para os fluxos de importação do CONTROLE DIÁRIO.</p></div><div className="import-placeholder"><span className="import-placeholder-icon">⇧</span><h3>Área preparada para os importadores</h3><p>Os fluxos de importação ainda não estão integrados a esta versão Web. Esta tela passa a ocupar a área principal, pronta para receber os importadores quando forem conectados ao programa.</p></div></section>
      : tab==="calendario"&&!status?.auth?.authenticated?<section className="card"><div className="profile">CONFIGURE O GOOGLE DRIVE PARA INICIAR.</div></section>:tab==="calendario"?<section className="calendar-card"><div className="calendar-head"><button onClick={()=>setCalendarCursor(c=>c.month===1?{year:c.year-1,month:12}:{year:c.year,month:c.month-1})}>‹</button><strong>{monthLabel(calendarCursor.year,calendarCursor.month)}</strong><div><button onClick={()=>{const d=brazilTodayParts();setCalendarCursor({year:d.year,month:d.month})}}>HOJE</button><button onClick={()=>setCalendarCursor(c=>c.month===12?{year:c.year+1,month:1}:{year:c.year,month:c.month+1})}>›</button></div></div><div className="legend"><span>⚪ SEM REGISTRO</span><span>🟢 CONCLUÍDO</span><span>🔵 FOLGA</span><span>🟡 FERIADO</span></div><div className="weekdays">{["DOM","SEG","TER","QUA","QUI","SEX","SÁB"].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-grid">{cells.map((d,i)=>{if(!d)return <div className="day empty" key={`e${i}`}/>;const date=dateFromParts(calendarCursor.year,calendarCursor.month,d),sp=specialByDate.get(date),done=completed.has(date), isProd=state?.data===date;let symbol=done?"🟢":"⚪";if(sp?.folga)symbol="🔵";if(sp?.feriado)symbol=`🟡${sp.folga?"🔵":done?"🟢":"⚪"}`;return <button className={`day ${isProd?"production-day":""}`} key={date} onClick={()=>void openDay(date)}><strong>{d}</strong><span>{symbol}</span></button>})}</div></section>:<>
        {!status?.auth?.authenticated||!status?.bootstrap?.drive?.pastaRaizId?<section className="card"><div className="profile">CONFIGURE O GOOGLE DRIVE PARA INICIAR.</div><p>Abra <strong>SISTEMA</strong>, autorize a conta Google e selecione a pasta raiz do CONTROLE DIÁRIO.</p></section>:data?.erro?<section className="card"><div className="system-message">{data.erro}</div></section>:state?<section className="work-card"><div className="work-top"><div><div className="date">{brDate(state.data)}</div><div className="profile">{state.perfil.nome}</div></div><div className="work-actions"><button className="profile-switch" disabled={busy} onClick={()=>setProfileSwitch(true)}>TROCAR PERFIL</button><button className="abandon" disabled={busy} onClick={()=>void abandon()}>✕</button></div></div><div className="obligations">{state.tarefas.map((task:any)=><div className="task-row" key={task.id}><label className="check-row"><input type="checkbox" checked={task.concluida} disabled={busy} onChange={e=>void mark("tarefa",task.id,e.target.checked)}/>{task.link?<button className={`task-name-link ${task.concluida?"done":""}`} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();e.stopPropagation();window.open(task.link,"_blank")}}>{task.nome}</button>:<span className={task.concluida?"done":""}>{task.nome}</span>}<span className="task-tools"><button onClick={()=>setTaskPanel(task)}>CRIAÇÃO</button><button onClick={()=>setRoteiroPanel(task)}>ROTEIRO</button></span></label>{task.emailsVinculados?.map((email:any)=><label className="email-row" key={`${task.id}-${email.id}`}><input type="checkbox" checked={Boolean(email.concluido)} disabled={busy} onChange={e=>void mark("email",email.id,e.target.checked)}/>{email.titulo || email.corpo ? <button className="email-name" onClick={()=>setEmailPanel(email)}>{email.nome}</button> : <span className="email-name">{email.nome}</span>}</label>)}</div>)}{state.emailsGlobais?.map((email:any)=><label className="email-row global-email" key={`global-${email.id}`}><input type="checkbox" checked={Boolean(email.concluido)} disabled={busy} onChange={e=>void mark("email",email.id,e.target.checked)}/><button className="email-name" onClick={()=>setEmailPanel(email)}>{email.nome}</button></label>)}</div><label className="observation"><span>OBSERVAÇÃO</span><textarea value={observation} onChange={e=>changeObservation(e.target.value)} placeholder="Opcional"/></label>{prog.percentage===100&&<button className="conclude" disabled={busy} onClick={()=>void conclude()}>✓ CONCLUÍDO</button>}<div className="progress-head"><span>PROGRESSO</span><strong>{prog.done}/{prog.total} — {prog.percentage}%</strong></div><div className="progress"><div style={{width:`${prog.percentage}%`}}/></div>{message&&<p className="system-message">{message}</p>}</section>:<section className="card start-card"><label className="date-select"><span>DATA</span><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/></label><div className="profile">SELECIONE O PERFIL</div><div className="profile-list">{profiles.map((p:any)=><button disabled={busy} key={p.id} onClick={()=>void start(p.id)}>{p.nome}</button>)}{geralHasTasks&&<button disabled={busy} onClick={()=>void start("GERAL")}>GERAL</button>}</div><button className="day-off" disabled={busy} onClick={()=>{setTab("calendario");setDayPanel(selectedDate);void openDay(selectedDate);}}>FOLGA / FERIADO</button>{message&&<p className="system-message">{message}</p>}</section>}
      </>}
    </main>
    </div>
    {emailPanel&&<aside className="side-panel"><button className="close-panel" onClick={()=>setEmailPanel(null)}>✕</button><h2>{emailPanel.nome}</h2><h3>TÍTULO</h3><pre>{resolveEmailVariables(emailPanel.titulo)}</pre><h3>TEXTO</h3><pre>{resolveEmailVariables(emailPanel.corpo)}</pre><div className="panel-actions"><button onClick={()=>navigator.clipboard.writeText(resolveEmailVariables(emailPanel.titulo))}>COPIAR TÍTULO</button><button onClick={()=>navigator.clipboard.writeText(resolveEmailVariables(emailPanel.corpo))}>COPIAR TEXTO</button></div></aside>}
    {profileSwitch&&<div className="modal-backdrop" onClick={()=>setProfileSwitch(false)}><div className="day-modal profile-switch-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><strong>TROCAR PERFIL</strong><button onClick={()=>setProfileSwitch(false)}>✕</button></div><p>O expediente continua na mesma data. Marcações comuns serão preservadas.</p><div className="profile-list">{profiles.map((p:any)=><button disabled={busy||state?.perfil.id===p.id} key={p.id} onClick={()=>void switchProfile(p.id)}>{p.nome}</button>)}{geralHasTasks&&<button disabled={busy||state?.perfil.id==="GERAL"} onClick={()=>void switchProfile("GERAL")}>GERAL</button>}</div></div></div>}
    {taskPanel&&(expansionMode==="EXPANSÃO"?<div className={`side-panel ${expansionPosition}`}><button className="close-panel" onClick={()=>setTaskPanel(null)}>✕</button><h2>CRIAÇÃO — {taskPanel.nome}</h2><p>Consultas, filtros, datas e arquivos a baixar.</p><textarea className="creation-editor" value={taskPanel.criacao??""} disabled={busy} onChange={e=>setTaskPanel({...taskPanel,criacao:e.target.value})}/><div className="panel-actions"><button disabled={busy} onClick={()=>void saveTaskCreation(taskPanel,taskPanel.criacao??"")}>SALVAR</button><button onClick={()=>setTaskPanel(null)}>FECHAR</button></div></div>:<div className="modal-backdrop" onClick={()=>setTaskPanel(null)}><div className="day-modal creation-popup" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>CRIAÇÃO — {taskPanel.nome}</h2><button onClick={()=>setTaskPanel(null)}>✕</button></div><p>Consultas, filtros, datas e arquivos a baixar.</p><textarea className="creation-editor" value={taskPanel.criacao??""} disabled={busy} onChange={e=>setTaskPanel({...taskPanel,criacao:e.target.value})}/><div className="panel-actions"><button disabled={busy} onClick={()=>void saveTaskCreation(taskPanel,taskPanel.criacao??"")}>SALVAR</button><button onClick={()=>setTaskPanel(null)}>FECHAR</button></div></div></div>)}
    {roteiroPanel&&<RoteiroEditor initial={roteiroPanel.roteiro} presentation={expansionMode==="EXPANSÃO"?"side":"popup"} sidePosition={expansionPosition} onCancel={()=>setRoteiroPanel(null)} onSave={(v:any)=>void saveTaskRoteiro(roteiroPanel,v)}/>}
    {dayPanel&&<div className="modal-backdrop" onClick={()=>setDayPanel(null)}><div className="day-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="date">{brDate(dayPanel)}</div><div className="profile">{state?.data===dayPanel?"EXPEDIENTE EM PRODUÇÃO":"DATA"}</div></div><button onClick={()=>setDayPanel(null)}>✕</button></div>{state?.data===dayPanel&&<button className="primary-wide" onClick={()=>{setDayPanel(null);setTab("tarefas");}}>IR PARA TAREFAS</button>}<div className="calendar-actions"><button disabled={busy||state?.data===dayPanel} onClick={()=>void saveCalendarMark(dayPanel,"folga")}>🔵 FOLGA</button><button disabled={busy||state?.data===dayPanel} onClick={()=>void saveCalendarMark(dayPanel,"feriado")}>🟡 FERIADO</button></div><h3>HISTÓRICO</h3>{versions.length===0?<p>SEM REGISTRO HISTÓRICO.</p>:<div className="version-list">{versions.map(v=><button key={v.versao} onClick={()=>void openVersion(v.versao)}>R{String(v.versao).padStart(3,"0")}</button>)}</div>}{historyRecord&&<div className="history-view"><div className="history-head"><strong>REGISTRO HISTÓRICO — R{String(historyRecord.versao).padStart(3,"0")}</strong>{historyMode==="view"&&<button onClick={()=>setHistoryMode("edit")}>EDITAR</button>}</div><div className="profile">{historyRecord.perfil.nome}</div>{historyRecord.tarefas.map((t:any)=><div className="history-task" key={t.id}><label><input type="checkbox" disabled={historyMode!=="edit"||busy} checked={t.concluida} onChange={e=>editHistoryTask(t.id,e.target.checked)}/><span className={t.concluida?"done":""}>{t.nome}</span></label>{t.emailsVinculados.map((e:any)=><label className="email-row" key={e.id}><input type="checkbox" disabled={historyMode!=="edit"||busy} checked={e.concluido} onChange={ev=>editHistoryEmail(e.id,ev.target.checked)}/><span>{e.nome}</span></label>)}</div>)}{historyRecord.emailsGlobais.map((e:any)=><label className="email-row" key={`g-${e.id}`}><input type="checkbox" disabled={historyMode!=="edit"||busy} checked={e.concluido} onChange={ev=>editHistoryEmail(e.id,ev.target.checked)}/><span>{e.nome}</span></label>)}<label className="observation"><span>OBSERVAÇÃO</span><textarea disabled={historyMode!=="edit"||busy} value={historyRecord.observacao} onChange={e=>setHistoryRecord((r:any)=>({...r,observacao:e.target.value}))}/></label>{historyMode==="edit"&&<div className="modal-actions"><button onClick={()=>{setHistoryRecord(historySource);setHistoryMode("view")}}>CANCELAR</button><button className="conclude" disabled={busy} onClick={()=>void saveErrata()}>SALVAR ERRATA</button></div>}</div>}</div></div>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
