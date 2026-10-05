import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { GoogleAuthManager } from "./googleAuth";
import { DriveService } from "./driveService";
import { loadBootstrap, saveBootstrap } from "./bootstrap";
import { openFolderPicker, registerPickerIpc } from "./picker";
import { DataRepository } from "./dataRepository";
import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { buildState, obligationProgress, setObservation, toggleEmail, toggleTask } from "./taskService";
import { CalendarHistoryService } from "./calendarHistoryService";
import { createEmail, createProfile, createTask } from "./configService";
import { SessionService } from "./sessionService";
import { autoUpdater } from "electron-updater";
import { loadWindowState, saveWindowState } from "./windowState";

let mainWindow: BrowserWindow | null = null;
const auth = new GoogleAuthManager();
const drive = new DriveService(auth);
const data = new DataRepository(drive);
const calendarHistory = new CalendarHistoryService(drive);
const session = new SessionService(drive);

async function createWindow() {
  const saved = await loadWindowState();
  mainWindow = new BrowserWindow({ x: saved.x, y: saved.y, width: saved.width, height: saved.height, minWidth: 1000, minHeight: 680, webPreferences: { preload: join(__dirname, "../preload/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  if (saved.isMaximized) mainWindow.maximize();
  mainWindow.on("close", () => { if (!mainWindow || mainWindow.isDestroyed()) return; const [width,height] = mainWindow.getSize(); const [x,y] = mainWindow.getPosition(); void saveWindowState({ x, y, width, height, isMaximized: mainWindow.isMaximized() }); });
}

function registerIpc() {
  registerPickerIpc(auth);
  ipcMain.handle("sistema:selecionar-pasta", async () => {
    const current = await loadBootstrap();
    if (current.drive.pastaRaizId) { const loaded = await data.load(current.drive.pastaRaizId); if (loaded.estado) throw new Error("NÃO É POSSÍVEL TROCAR A PASTA RAIZ DURANTE UM EXPEDIENTE EM PRODUÇÃO."); }
    const selected = await openFolderPicker();
    const root = await drive.validateRoot(selected.id);
    await drive.testConnection(root.id);
    await drive.ensureStructure(root.id);
    const bootstrap = await loadBootstrap();
    bootstrap.drive.pastaRaizId = root.id;
    const status = await auth.getStatus();
    bootstrap.drive.contaEmail = status.email;
    await saveBootstrap(bootstrap);
    await session.acquire(root.id);
    return { root, status };
  });
  ipcMain.handle("sistema:status", async () => ({ auth: await auth.getStatus(), bootstrap: await loadBootstrap() }));
  ipcMain.handle("sistema:autorizar-google", async () => {
    const status = await auth.authorize();
    const bootstrap = await loadBootstrap();
    if (status.email) { bootstrap.drive.contaEmail = status.email; await saveBootstrap(bootstrap); }
    return status;
  });
  ipcMain.handle("sistema:definir-pasta-raiz", async (_event, folderId: string) => {
    const current = await loadBootstrap();
    if (current.drive.pastaRaizId) { const loaded = await data.load(current.drive.pastaRaizId); if (loaded.estado) throw new Error("NÃO É POSSÍVEL TROCAR A PASTA RAIZ DURANTE UM EXPEDIENTE EM PRODUÇÃO."); }
    if (!folderId?.trim()) throw new Error("INFORME O ID DA PASTA.");
    const root = await drive.validateRoot(folderId.trim());
    await drive.testConnection(root.id);
    await drive.ensureStructure(root.id);
    const bootstrap = await loadBootstrap();
    bootstrap.drive.pastaRaizId = root.id;
    const status = await auth.getStatus();
    bootstrap.drive.contaEmail = status.email;
    await saveBootstrap(bootstrap);
    await session.acquire(root.id);
    return { root, status };
  });
  ipcMain.handle("config:salvar", async (_event, config) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    await data.saveConfigurationBundle(bootstrap.drive.pastaRaizId, config);
    return data.load(bootstrap.drive.pastaRaizId);
  });
  ipcMain.handle("config:nova-tarefa", async (_event, input: { nome:string; link:string; criacao:string }) => {
    const bootstrap = await loadBootstrap(); if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded=await data.load(bootstrap.drive.pastaRaizId); const task=createTask(loaded.configuracao,input);
    const next=JSON.parse(JSON.stringify(loaded.configuracao)); next.tarefas.tarefas.push(task);
    await data.saveConfiguration(bootstrap.drive.pastaRaizId,"tarefas",next.tarefas);
    return task;
  });
  ipcMain.handle("config:novo-perfil", async (_event, input: { nome:string; tarefas:string[] }) => {
    const bootstrap = await loadBootstrap(); if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded=await data.load(bootstrap.drive.pastaRaizId); const profile=createProfile(loaded.configuracao,input.nome,input.tarefas);
    const next=JSON.parse(JSON.stringify(loaded.configuracao)); next.perfis.perfis.push(profile); next.layout.ordemPerfis.push(profile.id); next.layout.ordemTarefas[profile.id]=profile.tarefas.slice();
    await data.saveConfigurationBundle(bootstrap.drive.pastaRaizId,next); return profile;
  });
  ipcMain.handle("config:novo-email", async (_event, input: { nome:string; titulo:string; corpo:string; global?:boolean }) => {
    const bootstrap = await loadBootstrap(); if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded=await data.load(bootstrap.drive.pastaRaizId); const email=createEmail(loaded.configuracao,input);
    const next=JSON.parse(JSON.stringify(loaded.configuracao)); next.email.emails.push(email); if (input.global) next.email.emailsGlobais.push(email.id);
    await data.saveConfigurationBundle(bootstrap.drive.pastaRaizId,next); return email;
  });

  ipcMain.handle("dados:carregar", async () => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    return data.load(bootstrap.drive.pastaRaizId);
  });
  ipcMain.handle("dados:salvar-estado", async (_event, estado: EstadoAtual | null) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, estado);
    return true;
  });

  ipcMain.handle("tarefas:iniciar", async (_event, payload: { data: string; perfilId: string }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    if (loaded.estado) throw new Error("JÁ EXISTE UM EXPEDIENTE EM PRODUÇÃO.");
    const calendar = loaded.calendario.datas.find(d => d.data === payload.data);
    if (calendar?.folga) throw new Error("ESTA DATA ESTÁ MARCADA COMO FOLGA.");
    const state = buildState(loaded, payload.data, payload.perfilId);
    if (!state.tarefas.length && !state.emailsGlobais.length) {
      throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.\nAdicione tarefas ou utilize outro perfil.");
    }
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, state);
    return state;
  });
  ipcMain.handle("tarefas:trocar-perfil", async (_event, perfilId: string) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const next = buildState(loaded, loaded.estado.data, perfilId);
    if (!next.tarefas.length && !next.emailsGlobais.length) throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.");
    const doneTasks = new Map(loaded.estado.tarefas.map(t => [t.id, t.concluida]));
    const doneEmails = new Map<string, boolean>();
    for (const e of loaded.estado.emailsGlobais) doneEmails.set(e.id, e.concluido);
    for (const t of loaded.estado.tarefas) for (const e of t.emailsVinculados) doneEmails.set(e.id, e.concluido);
    for (const t of next.tarefas) { if (doneTasks.has(t.id)) t.concluida = Boolean(doneTasks.get(t.id)); for (const e of t.emailsVinculados) if (doneEmails.has(e.id)) e.concluido = Boolean(doneEmails.get(e.id)); }
    for (const e of next.emailsGlobais) if (doneEmails.has(e.id)) e.concluido = Boolean(doneEmails.get(e.id));
    next.observacao = loaded.estado.observacao;
    next.criadoEm = loaded.estado.criadoEm;
    next.ultimaAlteracao = new Date().toISOString();
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, next);
    return next;
  });
  ipcMain.handle("tarefas:marcar", async (_event, payload: { tipo: "tarefa" | "email"; id: string; concluido: boolean }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const state = payload.tipo === "tarefa" ? toggleTask(loaded.estado, payload.id, payload.concluido) : toggleEmail(loaded.estado, payload.id, payload.concluido);
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, state);
    return { state, progress: obligationProgress(state) };
  });
  ipcMain.handle("tarefas:observacao", async (_event, value: string) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const state = setObservation(loaded.estado, value);
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, state);
    return state;
  });
  ipcMain.handle("tarefas:concluir", async () => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const progress = data.progress(loaded.estado);
    if (progress.total === 0 || progress.done !== progress.total) throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
    return data.completeState(bootstrap.drive.pastaRaizId, loaded.estado, new Date().toISOString());
  });
  ipcMain.handle("tarefas:abandonar", async () => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    await data.saveCurrentState(bootstrap.drive.pastaRaizId, null);
    return true;
  });
  ipcMain.handle("calendario:mes", async (_event, payload: { year: number; month: number }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    return calendarHistory.month(bootstrap.drive.pastaRaizId, payload.year, payload.month);
  });
  ipcMain.handle("calendario:salvar-data", async (_event, payload: { data: string; folga: boolean; feriado: boolean }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    const loaded = await data.load(bootstrap.drive.pastaRaizId);
    const next = loaded.calendario.datas.filter(d => d.data !== payload.data);
    if (payload.folga || payload.feriado) next.push({ data: payload.data, folga: payload.folga, feriado: payload.feriado });
    next.sort((a,b) => a.data.localeCompare(b.data));
    const calendario = { schemaVersion: 1 as const, datas: next };
    await data.saveCalendar(bootstrap.drive.pastaRaizId, calendario);
    return calendario;
  });
  ipcMain.handle("historico:versoes", async (_event, date: string) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    return calendarHistory.versions(bootstrap.drive.pastaRaizId, date);
  });
  ipcMain.handle("historico:ler", async (_event, payload: { date: string; versao: number }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    return calendarHistory.readVersion(bootstrap.drive.pastaRaizId, payload.date, payload.versao);
  });
  ipcMain.handle("historico:errata", async (_event, payload: { source: RegistroHistorico; edited: Pick<RegistroHistorico, "tarefas" | "emailsGlobais" | "observacao"> }) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    return calendarHistory.saveErrata(bootstrap.drive.pastaRaizId, payload.source, payload.edited);
  });

  ipcMain.handle("dados:salvar-calendario", async (_event, calendario) => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    await data.saveCalendar(bootstrap.drive.pastaRaizId, calendario);
    return true;
  });
  ipcMain.handle("sistema:testar-conexao", async () => {
    const bootstrap = await loadBootstrap();
    if (!bootstrap.drive.pastaRaizId) throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");
    await session.assertOwner(bootstrap.drive.pastaRaizId);
    await drive.testConnection(bootstrap.drive.pastaRaizId);
    return true;
  });
}

app.whenReady().then(async () => {
  registerIpc();
  const bootstrap = await loadBootstrap();
  if (bootstrap.drive.pastaRaizId) { try { await session.acquire(bootstrap.drive.pastaRaizId); } catch { /* first read/write will surface the connection error */ } }
  await createWindow();
  if (app.isPackaged) { try { await autoUpdater.checkForUpdates(); } catch { /* update service is best-effort */ } }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on("before-quit", () => session.stop());

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
