import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { signInWithCorporateGoogle, restoreCorporateGoogleSession, observeCorporateAccess, signOutCorporateGoogle } from "./firebaseAuthService";
import { FirebasePersonalDataService } from "./firebasePersonalDataService";
import { FirebaseOperationalService } from "./firebaseOperationalService";
import { FirebaseWorkspaceRepository } from "./firebaseWorkspaceRepository";
import { normalizeConfiguration as normalizeFirebaseConfiguration } from "./dataRepository";
import { FirebaseWorkflowService } from "./firebaseWorkflowService";


const firebasePersonalData = new FirebasePersonalDataService();
const firebaseOperational = new FirebaseOperationalService();
const firebaseWorkspace = new FirebaseWorkspaceRepository(firebasePersonalData, firebaseOperational);
const firebaseWorkflow = new FirebaseWorkflowService(firebaseWorkspace, firebaseOperational);

export function installWebBridge(){
 const bridge:any={
  ready:true,
  // Firebase is the active persistence provider for the expediente, configuration, calendar and history.
  firebase:{
   signIn:signInWithCorporateGoogle,
   restoreSession:restoreCorporateGoogleSession,
   observeAccess:observeCorporateAccess,
   signOut:signOutCorporateGoogle,
   loadWorkspace:()=>firebaseWorkspace.load(),
   saveWorkspaceConfiguration:(config:any)=>firebaseWorkspace.saveConfiguration(config),
   saveWorkspaceCalendar:(calendar:any)=>firebaseWorkspace.saveCalendar(calendar),
   saveWorkspaceCurrentState:(state:EstadoAtual|null)=>firebaseWorkspace.saveCurrentState(state),
   loadConfiguration:async()=>{const config=await firebasePersonalData.loadConfiguration();return config?normalizeFirebaseConfiguration(config):null;},
   saveConfiguration:(config:any)=>firebaseWorkspace.saveConfiguration(config),
   loadCalendar:()=>firebasePersonalData.loadCalendar(),
   saveCalendar:(calendar:any)=>firebasePersonalData.saveCalendar(calendar),
   loadCurrentState:()=>firebaseOperational.loadCurrentState(),
   saveCurrentState:(state:any)=>firebaseOperational.saveCurrentState(state),
   completeState:(state:any,completedAt?:string)=>firebaseOperational.completeState(state,completedAt),
   listHistory:(date:string)=>firebaseOperational.listHistory(date),
   readHistory:(historyId:string)=>firebaseOperational.readHistory(historyId),
   saveErrata:(source:any,edited:any)=>firebaseOperational.saveErrata(source,edited),
   workflow:{
    load:()=>firebaseWorkflow.load(),
    iniciar:(input:any)=>firebaseWorkflow.start(input),
    trocarPerfil:(profileId:string)=>firebaseWorkflow.switchProfile(profileId),
    marcar:(input:any)=>firebaseWorkflow.mark(input),
    observacao:(value:string)=>firebaseWorkflow.setObservation(value),
    concluir:()=>firebaseWorkflow.complete(),
    abandonar:()=>firebaseWorkflow.abandon(),
    salvarConfiguracao:(config:any)=>firebaseWorkflow.saveConfiguration(config),
    salvarTarefa:(input:any)=>firebaseWorkflow.saveTask(input),
    novaTarefa:(input:any)=>firebaseWorkflow.addTask(input),
    novoPerfil:(input:any)=>firebaseWorkflow.addProfile(input),
    novoEmail:(input:any)=>firebaseWorkflow.addEmail(input),
    salvarDataCalendario:(input:any)=>firebaseWorkflow.saveCalendarDate(input),
    mes:(input:any)=>firebaseWorkflow.month(input),
    versoes:(date:string)=>firebaseWorkflow.versions(date),
    ler:(input:any)=>firebaseWorkflow.readVersion(input),
    errata:(input:any)=>firebaseWorkflow.saveHistoryErrata(input.source,input.edited),
    salvar:(config:any)=>firebaseWorkflow.saveConfiguration(config)
   }
  },

 };
 (window as any).controleDiario=bridge;
}
