import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { createEmail, createProfile, createTask } from "./configService";
import { buildState, obligationProgress, setObservation, toggleEmail, toggleTask } from "./taskService";
import { DataRepository } from "./dataRepository";
import { CalendarHistoryService } from "./calendarHistoryService";
import { DriveService } from "./webDriveService";
import { WebGoogleAuth, loadBootstrap, saveBootstrap } from "./webAuth";
import { pickDriveFolder } from "./webPicker";
import { WebSessionService } from "./webSessionService";

const auth=new WebGoogleAuth(); const drive=new DriveService(auth); const data=new DataRepository(drive); const calendarHistory=new CalendarHistoryService(drive); const session=new WebSessionService(drive);
const boot=()=>loadBootstrap();
async function configureRoot(id:string){ if(!id?.trim())throw new Error("INFORME O ID DA PASTA."); const root=await drive.validateRoot(id.trim()); await drive.testConnection(root.id); await drive.ensureStructure(root.id); const status=await auth.getStatus(); saveBootstrap({drive:{pastaRaizId:root.id,contaEmail:status.email}}); await session.acquire(root.id); return {root,status}; }

export function installWebBridge(){
 const bridge:any={
  ready:true,
  sistema:{
   status:async()=>({auth:await auth.getStatus(),bootstrap:boot()}),
   autorizarGoogle:async()=>{const status=await auth.authorize();const b=boot();saveBootstrap({drive:{pastaRaizId:b.drive.pastaRaizId,contaEmail:status.email}});if(b.drive.pastaRaizId)await session.acquire(b.drive.pastaRaizId);return status;},
   definirPastaRaiz:configureRoot,
   selecionarPasta:async()=>{const cfg=await (async()=>{const c=(globalThis as any).__CONTROLE_DIARIO_CONFIG__??{};return {developerKey:String(c.googlePickerApiKey??"").trim(),accessToken:await auth.getAccessToken()};})();const id=await pickDriveFolder(cfg);return configureRoot(id);},
   testarConexao:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);return drive.testConnection(id)},
   testarSheets:async(spreadsheetId:string)=>{const id=spreadsheetId.trim();if(!id)throw new Error("INFORME O ID DA PLANILHA.");if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");const token=await auth.getAccessToken();const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,hidden))`;const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok){let message=`GOOGLE SHEETS API RETORNOU HTTP ${response.status}.`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const result=await response.json();return {spreadsheetId:id,title:String(result.properties?.title??"PLANILHA SEM TÍTULO"),sheets:(result.sheets??[]).map((s:any)=>({sheetId:Number(s.properties?.sheetId),title:String(s.properties?.title??""),hidden:Boolean(s.properties?.hidden)})).filter((s:any)=>s.title)};},
   inspecionarDestino:async(spreadsheetId:string,sheetTitle:string)=>{const id=spreadsheetId.trim();const title=sheetTitle.trim();if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");const token=await auth.getAccessToken();const quoted=`'${title.replace(/'/g,"''")}'`;const headersUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(quoted+"!1:1")}?majorDimension=ROWS`;const headersResponse=await fetch(headersUrl,{headers:{Authorization:`Bearer ${token}`}});if(!headersResponse.ok){let message=`NÃO FOI POSSÍVEL LER O CABEÇALHO DA ABA (HTTP ${headersResponse.status}).`;try{const body=await headersResponse.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const headersResult=await headersResponse.json();const headers=(headersResult.values?.[0]??[]).map((v:any)=>String(v??"").trim());const ticketIndex=headers.findIndex((v:string)=>v.trim().toLocaleUpperCase("pt-BR")==="TICKET");if(ticketIndex<0)throw new Error("A ABA DE DESTINO NÃO POSSUI UMA COLUNA TICKET NA LINHA 1.");const col=(n:number)=>{let out="";for(let x=n+1;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};const ticketRange=`${quoted}!${col(ticketIndex)}2:${col(ticketIndex)}`;const ticketsUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(ticketRange)}?majorDimension=ROWS`;const ticketsResponse=await fetch(ticketsUrl,{headers:{Authorization:`Bearer ${token}`}});if(!ticketsResponse.ok){let message=`NÃO FOI POSSÍVEL LER A COLUNA TICKET (HTTP ${ticketsResponse.status}).`;try{const body=await ticketsResponse.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const ticketsResult=await ticketsResponse.json();const tickets=ticketsResult.values??[];let lastTicketRow=1;for(let i=0;i<tickets.length;i++){if(String(tickets[i]?.[0]??"").trim())lastTicketRow=i+2;}return {spreadsheetId:id,sheetTitle:title,headers,lastTicketRow,headerRow:lastTicketRow+2,firstDataRow:lastTicketRow+3,ticketColumn:col(ticketIndex)};},
   importarEstatisticas:async(p:any)=>{
    const id=String(p.spreadsheetId??"").trim(),title=String(p.sheetTitle??"").trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");
    if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
    if(!Array.isArray(p.headers)||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
    const token=await auth.getAccessToken(),headersAuth={Authorization:`Bearer ${token}`};
    const apiError=async(response:Response,fallback:string)=>{if(response.ok)return;let message=`${fallback} (HTTP ${response.status}).`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);};
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
    const hash=String(p.hash??"").trim();if(!/^[a-f0-9]{64}$/i.test(hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");
    const duplicateKey=`ESTATISTICAS_IMPORTADO_${day}`;
    const duplicateSearch=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:duplicateKey}}]})});
    await apiError(duplicateSearch,"NÃO FOI POSSÍVEL VERIFICAR IMPORTAÇÕES ANTERIORES");const duplicateResult=await duplicateSearch.json();
    const previous=(duplicateResult.matchedDeveloperMetadata??[]).some((m:any)=>{try{return JSON.parse(String(m.developerMetadata?.metadataValue??"{}")).hash===hash;}catch{return false;}});if(previous&&!p.confirmarDuplicidade)return {duplicate:true,fileName:String(p.fileName??""),sheetTitle:title};
    const metaResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))`,{headers:headersAuth});
    await apiError(metaResponse,"NÃO FOI POSSÍVEL CONSULTAR A PLANILHA");const meta=await metaResponse.json();
    const sheet=(meta.sheets??[]).find((s:any)=>s.properties?.title===title);if(!sheet)throw new Error("A ABA DE DESTINO NÃO FOI ENCONTRADA.");
    const rowCount=Number(sheet.properties?.gridProperties?.rowCount??1000),columnCount=Number(sheet.properties?.gridProperties?.columnCount??26);
    const quote=`'${title.replace(/'/g,"''")}'`,col=(n:number)=>{let out="";for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
    const read=async(range:string)=>{const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{headers:headersAuth});await apiError(r,"NÃO FOI POSSÍVEL LER A ABA DE DESTINO");return await r.json();};
    const destResult=await read(`${quote}!A1:${col(columnCount)}1`),destHeaders=(destResult.values?.[0]??[]).map((v:any)=>String(v??"").trim());
    const norm=(v:any)=>String(v??"").trim().toLocaleUpperCase("pt-BR");
    const map:Record<string,string>={"TICKET":"TICKET","NOME CLIENTE":"NOME_CLIENTE","SUBTIPO":"SUBTIPO","FILA ORIGINAL":"FILA_ORIGINAL","FILA ATUAL":"FILA_ATUAL","TIPO_ESTADO":"TIPO_ESTADO","CIDADE":"CIDADE","DATA ABERTURA TICKET":"TICKET_DATA_ABERTURA","DATA ULTIMA TRANSF.":"ULTIMA_TRANFERENCIA_DATA","DATA ENCERRAMENTO":"ENCERRAMENTO_DATA","RESOLUÇÃO":"resolucao_tipo","RECEBIDO POR":"ATENDENTE","ULTIMA TRANSF. ATENDENTE":"ULTIMA_TRANFERENCIA_ATENDENTE","FECHADO POR":"CLOSEDBY"};
    const protectedCols=new Set(["ABERTO E FECHADO NO MESMO DIA","SETOR","RESOLVIDO?","ALL","DATA"]);
    const sourceHeaders=(p.headers as any[]).map(v=>String(v??"").trim()),sourceIndex=new Map(sourceHeaders.map((h,i)=>[norm(h),i]));
    const ticketIndex=destHeaders.findIndex((h:string)=>norm(h)==="TICKET");if(ticketIndex<0)throw new Error("A ABA DE DESTINO NÃO POSSUI UMA COLUNA TICKET NA LINHA 1.");
    const ticketResult=await read(`${quote}!${col(ticketIndex+1)}2:${col(ticketIndex+1)}`),tickets=ticketResult.values??[];let lastTicketRow=1;
    for(let i=0;i<tickets.length;i++)if(String(tickets[i]?.[0]??"").trim())lastTicketRow=i+2;
    const headerRow=lastTicketRow+2,firstDataRow=headerRow+1,lastDataRow=firstDataRow+p.rows.length-1;
    const neededRows=lastDataRow-rowCount;
    if(neededRows>0){const insert=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:Number(sheet.properties?.sheetId),dimension:"ROWS",length:neededRows}}]})});await apiError(insert,"NÃO FOI POSSÍVEL AMPLIAR A ABA DE DESTINO");}
    const data:any[]=[{range:`${quote}!A${headerRow}:${col(columnCount)}${headerRow}`,values:[Array.from({length:columnCount},(_,i)=>destHeaders[i]??"")]}];
    for(let i=0;i<destHeaders.length;i++){
      const destinationHeader=destHeaders[i]??"",key=Object.keys(map).find(k=>norm(k)===norm(destinationHeader)),sourceName=key?map[key]:"";
      if(!destinationHeader||protectedCols.has(norm(destinationHeader))||!sourceName)continue;
      const index=sourceIndex.get(norm(sourceName));if(index===undefined)continue;
      data.push({range:`${quote}!${col(i+1)}${firstDataRow}:${col(i+1)}${lastDataRow}`,values:(p.rows as any[][]).map(row=>[row?.[index] instanceof Date?(row[index] as Date).toISOString().slice(0,10):row?.[index]??""])});
    }
    const write=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data})});await apiError(write,"A GRAVAÇÃO DA IMPORTAÇÃO FALHOU");
    const result=await write.json();
    const metadataResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:duplicateKey,metadataValue:JSON.stringify({hash,fileName:String(p.fileName??""),sheetTitle:title,importedAt:new Date().toISOString(),records:p.rows.length}),visibility:"DOCUMENT",location:{spreadsheet:{}}}}}]})});
    await apiError(metadataResponse,"DADOS GRAVADOS, MAS NÃO FOI POSSÍVEL REGISTRAR O CONTROLE DE DUPLICIDADE");
    return {success:true,fileName:String(p.fileName??""),sheetTitle:title,records:p.rows.length,columns:data.length-1,headerRow,firstDataRow,updatedCells:Number(result.totalUpdatedCells??0)};
   }
  },
  dados:{
   carregar:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return data.load(id);},
   salvarEstado:async(estado:EstadoAtual|null)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCurrentState(id,estado);return true;},
   salvarCalendario:async(calendario:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCalendar(id,calendario);return true;}
  },
  tarefas:{
   iniciar:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(loaded.estado)throw new Error("JÁ EXISTE UM EXPEDIENTE EM PRODUÇÃO.");const calendar=loaded.calendario.datas.find(d=>d.data===p.data);if(calendar?.folga)throw new Error("ESTA DATA ESTÁ MARCADA COMO FOLGA.");const state=buildState(loaded,p.data,p.perfilId);if(!state.tarefas.length&&!state.emailsGlobais.length)throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.\nAdicione tarefas ou utilize outro perfil.");await data.saveCurrentState(id,state);return state;},
   trocarPerfil:async(profileId:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const next=buildState(loaded,loaded.estado.data,profileId);if(!next.tarefas.length&&!next.emailsGlobais.length)throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.");const doneTasks=new Map(loaded.estado.tarefas.map(t=>[t.id,t.concluida]));const doneEmails=new Map<string,boolean>();for(const e of loaded.estado.emailsGlobais)doneEmails.set(e.id,e.concluido);for(const t of loaded.estado.tarefas)for(const e of t.emailsVinculados)doneEmails.set(e.id,e.concluido);for(const t of next.tarefas){if(doneTasks.has(t.id))t.concluida=Boolean(doneTasks.get(t.id));for(const e of t.emailsVinculados)if(doneEmails.has(e.id))e.concluido=Boolean(doneEmails.get(e.id));}for(const e of next.emailsGlobais)if(doneEmails.has(e.id))e.concluido=Boolean(doneEmails.get(e.id));next.observacao=loaded.estado.observacao;next.criadoEm=loaded.estado.criadoEm;next.ultimaAlteracao=new Date().toISOString();await data.saveCurrentState(id,next);return next;},
   marcar:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const state=p.tipo==="tarefa"?toggleTask(loaded.estado,p.id,p.concluido):toggleEmail(loaded.estado,p.id,p.concluido);await data.saveCurrentState(id,state);return {state,progress:obligationProgress(state)};},
   observacao:async(value:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const state=setObservation(loaded.estado,value);await data.saveCurrentState(id,state);return state;},
   concluir:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const progress=data.progress(loaded.estado);if(progress.total===0||progress.done!==progress.total)throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");return data.completeState(id,loaded.estado,new Date().toISOString());},
   abandonar:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCurrentState(id,null);return true;}
  },
  config:{
   salvar:async(config:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveConfigurationBundle(id,config);return data.load(id);},
   salvarTarefa:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const next=JSON.parse(JSON.stringify(loaded.configuracao));const task=next.tarefas.tarefas.find((x:any)=>x.id===p.id);if(!task)throw new Error("TAREFA NÃO ENCONTRADA.");if(p.hasOwnProperty("criacao"))task.criacao=String(p.criacao??"");if(p.hasOwnProperty("roteiro"))task.roteiro=JSON.parse(JSON.stringify(p.roteiro));await data.saveConfiguration(id,"tarefas",next.tarefas);const current=await data.load(id);if(current.estado){const updated=JSON.parse(JSON.stringify(current.estado));const activeTask=updated.tarefas.find((x:any)=>x.id===p.id);if(activeTask){if(p.hasOwnProperty("criacao"))activeTask.criacao=task.criacao;if(p.hasOwnProperty("roteiro"))activeTask.roteiro=JSON.parse(JSON.stringify(task.roteiro));updated.ultimaAlteracao=new Date().toISOString();await data.saveCurrentState(id,updated);}}return data.load(id);},
   novaTarefa:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const task=createTask(loaded.configuracao,input);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.tarefas.tarefas.push(task);await data.saveConfiguration(id,"tarefas",next.tarefas);return task;},
   novoPerfil:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const profile=createProfile(loaded.configuracao,input.nome,input.tarefas);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.perfis.perfis.push(profile);next.layout.ordemPerfis.push(profile.id);next.layout.ordemTarefas[profile.id]=profile.tarefas.slice();await data.saveConfigurationBundle(id,next);return profile;},
   novoEmail:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const email=createEmail(loaded.configuracao,input);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.email.emails.push(email);if(input.global)next.email.emailsGlobais.push(email.id);await data.saveConfigurationBundle(id,next);return email;}
  },
  calendario:{
   mes:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.month(id,p.year,p.month);},
   salvarData:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const next=loaded.calendario.datas.filter(d=>d.data!==p.data);if(p.folga||p.feriado)next.push({data:p.data,folga:p.folga,feriado:p.feriado});next.sort((a,b)=>a.data.localeCompare(b.data));const calendario={schemaVersion:1 as const,datas:next};await data.saveCalendar(id,calendario);return calendario;}
  },
  historico:{
   versoes:(date:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.versions(id,date);},
   ler:(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.readVersion(id,p.date,p.versao);},
   errata:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);return calendarHistory.saveErrata(id,p.source,p.edited);}
  },
  picker:{getConfig:async()=>{const clientId=((globalThis as any).__CONTROLE_DIARIO_CONFIG__?.googleClientId??"").trim();const developerKey=((globalThis as any).__CONTROLE_DIARIO_CONFIG__?.googlePickerApiKey??"").trim();return {clientId,developerKey,accessToken:await auth.getAccessToken()};},complete:()=>{},cancel:()=>{}}
 };
 (window as any).controleDiario=bridge;
}
