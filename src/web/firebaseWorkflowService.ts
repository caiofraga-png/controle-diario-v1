import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { createEmail, createProfile, createTask } from "./configService";
import { buildState, obligationProgress, setObservation, toggleEmail, toggleTask } from "./taskService";
import { FirebaseWorkspaceRepository } from "./firebaseWorkspaceRepository";
import { FirebaseOperationalService } from "./firebaseOperationalService";
import type { Configuracao, LoadedData } from "./dataRepository";

async function diagnoseFirebaseStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha no Firebase durante: ${step}${code ? ` (${code})` : ""}. Detalhe: ${detail}`);
  }
}

/**
 * Firebase-backed implementation of the expediente domain workflow.
 * This is the primary persistence path for the Firebase migration.
 */
export class FirebaseWorkflowService {
  constructor(
    private readonly workspace = new FirebaseWorkspaceRepository(),
    private readonly operational = new FirebaseOperationalService(),
  ) {}

  async load(): Promise<LoadedData> {
    return diagnoseFirebaseStep("carregar configuração, calendário e estado atual do expediente", () => this.workspace.load());
  }

  async month(input: { year: number; month: number }) {
    const loaded = await diagnoseFirebaseStep("carregar calendário e configuração do usuário", () => this.workspace.load());
    const history = await diagnoseFirebaseStep(`consultar histórico operacional de ${input.year}-${String(input.month).padStart(2, "0")}`, () => this.operational.listHistoryMonth(input.year, input.month));
    const prefix = `${input.year}-${String(input.month).padStart(2, "0")}-`;
    return {
      special: loaded.calendario.datas.filter(item => item.data.startsWith(prefix)),
      completedDates: [...new Set(history.map(item => item.data))],
    };
  }

  async versions(date: string) {
    return this.operational.listHistory(date);
  }

  async readVersion(input: { date: string; versao: number }) {
    const versions = await this.operational.listHistory(input.date);
    const selected = versions.find(item => item.versao === input.versao);
    if (!selected) throw new Error("A VERSÃO DO HISTÓRICO NÃO FOI ENCONTRADA.");
    return this.operational.readHistory(selected.nome);
  }

  async saveHistoryErrata(source: RegistroHistorico, edited: Pick<RegistroHistorico, "tarefas" | "emailsGlobais" | "observacao">) {
    return this.operational.saveErrata(source, edited);
  }

  async start(input: { data: string; perfilId: string }): Promise<EstadoAtual> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) throw new Error("A DATA DO EXPEDIENTE É INVÁLIDA.");
    const loaded = await this.workspace.load();
    const allowedProfiles = await this.operational.allowedProfileIds();
    if (!allowedProfiles.includes(input.perfilId)) {
      throw new Error("ESTE PERFIL NÃO FOI ATRIBUÍDO À SUA CONTA. SOLICITE A LIBERAÇÃO À SUPERVISÃO.");
    }
    if (loaded.estado) throw new Error("JÁ EXISTE UM EXPEDIENTE EM PRODUÇÃO.");
    const special = loaded.calendario.datas.find(item => item.data === input.data);
    if (special?.folga) throw new Error("ESTA DATA ESTÁ MARCADA COMO FOLGA.");
    const state = buildState(loaded, input.data, input.perfilId);
    if (!state.tarefas.length && !state.emailsGlobais.length) {
      throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.\nAdicione tarefas ou utilize outro perfil.");
    }
    await this.workspace.saveCurrentState(state);
    return state;
  }

  async switchProfile(profileId: string): Promise<EstadoAtual> {
    const loaded = await this.workspace.load();
    const allowedProfiles = await this.operational.allowedProfileIds();
    if (!allowedProfiles.includes(profileId)) {
      throw new Error("ESTE PERFIL NÃO FOI ATRIBUÍDO À SUA CONTA. SOLICITE A LIBERAÇÃO À SUPERVISÃO.");
    }
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const next = buildState(loaded, loaded.estado.data, profileId);
    if (!next.tarefas.length && !next.emailsGlobais.length) throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.");
    const doneTasks = new Map(loaded.estado.tarefas.map(task => [task.id, task.concluida]));
    const doneEmails = new Map<string, boolean>();
    for (const email of loaded.estado.emailsGlobais) doneEmails.set(email.id, email.concluido);
    for (const task of loaded.estado.tarefas) for (const email of task.emailsVinculados) doneEmails.set(email.id, email.concluido);
    for (const task of next.tarefas) {
      if (doneTasks.has(task.id)) task.concluida = Boolean(doneTasks.get(task.id));
      for (const email of task.emailsVinculados) if (doneEmails.has(email.id)) email.concluido = Boolean(doneEmails.get(email.id));
    }
    for (const email of next.emailsGlobais) if (doneEmails.has(email.id)) email.concluido = Boolean(doneEmails.get(email.id));
    next.observacao = loaded.estado.observacao;
    next.criadoEm = loaded.estado.criadoEm;
    next.ultimaAlteracao = new Date().toISOString();
    await this.workspace.saveCurrentState(next);
    return next;
  }

  async mark(input: { tipo: "tarefa" | "email"; id: string; concluido: boolean }) {
    const loaded = await this.workspace.load();
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const state = input.tipo === "tarefa"
      ? toggleTask(loaded.estado, input.id, input.concluido)
      : toggleEmail(loaded.estado, input.id, input.concluido);
    await this.workspace.saveCurrentState(state);
    return { state, progress: obligationProgress(state) };
  }

  async setObservation(value: string): Promise<EstadoAtual> {
    const loaded = await this.workspace.load();
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const state = setObservation(loaded.estado, value);
    await this.workspace.saveCurrentState(state);
    return state;
  }

  async complete(): Promise<RegistroHistorico> {
    const loaded = await this.workspace.load();
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    const progress = obligationProgress(loaded.estado);
    if (!progress.total || progress.done !== progress.total) throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
    return this.operational.completeState(loaded.estado, new Date().toISOString());
  }

  async abandon(): Promise<void> {
    const loaded = await this.workspace.load();
    if (!loaded.estado) throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");
    await this.workspace.saveCurrentState(null);
  }

  async saveConfiguration(config: Configuracao): Promise<LoadedData> {
    await this.workspace.saveConfiguration(config);
    return this.workspace.load();
  }

  async saveTask(input: { id: string; criacao?: string; roteiro?: unknown }): Promise<LoadedData> {
    const loaded = await this.workspace.load();
    const config = JSON.parse(JSON.stringify(loaded.configuracao)) as Configuracao;
    const task = config.tarefas.tarefas.find(item => item.id === input.id);
    if (!task) throw new Error("TAREFA NÃO ENCONTRADA.");
    if (Object.prototype.hasOwnProperty.call(input, "criacao")) task.criacao = String(input.criacao ?? "");
    if (Object.prototype.hasOwnProperty.call(input, "roteiro")) task.roteiro = JSON.parse(JSON.stringify(input.roteiro));
    // Configuration edits affect future expedientes only. The active state
    // already contains its own task/email snapshots and must remain unchanged.
    await this.workspace.saveConfiguration(config);
    return this.workspace.load();
  }

  async addTask(input: { nome: string; link: string; criacao: string }) {
    const loaded = await this.workspace.load();
    const task = createTask(loaded.configuracao, input);
    const config = JSON.parse(JSON.stringify(loaded.configuracao)) as Configuracao;
    config.tarefas.tarefas.push(task);
    await this.workspace.saveConfiguration(config);
    return task;
  }

  async addProfile(input: { nome: string; tarefas: string[] }) {
    const loaded = await this.workspace.load();
    const profile = createProfile(loaded.configuracao, input.nome, input.tarefas);
    const config = JSON.parse(JSON.stringify(loaded.configuracao)) as Configuracao;
    config.perfis.perfis.push(profile);
    config.layout.ordemPerfis.push(profile.id);
    config.layout.ordemTarefas[profile.id] = profile.tarefas.slice();
    await this.workspace.saveConfiguration(config);
    return profile;
  }

  async addEmail(input: { nome: string; titulo: string; corpo: string; global?: boolean }) {
    const loaded = await this.workspace.load();
    const email = createEmail(loaded.configuracao, input);
    const config = JSON.parse(JSON.stringify(loaded.configuracao)) as Configuracao;
    config.email.emails.push(email);
    if (input.global) config.email.emailsGlobais.push(email.id);
    await this.workspace.saveConfiguration(config);
    return email;
  }

  async saveCalendarDate(input: { data: string; folga: boolean; feriado: boolean }) {
    const loaded = await this.workspace.load();
    const dates = loaded.calendario.datas.filter(item => item.data !== input.data);
    if (input.folga || input.feriado) dates.push(input);
    dates.sort((a, b) => a.data.localeCompare(b.data));
    const calendar = { schemaVersion: 1 as const, datas: dates };
    await this.workspace.saveCalendar(calendar);
    return calendar;
  }
}
