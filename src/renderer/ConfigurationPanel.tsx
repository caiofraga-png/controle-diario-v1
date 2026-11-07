import { useEffect, useMemo, useState } from "react";
import RoteiroEditor from "./RoteiroEditor";
import NotificationPreferencesPanel from "./NotificationPreferencesPanel";
import MaintenancePermissionPanel from "./MaintenancePermissionPanel";

type Config = any;
type Tab = "aparencia" | "perfis" | "tarefas" | "email" | "promocoes" | "avisos" | "layout" | "atalhos" | "atendimentos";
type ThemePreference = "corporate-light" | "corporate-dark" | "elegant-light" | "midnight-blue" | "midnight-violet" | "blue-light" | "system";

function clone<T>(v:T):T { return JSON.parse(JSON.stringify(v)); }
function move<T>(arr:T[], from:number, to:number){ const a=[...arr]; const [x]=a.splice(from,1); a.splice(to,0,x); return a; }

const estatisticaManutencaoRoteiro = [
"Abrir arquivo DEMANDA DO DIA",
"",
"Colar no separador BD MANUT FEITAS",
"Copiar conteúdo da aba MANUT FEITAS e lançar na planilha, na aba de mesmo nome",
"",
"1- Arrastar script das colunas MEIO DE CONTATO e SETOR",
"2- Ajustar FORMATAR>NÚMERO>DATA na coluna DATA ATIV. CRIADA",
"3- Arrastar script das colunas:",
"DIAS Ñ UTEIS, HORAS DIAS Ñ UTEIS, TEMPO REAL (ATÉ), TEMPO TOTAL, SLA e STATUS",
"4- Ajustar FORMATAR>NÚMERO>DATA na coluna DATA DA VISITA/TICKET",
"5- Arrastar script das colunas TENT. DE VISITA - 1º OS E TENT. DE VISITA - EM 3 OS",
"6- Verificar a linha preenchida na coluna MOTIVO DO CANCELAMENTO - 1º OS",
"7- Inserir a linha no botão da planilha, aba MODELO EMAIL AUTO",
"8- Arrastar script das colunas:",
"CONV. HORAS - REAIS, T. TOTAL - 1º OS, T. TOTAL - 2º OS, T. TOTAL - 3º OS e PREF. START/END",
"",
"Corrigir os bairros. Eliminar linhas vazias.",
"Na aba MANUT PRAZO, abrir filtro:",
"1- Filtrar ✅ na coluna STATUS e eliminar todas as linhas.",
"2- Ordenar em ordem alfabética a coluna TICKET DA VISITA",
"3- Fechar filtro",
"Abrir arquivo ABERTAS DO DIA",
"",
"Abrir arquivo ABERTAS DO DIA",
"Conferir se não há TESTE, DESENVOLVIMENTO e LIXEIRA",
"",
"Colar no separador BD MANUT PRAZO",
"Copiar conteúdo da aba MANUT PRAZO e lançar na planilha, na aba de mesmo nome",
"",
"1- Arrastar script das colunas MEIO DE CONTATO e SETOR",
"2- Ajustar FORMATAR>NÚMERO>DATA HORA na coluna DATA ATIV. CRIADA",
"3- Arrastar script das colunas DIAS Ñ UTEIS, HORAS DIAS Ñ UTEIS, TEMPO REAL (ATÉ), TEMPO TOTAL, SLA e STATUS",
"4- Arrastar script das colunas TENT. DE VISITA - 1º OS E TENT. DE VISITA - EM 3 OS",
"5- Arrastar script das colunas CONV. HORAS - REAIS, T. TOTAL - 1º OS, T. TOTAL - 2º OS, T. TOTAL - 3º OS e PREF. START/END",
"",
"Eliminar linhas vazias.",
"Criar filtro SELECIONANDO DA ÚLTIMA LINHA ATÉ O TOPO.",
"Filtrar ordem alfabética na coluna TICKET DA VISITA",
"",
"Abrir arquivo TODAS ABERTAS",
"",
"Filtrar coluna ticket em ordem crescente",
"Eliminar linhas contendo: TESTE, DESENVOLVIMENTO e LIXEIRA",
"Filtrar coluna subtipo: LOS e LOS AUTO",
"Filtrar coluna estado atividade: Pendente Tarefa",
"Filtrar coluna conectado: SIM",
"Analisar cada ticket e verificar se podemos encerrar atividade.",
"Eliminar do arquivo os tickets que forem encerrados após análise.",
"",
"Selecionar a lista de ticket e colar na planilha MANUT PRAZO abaixo do filtro",
"A lista colada deverá ficar totalmente verde",
"Na lista de tickets filtrados acima, selecionar Filtro> Filtrar por cor> Cor de preenchimento > Branco",
"Na coluna STATUS, filtrar apenas 🕒",
"Ocultar colunas, de DESCONTO até PREF. END.",
"",
"Analisar cada ticket, identificar motivo do cancelamento na coluna RESOLUÇÃO DA VISITA e mudar o 🕒 para 📞",
"Ao final, mostrar colunas ocultas, desfazer filtros do Status e Cor de preenchimento.",
"Apagar lista de tickets abaixo do filtro.",
"",
"Filtrar novamente coluna STATUS> 🕒",
"Filtrar TICKET DA VISITA em ordem crescente",
"Colar novamente a lista de tickets TODAS ABERTAS ao lado da coluna TICKET DA VISITA",
"Conferir se as listas são idênticas.",
"",
"Copiar o arquivo TODAS ABERTAS e colar no separador BD MANUT PRAZO",
"Na aba TODAS ABERTAS:",
"1- Copiar a coluna fila atual e substituir na coluna homônima em MANUT PRAZO",
"2- Copiar a coluna estado_atividade e substituir na coluna homônima em MANUT PRAZO",
"3- Copiar colunas motivo_cancel, visitas canceladas, priorityStart e priorityEnd",
"e lançar nas colunas homônimas em MANUT PRAZO.",
"",
"Verifica a linha do primeiro MOTIVO DO CANCELAMENTO - 1º OS substituído e",
"insira no botão SEPARAR MOTIVO CANCELAMENTO - ABERTAS na aba MODELO EMAIL AUTO. Aperte o botão.",
"",
"Após isso, verificar na coluna VISITAS CANCELADAS:",
"Todo ticket que tiver o valor 3 ou mais (e a célula vermelha), devemos copiar o motivo da primeira visita no ticket e",
"atualizar na planilha.",
"",
"Desfaça o filtro na coluna STATUS, ordene BAIRRO e CIDADE em ordem crescente e corrija.",
"Após correção, filtre de forma crescente a coluna TICKET DA VISITA e remova o filtro.",
"",
"NUNCA ESQUECER DE ARRASTAR E CONFERIR TODAS AS COLUNAS DE FÓRMULAS",
"IMPORTANTE: VERIFICAR SUBTIPO (A-Z) E CORRIGIR SUBTIPOS ESTRANHOS (AMBAS ABAS)",
"",
"BATER CONTAGEM:",
"1- Total de manutenções, bater com as linhas do arquivo TODAS ABERTAS",
"2 - Fechar e Salvar arquivo TODAS ABERTAS",
"3 - Total de visitas feitas, bater com as linhas do arquivo DEMANDA DO DIA",
"4 - Fechar e Salvar arquivo DEMANDA DO DIA",
"5 - Mandar email para liderança e backoffice. NAO ESQUECER ANEXOS"
].join("\n");

export default function ConfigurationPanel({ initial, onSave, onSaveLayout, onClose, busy, embedded = false, canManageCatalog = false, canAdmin = false, themePreference = "system", onThemeChange, themeSaving = false, promotions = [], onSavePromotions }: { initial: Config; onSave: (config:Config)=>Promise<void>; onSaveLayout?: (layout:any)=>Promise<void>; onClose:()=>void; busy:boolean; embedded?:boolean; canManageCatalog?:boolean; canAdmin?:boolean; themePreference?:ThemePreference; onThemeChange?:(theme:ThemePreference)=>Promise<void>; themeSaving?:boolean; promotions?:any[]; onSavePromotions?:(items:any[])=>Promise<void> }) {
  const [tab,setTab]=useState<Tab>("aparencia");
  const [draft,setDraft]=useState<Config>(()=>clone(initial));
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [form,setForm]=useState<any>({});
  const [route,setRoute]=useState<"lista"|"editar">("lista");
  const [localMessage,setLocalMessage]=useState("");
  const [roteiroOpen,setRoteiroOpen]=useState(false);
  const [roteiro,setRoteiro]=useState<any>(null);
  const [promotionItems,setPromotionItems]=useState<any[]>(()=>clone(promotions));
  const [promotionForm,setPromotionForm]=useState<any>({});
  const [shortcutName,setShortcutName]=useState("");
  const [shortcutUrl,setShortcutUrl]=useState("");
  const attendanceFields = [
    { key: "ticket", label: "TICKET" }, { key: "canal", label: "CANAL" },
    { key: "codigo", label: "CÓDIGO" }, { key: "nome", label: "NOME" },
    { key: "tipo", label: "TIPO" }, { key: "resolvido", label: "RESOLVIDO?" },
    { key: "subtipo", label: "SUBTIPO" }, { key: "motivoResolucao", label: "MOTIVO RESOLUÇÃO/RETENÇÃO" },
  ];
  const [attendanceOrder,setAttendanceOrder]=useState<string[]>(attendanceFields.map(field=>field.key));
  const [attendanceOrderLoaded,setAttendanceOrderLoaded]=useState(false);
  const [attendanceOrderSaving,setAttendanceOrderSaving]=useState(false);
  useEffect(() => {
    let active = true;
    window.controleDiario.firebase.loadAttendanceFieldOrder()
      .then((order:string[]) => { if(active) setAttendanceOrder(order); })
      .catch((error:unknown) => { if(active) setLocalMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL CARREGAR A ORDEM DOS CAMPOS."); })
      .finally(() => { if(active) setAttendanceOrderLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => setPromotionItems(promotions), [promotions]);
  // Keep the editor synchronized with the latest personal configuration returned by Firebase.
  // This is important when a save completes and the parent reloads the persisted layout.
  useEffect(() => { setDraft(clone(initial)); }, [initial]);

  const activeTasks = useMemo(()=>draft.tarefas.tarefas.filter((t:any)=>t.ativo),[draft]);
  const selectedProfile = draft.perfis.perfis.find((p:any)=>p.id===selectedId);
  const selectedTask = draft.tarefas.tarefas.find((t:any)=>t.id===selectedId);
  const selectedEmail = draft.email.emails.find((e:any)=>e.id===selectedId);

  function startNew(){ setCreating(true); setSelectedId(null); setRoute("editar"); setForm(tab==="perfis"?{nome:"",tarefas:[]}:tab==="tarefas"?{nome:"",link:"",criacao:"",ativo:false,emailsVinculados:[]}: {nome:"",titulo:"",corpo:"",ativo:false,global:false}); }
  function edit(id:string){ setCreating(false); setSelectedId(id); setRoute("editar"); const obj=tab==="perfis"?draft.perfis.perfis.find((x:any)=>x.id===id):tab==="tarefas"?draft.tarefas.tarefas.find((x:any)=>x.id===id):draft.email.emails.find((x:any)=>x.id===id); const edited=tab==="tarefas" && obj?.nome?.trim().toLocaleUpperCase("pt-BR")==="ESTATÍSTICA - MANUTENÇÃO" ? {...clone(obj),roteiro:{linhas:estatisticaManutencaoRoteiro.split("\n").length,colunas:1,largurasColunas:[900],celulas:{A1:{valor:estatisticaManutencaoRoteiro}},mesclas:[],filtro:null}} : clone(obj); setForm(edited); if(tab==="email") setForm((f:any)=>({...clone(obj),global:draft.email.emailsGlobais.includes(id),perfisVinculados:[...(obj.perfisVinculados??[])]})); }
  function switchTab(t:Tab){if(["perfis","tarefas","email","promocoes"].includes(t) && !canManageCatalog) return;setTab(t);setRoute("lista");setSelectedId(null);setLocalMessage("");}
  function renderAppearance(){ return <section className="config-form"><h3>APARÊNCIA DO SISTEMA</h3><p>Escolha seu tema visual.</p><label>TEMA VISUAL<select aria-label="Aparência do site" value={themePreference} disabled={themeSaving} onChange={e=>void onThemeChange?.(e.target.value as ThemePreference)}><option value="system">Automático</option><option value="corporate-light">Claro corporativo</option><option value="corporate-dark">Escuro corporativo</option><option value="elegant-light">Claro elegante</option><option value="midnight-blue">Noturno azulado</option><option value="midnight-violet">Noturno sofisticado</option><option value="blue-light">Claro azulado</option></select></label>{themeSaving&&<p>Salvando preferência…</p>}</section>; }

  async function saveItem(){
    if(["perfis","tarefas","email"].includes(tab) && !canManageCatalog){setLocalMessage("VOCÊ NÃO TEM PERMISSÃO PARA EDITAR ESTE CATÁLOGO.");return;}
    setLocalMessage("");
    try {
      const next=clone(draft);
      if(tab==="perfis"){
        if(!form.nome?.trim()) throw new Error("INFORME O NOME DO PERFIL.");
        if(next.perfis.perfis.some((x:any)=>x.nome.trim().toLocaleLowerCase()===form.nome.trim().toLocaleLowerCase() && x.id!==form.id)) throw new Error("JÁ EXISTE UM PERFIL COM ESSE NOME.");
        if(creating){ const created=await window.controleDiario.firebase.workflow.novoPerfil({nome:form.nome,tarefas:form.tarefas??[]}); next.perfis.perfis.push(created); next.layout.ordemPerfis.push(created.id); next.layout.ordemTarefas[created.id]=created.tarefas.slice(); }
        else { const p=next.perfis.perfis.find((x:any)=>x.id===form.id); if(p.ativo && !form.ativo && !window.confirm("DESATIVAR ESTE PERFIL? As associações de tarefas serão preservadas.")) return; Object.assign(p, {nome:form.nome.trim(),tarefas:[...(form.tarefas??[])],ativo:Boolean(form.ativo)}); const selected=new Set(p.tarefas); const current=next.layout.ordemTarefas[p.id]??[]; next.layout.ordemTarefas[p.id]=[...current.filter((id:string)=>selected.has(id)),...p.tarefas.filter((id:string)=>!current.includes(id))]; }
      } else if(tab==="tarefas"){
        if(!form.nome?.trim()) throw new Error("INFORME O NOME DA TAREFA.");
        if(form.link && !/^https?:\/\//i.test(form.link)) throw new Error("O LINK DA TAREFA DEVE COMEÇAR COM HTTP:// OU HTTPS://.");
        if(next.tarefas.tarefas.some((x:any)=>x.nome.trim().toLocaleLowerCase()===form.nome.trim().toLocaleLowerCase() && x.id!==form.id)) throw new Error("JÁ EXISTE UMA TAREFA COM ESSE NOME.");
        if(creating){ const created=await window.controleDiario.firebase.workflow.novaTarefa({nome:form.nome,link:form.link??"",criacao:form.criacao??""}); next.tarefas.tarefas.push(created); }
        else { const t=next.tarefas.tarefas.find((x:any)=>x.id===form.id); const was=t.ativo; if(was && !form.ativo && !window.confirm("DESATIVAR ESTA TAREFA? Ela será removida das associações dos perfis.")) return; Object.assign(t,{nome:form.nome.trim(),link:form.link??"",criacao:form.criacao??"",ativo:Boolean(form.ativo),emailsVinculados:[...(form.emailsVinculados??[])]}); if(was&&!t.ativo){ for(const p of next.perfis.perfis)p.tarefas=p.tarefas.filter((id:string)=>id!==t.id); for(const key of Object.keys(next.layout.ordemTarefas)) next.layout.ordemTarefas[key]=next.layout.ordemTarefas[key].filter((id:string)=>id!==t.id); } if(!was&&t.ativo&&!next.layout.ordemTarefas.GERAL.includes(t.id)) next.layout.ordemTarefas.GERAL.push(t.id); }
      } else if(tab==="email"){
        if(!form.nome?.trim()) throw new Error("INFORME O NOME DO E-MAIL.");
        if(next.email.emails.some((x:any)=>x.nome.trim().toLocaleLowerCase()===form.nome.trim().toLocaleLowerCase() && x.id!==form.id)) throw new Error("JÁ EXISTE UM E-MAIL COM ESSE NOME.");
        if(!creating && form.ativo===false){ const linked=next.tarefas.tarefas.some((t:any)=>t.emailsVinculados.includes(form.id)) || next.email.emailsGlobais.includes(form.id); if(linked) throw new Error("NÃO É POSSÍVEL DESATIVAR ESTE E-MAIL ENQUANTO ELE ESTIVER VINCULADO A UMA TAREFA OU À COMPILAÇÃO GLOBAL."); }
        if(creating){ const created=await window.controleDiario.firebase.workflow.novoEmail({nome:form.nome,titulo:form.titulo??"",corpo:form.corpo??"",global:Boolean(form.global)}); Object.assign(created,{perfisVinculados:[...(form.perfisVinculados??[])]}); next.email.emails.push(created); if(form.global) next.email.emailsGlobais=Array.from(new Set([...next.email.emailsGlobais,created.id])); }
        else { const e=next.email.emails.find((x:any)=>x.id===form.id); if(e.ativo && !form.ativo && !window.confirm("DESATIVAR ESTE E-MAIL?")) return; Object.assign(e,{nome:form.nome.trim(),titulo:form.titulo??"",corpo:form.corpo??"",ativo:Boolean(form.ativo),perfisVinculados:[...(form.perfisVinculados??[])]}); }
        if(form.id){ next.email.emailsGlobais = form.global ? Array.from(new Set([...next.email.emailsGlobais,form.id])) : next.email.emailsGlobais.filter((id:string)=>id!==form.id); }
      }
      await onSave(next); setDraft(next); setRoute("lista"); setSelectedId(null); setCreating(false);
    } catch(e){ setLocalMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR."); }
  }

  function newPromotion(){ setPromotionForm({id:`PROMO-${Date.now()}`,name:"",category:"",benefit:"",eligible:"",conditions:"",startDate:"",endDate:"",status:"active"}); setCreating(true); setRoute("editar"); }
  function editPromotion(item:any){ setPromotionForm(clone(item)); setCreating(false); setRoute("editar"); }
  async function persistPromotion(){
    if(!canManageCatalog || !onSavePromotions) return;
    if(!promotionForm.name?.trim()) { setLocalMessage("INFORME O NOME DA PROMOÇÃO."); return; }
    if(!promotionForm.benefit?.trim()) { setLocalMessage("INFORME O BENEFÍCIO DA PROMOÇÃO."); return; }
    const next=creating ? [...promotionItems,promotionForm] : promotionItems.map((p:any)=>p.id===promotionForm.id?promotionForm:p);
    try { await onSavePromotions(next); setPromotionItems(next); setRoute("lista"); setCreating(false); setLocalMessage("PROMOÇÃO SALVA."); }
    catch(e){ setLocalMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR A PROMOÇÃO."); }
  }
  async function changePromotionStatus(item:any,status:"active"|"suspended"|"closed"){
    const next=promotionItems.map((p:any)=>p.id===item.id?{...p,status}:p);
    try { await onSavePromotions?.(next); setPromotionItems(next); setLocalMessage("STATUS DA PROMOÇÃO ATUALIZADO."); }
    catch(e){ setLocalMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL ATUALIZAR A PROMOÇÃO."); }
  }
  function renderPromotions(){
    if(route==="editar") return <div className="config-form"><h3>{creating?"NOVA PROMOÇÃO":"EDITAR PROMOÇÃO"}</h3>
      <label>NOME DA PROMOÇÃO<input value={promotionForm.name??""} onChange={e=>setPromotionForm({...promotionForm,name:e.target.value})}/></label>
      <label>CATEGORIA<input value={promotionForm.category??""} onChange={e=>setPromotionForm({...promotionForm,category:e.target.value})}/></label>
      <label>BENEFÍCIO<textarea rows={3} value={promotionForm.benefit??""} onChange={e=>setPromotionForm({...promotionForm,benefit:e.target.value})}/></label>
      <label>PRODUTOS / PLANOS ELEGÍVEIS<textarea rows={2} value={promotionForm.eligible??""} onChange={e=>setPromotionForm({...promotionForm,eligible:e.target.value})}/></label>
      <label>CONDIÇÕES<textarea rows={4} value={promotionForm.conditions??""} onChange={e=>setPromotionForm({...promotionForm,conditions:e.target.value})}/></label>
      <label>DATA INICIAL (OPCIONAL)<input type="date" value={promotionForm.startDate??""} onChange={e=>setPromotionForm({...promotionForm,startDate:e.target.value})}/></label>
      <label>DATA FINAL (OPCIONAL)<input type="date" value={promotionForm.endDate??""} onChange={e=>setPromotionForm({...promotionForm,endDate:e.target.value})}/></label>
      <label>STATUS<select value={promotionForm.status??"active"} onChange={e=>setPromotionForm({...promotionForm,status:e.target.value})}><option value="active">ATIVA</option><option value="suspended">SUSPENSA</option><option value="closed">ENCERRADA</option></select></label>
      <p className="id-note">Sem data final, a promoção não expira automaticamente.</p>
      <div className="config-actions"><button onClick={()=>setRoute("lista")}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void persistPromotion()}>SALVAR PROMOÇÃO</button></div>
    </div>;
    const statusLabel=(s:string)=>s==="suspended"?"SUSPENSA":s==="closed"?"ENCERRADA":"ATIVA";
    return <><div className="config-toolbar"><button onClick={newPromotion}>NOVA PROMOÇÃO</button></div><div className="promotion-admin-list">{promotionItems.map((p:any)=><article className="promotion-admin-card" key={p.id}><div className="promotion-admin-top"><strong>{p.name}</strong><span className={`promotion-status ${p.status}`}>{statusLabel(p.status)}</span></div><p>{p.benefit}</p><small>{p.endDate? `Validade: ${p.endDate.split("-").reverse().join("/")}`:"Sem data final — não expira automaticamente"}</small><div className="promotion-admin-actions"><button onClick={()=>editPromotion(p)}>EDITAR</button><button onClick={()=>void changePromotionStatus(p,p.status==="active"?"suspended":"active")}>{p.status==="active"?"SUSPENDER":"REATIVAR"}</button>{p.status!=="closed"&&<button onClick={()=>void changePromotionStatus(p,"closed")}>ENCERRAR</button>}</div></article>)}</div></>;
  }

  async function saveLayout(){ const snapshot=clone(draft); try{if(onSaveLayout) await onSaveLayout(snapshot.layout); else await onSave(snapshot);setDraft(clone(snapshot));setLocalMessage("LAYOUT SALVO E CONFIRMADO.");}catch(e){setLocalMessage(e instanceof Error?e.message:"NÃO FOI POSSÍVEL SALVAR O LAYOUT.");} }

  function toggleTaskEmail(id:string){ setForm((f:any)=>({...f,emailsVinculados:(f.emailsVinculados??[]).includes(id)?(f.emailsVinculados??[]).filter((x:string)=>x!==id):[...(f.emailsVinculados??[]),id]})); }
  function toggleProfileTask(id:string){ setForm((f:any)=>({...f,tarefas:(f.tarefas??[]).includes(id)?(f.tarefas??[]).filter((x:string)=>x!==id):[...(f.tarefas??[]),id]})); }

  async function saveAttendanceOrder(){
    setAttendanceOrderSaving(true); setLocalMessage("");
    try {
      await window.controleDiario.firebase.saveAttendanceFieldOrder(attendanceOrder);
      setLocalMessage("ORDEM DOS CAMPOS DE ATENDIMENTO SALVA.");
    } catch(error) {
      setLocalMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SALVAR A ORDEM DOS CAMPOS.");
    } finally { setAttendanceOrderSaving(false); }
  }

  function renderAttendanceSettings(){
    const moveField=(index:number,direction:-1|1)=>{
      const target=index+direction;
      if(target<0||target>=attendanceOrder.length)return;
      setAttendanceOrder(current=>{const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next;});
      setLocalMessage("");
    };
    return <section className="layout-editor">
      <h3>ATENDIMENTOS</h3>
      <p>Organize os campos utilizados conforme sua preferência.</p>
      {!attendanceOrderLoaded?<p>CARREGANDO PREFERÊNCIAS…</p>:<>
        {attendanceOrder.map((key,index)=>{
          const field=attendanceFields.find(item=>item.key===key);
          if(!field)return null;
          return <div className="drag-row" key={key}>
            <span>{index+1}.</span>{field.label}
            <div>
              <button type="button" title="Mover para cima" aria-label={`Mover ${field.label} para cima`} disabled={index===0||attendanceOrderSaving} onClick={()=>moveField(index,-1)}>↑</button>
              <button type="button" title="Mover para baixo" aria-label={`Mover ${field.label} para baixo`} disabled={index===attendanceOrder.length-1||attendanceOrderSaving} onClick={()=>moveField(index,1)}>↓</button>
            </div>
          </div>;
        })}
        <div className="config-actions">
          <button type="button" disabled={attendanceOrderSaving} onClick={()=>{setAttendanceOrder(attendanceFields.map(field=>field.key));setLocalMessage("ORDEM PADRÃO RESTAURADA. SALVE PARA CONFIRMAR.");}}>RESTAURAR PADRÃO</button>
          <button type="button" className="primary" disabled={attendanceOrderSaving||!attendanceOrderLoaded} onClick={()=>void saveAttendanceOrder()}>{attendanceOrderSaving?"SALVANDO…":"SALVAR"}</button>
        </div>
      </>}
    </section>;
  }

  function renderShortcuts(){
    const builtIns=[{id:"sosbeta",label:"SOS BETA"},{id:"email",label:"EMAIL"},{id:"chat",label:"CHAT"},{id:"keep",label:"KEEP"},{id:"wiki",label:"WIKI"},{id:"calendario",label:"CALENDÁRIO"},{id:"flit",label:"FLIT"},{id:"youk",label:"YOUK"}];
    const custom=draft.layout.atalhosPersonalizados??[];
    function patchLayout(patch:any){setDraft((d:any)=>({...d,layout:{...d.layout,...patch}}));}
    function addShortcut(){
      const nome=shortcutName.trim(), url=shortcutUrl.trim();
      if(!nome||!url){setLocalMessage("INFORME O NOME E O LINK DO NOVO ATALHO.");return;}
      let parsed:URL;try{parsed=new URL(url);}catch{setLocalMessage("INFORME UM LINK VÁLIDO, INICIADO POR HTTPS:// OU HTTP://.");return;}
      if(!["http:","https:"].includes(parsed.protocol)){setLocalMessage("O LINK DEVE UTILIZAR HTTPS:// OU HTTP://.");return;}
      if(nome.length>32){setLocalMessage("O NOME DO ATALHO DEVE TER ATÉ 32 CARACTERES.");return;}
      patchLayout({atalhosPersonalizados:[...custom,{id:"custom-"+Date.now().toString(36),nome,url:parsed.toString(),ativo:true}]});
      setShortcutName("");setShortcutUrl("");setLocalMessage("ATALHO ADICIONADO. CLIQUE EM SALVAR PARA CONFIRMAR.");
    }
    return <div className="layout-editor shortcut-editor">
      <h3>ATALHOS PADRÃO</h3><p>Ative ou desative individualmente os atalhos corporativos exibidos no cabeçalho.</p>
      <div className="inline-checks">{builtIns.map(item=><label key={item.id}><input type="checkbox" checked={draft.layout.atalhosCabecalho?.[item.id]!==false} onChange={e=>setDraft((d:any)=>({...d,layout:{...d.layout,atalhosCabecalho:{sosbeta:true,email:true,chat:true,keep:true,wiki:true,calendario:true,flit:true,youk:true,...d.layout.atalhosCabecalho,[item.id]:e.target.checked}}}))}/>{item.label}</label>)}</div>
      <h3>MEUS ATALHOS</h3><p>Crie links personalizados para os sistemas e páginas que utiliza. Eles ficam salvos na sua configuração individual.</p>
      {custom.length>0?<div className="custom-shortcut-list">{custom.map((item:any)=><div className="custom-shortcut-row" key={item.id}><label className="check-line"><input type="checkbox" checked={item.ativo!==false} onChange={e=>patchLayout({atalhosPersonalizados:custom.map((x:any)=>x.id===item.id?{...x,ativo:e.target.checked}:x)})}/><span><strong>{item.nome}</strong><small>{item.url}</small></span></label><button type="button" onClick={()=>patchLayout({atalhosPersonalizados:custom.filter((x:any)=>x.id!==item.id)})}>REMOVER</button></div>)}</div>:<p className="id-note">NENHUM ATALHO PERSONALIZADO CADASTRADO.</p>}
      <div className="custom-shortcut-form"><label>NOME DO ATALHO<input value={shortcutName} maxLength={32} placeholder="Ex.: Intranet" onChange={e=>setShortcutName(e.target.value)}/></label><label>LINK / ENDEREÇO<input type="url" value={shortcutUrl} placeholder="https://exemplo.com.br" onChange={e=>setShortcutUrl(e.target.value)}/></label><button type="button" onClick={addShortcut}>ADICIONAR ATALHO</button></div>
      <div className="config-actions"><button onClick={()=>{setDraft(clone(initial));setShortcutName("");setShortcutUrl("");}}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void saveLayout()}>SALVAR</button></div>
    </div>;
  }

  function renderList(){

    if(tab==="perfis") return <><div className="config-toolbar"><button onClick={startNew}>NOVO PERFIL</button></div><table className="config-table"><thead><tr><th>PERFIL</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>{draft.perfis.perfis.map((p:any)=><tr key={p.id}><td>{p.nome}</td><td>{p.ativo?"ATIVO":"INATIVO"}</td><td><button onClick={()=>edit(p.id)}>EDITAR</button></td></tr>)}</tbody></table></>;
    if(tab==="tarefas") return <><div className="config-toolbar"><button onClick={startNew}>NOVA TAREFA</button></div><table className="config-table"><thead><tr><th>TAREFA</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>{draft.tarefas.tarefas.map((t:any)=><tr key={t.id}><td>{t.nome}</td><td>{t.ativo?"ATIVO":"INATIVO"}</td><td><button onClick={()=>edit(t.id)}>EDITAR</button></td></tr>)}</tbody></table></>;
    if(tab==="email") return <><div className="config-toolbar"><button onClick={startNew}>NOVO E-MAIL</button></div><table className="config-table"><thead><tr><th>E-MAIL</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>{draft.email.emails.map((e:any)=><tr key={e.id}><td>{e.nome}</td><td>{e.ativo?"ATIVO":"INATIVO"}</td><td><button onClick={()=>edit(e.id)}>EDITAR</button></td></tr>)}</tbody></table></>;
    const blockNames:any={data:"DATA",perfil:"PERFIL",tarefas:"TAREFAS",emails:"E-MAIL",observacao:"OBSERVAÇÃO",progresso:"PROGRESSO"};
    const lateral=draft.layout.expansaoLateral??{posicao:"direita"};
    const cr=draft.layout.criacaoRoteiro??{modo:"POPUP"};
    return <div className="layout-editor"><h3>ORDEM DOS BLOCOS</h3><button onClick={()=>{if(window.confirm("RESTAURAR O LAYOUT PADRÃO? A alteração só será salva após SALVAR.")){const a=clone(draft);a.layout.blocos=["data","perfil","tarefas","emails","observacao","progresso"];a.layout.ordemPerfis=a.perfis.perfis.map((p:any)=>p.id);a.layout.ordemTarefas.GERAL=a.tarefas.tarefas.filter((t:any)=>t.ativo).map((t:any)=>t.id);for(const p of a.perfis.perfis)a.layout.ordemTarefas[p.id]=p.tarefas.filter((id:string)=>a.tarefas.tarefas.some((t:any)=>t.id===id&&t.ativo));a.layout.abas=["tarefas","calendario","manutencoes","promocoes","meta","inadimplencia","supervisao","configuracao"];a.layout.escala12x36={habilitada:false,referencias:[]};a.layout.atalhosCabecalho={email:true,chat:true,keep:true,wiki:true,calendario:true,flit:true,youk:true};a.layout.painelLateral={largura:420};setDraft(a)}}}>RESTAURAR PADRÃO</button>{draft.layout.blocos.map((b:string,i:number)=><div className="drag-row" draggable onDragStart={e=>e.dataTransfer.setData("text/plain",String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{const from=Number(e.dataTransfer.getData("text/plain"));const a=clone(draft);a.layout.blocos=move(a.layout.blocos,from,i);setDraft(a)}} key={b}><span>☰</span>{blockNames[b]??b}<div><button disabled={i===0} onClick={()=>{const a=clone(draft);a.layout.blocos=move(a.layout.blocos,i,i-1);setDraft(a)}}>↑</button><button disabled={i===draft.layout.blocos.length-1} onClick={()=>{const a=clone(draft);a.layout.blocos=move(a.layout.blocos,i,i+1);setDraft(a)}}>↓</button></div></div>)}<h3>ORDEM DOS PERFIS</h3>{draft.layout.ordemPerfis.map((id:string,i:number)=>{const p=draft.perfis.perfis.find((x:any)=>x.id===id);return <div className="drag-row" key={id}><span>☰</span>{p?.nome??id}<div><button disabled={i===0} onClick={()=>{const a=clone(draft);a.layout.ordemPerfis=move(a.layout.ordemPerfis,i,i-1);setDraft(a)}}>↑</button><button disabled={i===draft.layout.ordemPerfis.length-1} onClick={()=>{const a=clone(draft);a.layout.ordemPerfis=move(a.layout.ordemPerfis,i,i+1);setDraft(a)}}>↓</button></div></div>})}<h3>ORDEM DAS TAREFAS</h3><select value={selectedId??"GERAL"} onChange={e=>setSelectedId(e.target.value)}><option value="GERAL">GERAL</option>{draft.perfis.perfis.map((p:any)=><option key={p.id} value={p.id}>{p.nome}</option>)}</select>{(draft.layout.ordemTarefas[selectedId??"GERAL"]??[]).map((id:string,i:number)=>{const t=draft.tarefas.tarefas.find((x:any)=>x.id===id);return <div className="drag-row" key={id}><span>☰</span>{t?.nome??id}<div><button disabled={i===0} onClick={()=>{const a=clone(draft);a.layout.ordemTarefas[selectedId??"GERAL"]=move(a.layout.ordemTarefas[selectedId??"GERAL"],i,i-1);setDraft(a)}}>↑</button><button disabled={i===(draft.layout.ordemTarefas[selectedId??"GERAL"]??[]).length-1} onClick={()=>{const a=clone(draft);a.layout.ordemTarefas[selectedId??"GERAL"]=move(a.layout.ordemTarefas[selectedId??"GERAL"],i,i+1);setDraft(a)}}>↓</button></div></div>})}<h3>PAINEL LATERAL</h3><input type="number" min="320" max="900" value={draft.layout.painelLateral.largura} onChange={e=>setDraft((d:any)=>({...d,layout:{...d.layout,painelLateral:{...d.layout.painelLateral,largura:Number(e.target.value)}}}))}/><label>POSIÇÃO DA EXPANSÃO<select value={lateral.posicao} onChange={e=>setDraft((d:any)=>({...d,layout:{...d.layout,expansaoLateral:{posicao:e.target.value}}}))}><option value="direita">DIREITA</option><option value="esquerda">ESQUERDA</option></select></label><label>MODO DE CRIAÇÃO / ROTEIRO<select value={cr.modo} onChange={e=>setDraft((d:any)=>({...d,layout:{...d.layout,criacaoRoteiro:{modo:e.target.value}}}))}><option value="POPUP">POPUP</option><option value="EXPANSÃO">EXPANSÃO LATERAL</option></select></label><div className="config-actions"><button onClick={()=>setDraft(clone(initial))}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void saveLayout()}>SALVAR</button></div></div>;
  }

  function renderEdit(){
    if(tab==="perfis") return <div className="config-form"><h3>{creating?"NOVO PERFIL":"EDITAR PERFIL"}</h3>{!creating&&<p className="id-note">ID: {form.id}</p>}<label>NOME<input value={form.nome??""} onChange={e=>setForm({...form,nome:e.target.value})}/></label>{!creating&&<label>STATUS<select value={form.ativo?"ativo":"inativo"} onChange={e=>setForm({...form,ativo:e.target.value==="ativo"})}><option value="ativo">ATIVO</option><option value="inativo">INATIVO</option></select></label>}<h4>TAREFAS</h4>{activeTasks.map((t:any)=><label className="check-line" key={t.id}><input type="checkbox" checked={(form.tarefas??[]).includes(t.id)} onChange={()=>toggleProfileTask(t.id)}/>{t.nome}</label>)}<div className="config-actions"><button onClick={()=>setRoute("lista")}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void saveItem()}>SALVAR</button></div></div>;
    if(tab==="tarefas") return <div className="config-form"><h3>{creating?"NOVA TAREFA":"EDITAR TAREFA"}</h3>{!creating&&<p className="id-note">ID: {form.id}</p>}<label>NOME<input value={form.nome??""} onChange={e=>setForm({...form,nome:e.target.value})}/></label><label>LINK DA TAREFA<input value={form.link??""} onChange={e=>setForm({...form,link:e.target.value})}/></label><label>CRIAÇÃO<input value={form.criacao??""} onChange={e=>setForm({...form,criacao:e.target.value})}/></label>{!creating&&<label>STATUS<select value={form.ativo?"ativo":"inativo"} onChange={e=>{if(form.ativo&&!e.target.value){} setForm({...form,ativo:e.target.value==="ativo"})}}><option value="ativo">ATIVO</option><option value="inativo">INATIVO</option></select></label>}<h4>E-MAILS VINCULADOS</h4>{draft.email.emails.map((e:any)=><label className="check-line" key={e.id}><input type="checkbox" disabled={!e.ativo} checked={(form.emailsVinculados??[]).includes(e.id)} onChange={()=>toggleTaskEmail(e.id)}/>{e.nome}{!e.ativo?" (INATIVO)":""}</label>)}{!creating&&<button type="button" onClick={()=>{setRoteiro(clone(form.roteiro));setRoteiroOpen(true)}}>EDITAR ROTEIRO</button>}<div className="config-actions"><button onClick={()=>setRoute("lista")}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void saveItem()}>SALVAR</button></div></div>;
    return <div className="config-form"><h3>{creating?"NOVO E-MAIL":"EDITAR E-MAIL"}</h3>{!creating&&<p className="id-note">ID: {form.id}</p>}<label>NOME<input value={form.nome??""} onChange={e=>setForm({...form,nome:e.target.value})}/></label><label>TÍTULO<input value={form.titulo??""} onChange={e=>setForm({...form,titulo:e.target.value})}/></label><label>TEXTO<textarea rows={9} value={form.corpo??""} onChange={e=>setForm({...form,corpo:e.target.value})}/></label><h4>PERFIS VINCULADOS</h4><p>Selecione os perfis nos quais este e-mail deverá aparecer. A compilação global ignora esta seleção e habilita o e-mail em todos os perfis.</p>{draft.perfis.perfis.filter((p:any)=>p.ativo).map((p:any)=><label className="check-line" key={p.id}><input type="checkbox" checked={(form.perfisVinculados??[]).includes(p.id)} onChange={e=>setForm((f:any)=>({...f,perfisVinculados:e.target.checked?[...(f.perfisVinculados??[]),p.id]:(f.perfisVinculados??[]).filter((id:string)=>id!==p.id)}))}/>{p.nome}</label>)}<label className="check-line"><input type="checkbox" checked={Boolean(form.global)} onChange={e=>setForm({...form,global:e.target.checked})}/>COMPILAÇÃO GLOBAL</label>{!creating&&<label>STATUS<select value={form.ativo?"ativo":"inativo"} onChange={e=>setForm({...form,ativo:e.target.value==="ativo"})}><option value="ativo">ATIVO</option><option value="inativo">INATIVO</option></select></label>}<div className="config-actions"><button onClick={()=>setRoute("lista")}>CANCELAR</button><button className="primary" disabled={busy} onClick={()=>void saveItem()}>SALVAR</button></div></div>;
  }

  async function saveRoteiroValue(value:any){ if(!selectedId) return; const next=clone(draft); const t=next.tarefas.tarefas.find((x:any)=>x.id===selectedId); if(!t) return; t.roteiro=clone(value); try { await window.controleDiario.firebase.workflow.salvarTarefa({id:selectedId,roteiro:clone(value)}); setDraft(next); setForm((f:any)=>({...f,roteiro:clone(value)})); setRoteiroOpen(false); setLocalMessage("ROTEIRO SALVO NO FIREBASE."); } catch(error) { setLocalMessage(error instanceof Error?error.message:"NÃO FOI POSSÍVEL SALVAR O ROTEIRO."); } }
  const roteiroInitial = roteiro ?? {linhas:50,colunas:5,largurasColunas:[120,120,120,120,120],celulas:{},mesclas:[],filtro:null};
  return <div className={embedded?"config-embedded":"config-overlay"}><div className="config-window"><header className="config-head"><div><h2>CONFIGURAÇÃO</h2><span>Personalize seu CONTROLE DIÁRIO</span></div><button onClick={onClose} aria-label="Voltar para tarefas">✕</button></header><nav className="config-tabs"><button className={tab==="aparencia"?"active":""} onClick={()=>switchTab("aparencia")}>🎨 APARÊNCIA</button>{canManageCatalog&&<><button className={tab==="perfis"?"active":""} onClick={()=>switchTab("perfis")}>👤 PERFIS</button><button className={tab==="tarefas"?"active":""} onClick={()=>switchTab("tarefas")}>✅ TAREFAS</button><button className={tab==="email"?"active":""} onClick={()=>switchTab("email")}>✉️ E-MAIL</button><button className={tab==="promocoes"?"active":""} onClick={()=>switchTab("promocoes")}>🏷 PROMOÇÕES</button></>}<button className={tab==="avisos"?"active":""} onClick={()=>switchTab("avisos")}>🔔 AVISOS</button><button className={tab==="layout"?"active":""} onClick={()=>switchTab("layout")}>📐 LAYOUT</button><button className={tab==="atalhos"?"active":""} onClick={()=>switchTab("atalhos")}>🔗 ATALHOS</button><button className={tab==="atendimentos"?"active":""} onClick={()=>switchTab("atendimentos")}>📋 ATENDIMENTOS</button></nav>{localMessage&&<div className="system-message">{localMessage}</div>}{tab==="aparencia"?renderAppearance():tab==="avisos"?<><NotificationPreferencesPanel canManageAccess={canManageCatalog}/>{canManageCatalog&&<MaintenancePermissionPanel/>}</>:tab==="promocoes"?renderPromotions():tab==="atalhos"?renderShortcuts():tab==="atendimentos"?renderAttendanceSettings():route==="lista"&&tab!=="layout"?renderList():route==="editar"&&tab!=="layout"?renderEdit():renderList()}</div>{roteiroOpen&&<RoteiroEditor initial={roteiroInitial} onCancel={()=>setRoteiroOpen(false)} onSave={saveRoteiroValue}/>}</div>;
}
