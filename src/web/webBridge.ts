import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { createEmail, createProfile, createTask } from "../main/configService";
import { buildState, obligationProgress, setObservation, toggleEmail, toggleTask } from "../main/taskService";
import { DataRepository } from "./dataRepository";
import { CalendarHistoryService } from "./calendarHistoryService";
import { DriveService } from "./webDriveService";
import { WebGoogleAuth, loadBootstrap, saveBootstrap } from "./webAuth";
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
   selecionarPasta:async()=>{const id=window.prompt("COLE O ID DA PASTA RAIZ DO CONTROLE DIÁRIO NO GOOGLE DRIVE:",boot().drive.pastaRaizId);if(!id)throw new Error("SELEÇÃO CANCELADA.");return configureRoot(id);},
   testarConexao:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);return drive.testConnection(id)}
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
