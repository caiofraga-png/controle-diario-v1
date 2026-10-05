import type { CalendarioData, Email, Perfil, Tarefa } from "../shared/types/domain";
import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { DriveService, STRUCTURE, type DriveMeta } from "./driveService";

export interface LayoutConfig {
  schemaVersion: 1;
  blocos: string[];
  ordemPerfis: string[];
  ordemTarefas: Record<string, string[]>;
  abas: string[];
  painelLateral: { largura: number };
  expansaoLateral?: { posicao: "esquerda" | "direita" };
  criacaoRoteiro?: { modo: "POPUP" | "EXPANSÃO" };
}

export interface Configuracao {
  tarefas: { schemaVersion: 1; tarefas: Tarefa[] };
  perfis: { schemaVersion: 1; perfis: Perfil[] };
  email: { schemaVersion: 1; emails: Email[]; emailsGlobais: string[] };
  layout: LayoutConfig;
}

export interface LoadedData {
  configuracao: Configuracao;
  calendario: { schemaVersion: 1; datas: CalendarioData[] };
  estado: EstadoAtual | null;
}

const EMPTY_CALENDAR = (): LoadedData["calendario"] => ({ schemaVersion: 1, datas: [] });
const EMPTY_STATE = { schemaVersion: 1 as const, estado: null };

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}

function assertSchema(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertObject(value, message);
  if (value.schemaVersion !== 1) throw new Error(message);
}

function assertString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string") throw new Error(message);
}

export function validateTarefas(value: unknown): Configuracao["tarefas"] {
  assertSchema(value, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.tarefas)) throw new Error("O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const tarefa of value.tarefas) {
    assertObject(tarefa, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    assertString(tarefa.id, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    assertString(tarefa.nome, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    if (ids.has(tarefa.id)) throw new Error("HÁ IDs DE TAREFA DUPLICADOS.");
    ids.add(tarefa.id);
    if (typeof tarefa.ativo !== "boolean" || !Array.isArray(tarefa.emailsVinculados)) throw new Error("O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  }
  return value as Configuracao["tarefas"];
}

export function validatePerfis(value: unknown): Configuracao["perfis"] {
  assertSchema(value, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.perfis)) throw new Error("O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const perfil of value.perfis) {
    assertObject(perfil, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    assertString(perfil.id, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    assertString(perfil.nome, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    if (ids.has(perfil.id) || typeof perfil.ativo !== "boolean" || !Array.isArray(perfil.tarefas)) throw new Error("O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    ids.add(perfil.id);
  }
  return value as Configuracao["perfis"];
}

export function validateEmails(value: unknown): Configuracao["email"] {
  assertSchema(value, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.emails) || !Array.isArray(value.emailsGlobais)) throw new Error("O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const email of value.emails) {
    assertObject(email, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.id, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.nome, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.titulo, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.corpo, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    if (ids.has(email.id) || typeof email.ativo !== "boolean") throw new Error("HÁ IDs DE E-MAIL DUPLICADOS OU INVÁLIDOS.");
    ids.add(email.id);
  }
  return value as Configuracao["email"];
}

export function validateLayout(value: unknown): LayoutConfig {
  assertSchema(value, "O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.blocos) || !Array.isArray(value.ordemPerfis) || !value.ordemTarefas || !Array.isArray(value.abas)) throw new Error("O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  assertObject(value.painelLateral, "O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  if (typeof value.painelLateral.largura !== "number") throw new Error("O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  return value as unknown as LayoutConfig;
}

function validateCalendar(value: unknown): LoadedData["calendario"] {
  assertSchema(value, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.datas)) throw new Error("O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  for (const item of value.datas) {
    assertObject(item, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
    assertString(item.data, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
    if (typeof item.folga !== "boolean" || typeof item.feriado !== "boolean" || (!item.folga && !item.feriado)) throw new Error("O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  }
  return value as LoadedData["calendario"];
}

function validateState(value: unknown): EstadoAtual | null {
  assertSchema(value, "O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (value.estado === null) return null;
  assertObject(value.estado, "O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (typeof value.estado.id !== "string" || typeof value.estado.data !== "string" || typeof value.estado.observacao !== "string") throw new Error("O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.estado.tarefas) || !Array.isArray(value.estado.emailsGlobais)) throw new Error("O ESTADO ATUAL ESTÁ INVÁLIDO.");
  return value.estado as unknown as EstadoAtual;
}


function validateConfigurationConsistency(config: Configuracao) {
  const taskIds = new Set(config.tarefas.tarefas.map(t => t.id));
  const emailIds = new Set(config.email.emails.map(e => e.id));
  const profileIds = new Set(config.perfis.perfis.map(p => p.id));
  for (const task of config.tarefas.tarefas) {
    for (const emailId of task.emailsVinculados) {
      if (typeof emailId !== "string" || !emailIds.has(emailId)) throw new Error(`A TAREFA ${task.id} POSSUI E-MAIL VINCULADO INEXISTENTE.`);
    }
  }
  for (const profile of config.perfis.perfis) {
    for (const taskId of profile.tarefas) {
      if (typeof taskId !== "string" || !taskIds.has(taskId)) throw new Error(`O PERFIL ${profile.id} POSSUI TAREFA INEXISTENTE.`);
    }
  }
  for (const emailId of config.email.emailsGlobais) {
    if (typeof emailId !== "string" || !emailIds.has(emailId)) throw new Error("A COMPILAÇÃO GLOBAL POSSUI E-MAIL INEXISTENTE.");
  }
  if (config.layout.expansaoLateral && !["esquerda", "direita"].includes(config.layout.expansaoLateral.posicao)) {
    throw new Error("A POSIÇÃO DA EXPANSÃO LATERAL ESTÁ INVÁLIDA.");
  }
  if (config.layout.criacaoRoteiro && !["POPUP", "EXPANSÃO"].includes(config.layout.criacaoRoteiro.modo)) {
    throw new Error("O MODO DE CRIAÇÃO/ROTEIRO ESTÁ INVÁLIDO.");
  }
  for (const id of config.layout.ordemPerfis) if (!profileIds.has(id)) throw new Error("O LAYOUT POSSUI PERFIL INEXISTENTE.");
  for (const [profileId, order] of Object.entries(config.layout.ordemTarefas)) {
    if (profileId !== "GERAL" && !profileIds.has(profileId)) throw new Error("O LAYOUT POSSUI ORDEM DE PERFIL INEXISTENTE.");
    for (const taskId of order) if (!taskIds.has(taskId)) throw new Error("O LAYOUT POSSUI TAREFA INEXISTENTE.");
  }
}

export class DataRepository {
  private readonly meta = new Map<string, DriveMeta>();
  private structureCache: { rootId: string; configId: string; historyId: string; systemId: string } | null = null;

  constructor(private readonly drive: DriveService) {}

  private async structure(rootId: string) {
    if (this.structureCache?.rootId === rootId) return this.structureCache;
    const folders = await this.drive.ensureStructure(rootId);
    const structure = { rootId, configId: folders[STRUCTURE.config], historyId: folders[STRUCTURE.history], systemId: folders[STRUCTURE.system] };
    this.structureCache = structure;
    return structure;
  }

  private async findSingle(parentId: string, name: string) {
    const matches = (await this.drive.listChildren(parentId, name));
    if (matches.length > 1) throw new Error(`HÁ MAIS DE UM ARQUIVO "${name}" NO LOCAL DO CONTROLE DIÁRIO.`);
    return matches[0] ?? null;
  }

  private async readNamed<T>(parentId: string, name: string) {
    const file = await this.findSingle(parentId, name);
    if (!file?.id) return null;
    const result = await this.drive.readJson<T>(file.id);
    this.meta.set(file.id, result.meta);
    return result.data;
  }

  private async writeNamed<T>(parentId: string, name: string, data: T) {
    const file = await this.findSingle(parentId, name);
    if (!file?.id) {
      const id = await this.drive.createJson(parentId, name, data);
      const result = await this.drive.readJson<T>(id);
      this.meta.set(id, result.meta);
      return;
    }
    const expected = this.meta.get(file.id);
    if (!expected) {
      const current = await this.drive.readJson<T>(file.id);
      this.meta.set(file.id, current.meta);
      throw new Error(`O ARQUIVO ${name.toUpperCase()} PRECISA SER RECARREGADO ANTES DA GRAVAÇÃO.`);
    }
    await this.drive.writeJson(file.id, data, expected);
    const refreshed = await this.drive.readJson<T>(file.id);
    this.meta.set(file.id, refreshed.meta);
  }

  async load(rootId: string): Promise<LoadedData> {
    const s = await this.structure(rootId);
    const [tarefas, perfis, email, layout, calendario, estado] = await Promise.all([
      this.readNamed(s.configId, "tarefas.json"),
      this.readNamed(s.configId, "perfis.json"),
      this.readNamed(s.configId, "email.json"),
      this.readNamed(s.configId, "layout.json"),
      this.readNamed(s.systemId, "calendario.json"),
      this.readNamed<{ schemaVersion: 1; estado: EstadoAtual | null }>(s.systemId, "estado_atual.json")
    ]);

    if (!tarefas || !perfis || !email || !layout) throw new Error("A CONFIGURAÇÃO DO CONTROLE DIÁRIO ESTÁ INCOMPLETA NO GOOGLE DRIVE.");
    const configuracao: Configuracao = {
      tarefas: validateTarefas(tarefas),
      perfis: validatePerfis(perfis),
      email: validateEmails(email),
      layout: validateLayout(layout)
    };
    validateConfigurationConsistency(configuracao);
    return {
      configuracao,
      calendario: calendario ? validateCalendar(calendario) : EMPTY_CALENDAR(),
      estado: estado ? validateState(estado) : null
    };
  }

  async saveConfiguration(rootId: string, kind: "tarefas" | "perfis" | "email" | "layout", value: unknown) {
    const s = await this.structure(rootId);
    const validators = { tarefas: validateTarefas, perfis: validatePerfis, email: validateEmails, layout: validateLayout } as const;
    const validated = validators[kind](value);
    const fileName = `${kind}.json`;
    await this.writeNamed(s.configId, fileName, validated);
    return validated;
  }


  async saveConfigurationBundle(rootId: string, config: Configuracao) {
    const previous = await this.load(rootId);
    const writes: Array<["tarefas"|"perfis"|"email"|"layout", unknown]> = [
      ["tarefas", config.tarefas], ["perfis", config.perfis], ["email", config.email], ["layout", config.layout]
    ];
    const originals: Array<["tarefas"|"perfis"|"email"|"layout", unknown]> = [
      ["tarefas", previous.configuracao.tarefas], ["perfis", previous.configuracao.perfis], ["email", previous.configuracao.email], ["layout", previous.configuracao.layout]
    ];
    const changed = writes.filter(([k,v]) => JSON.stringify(v) !== JSON.stringify((previous.configuracao as any)[k]));
    const done: typeof changed = [];
    try {
      for (const item of changed) { await this.saveConfiguration(rootId, item[0], item[1]); done.push(item); }
    } catch (error) {
      for (const [kind] of done.reverse()) {
        const original = originals.find(x=>x[0]===kind)!;
        try { await this.saveConfiguration(rootId, kind, original[1]); } catch { /* preserve primary error */ }
      }
      throw error;
    }
    return config;
  }

  async saveCurrentState(rootId: string, estado: EstadoAtual | null) {
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado });
  }

  async saveCalendar(rootId: string, calendario: LoadedData["calendario"]) {
    validateCalendar(calendario);
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "calendario.json", calendario);
  }

  async completeState(rootId: string, state: EstadoAtual, concluidoEm: string): Promise<RegistroHistorico> {
    const progress = this.progress(state);
    if (progress.total === 0 || progress.done !== progress.total) throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: state });
    const year = state.data.slice(0, 4);
    const monthNumber = state.data.slice(5, 7);
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = `${monthNumber} - ${monthNames[Math.max(0, Number(monthNumber) - 1)] ?? monthNumber}`;
    const yearId = await this.drive.findOrCreateFolder(s.historyId, year);
    const monthId = await this.drive.findOrCreateFolder(yearId, month);
    const dateId = await this.drive.findOrCreateFolder(monthId, state.data);
    const existing = await this.drive.listChildren(dateId);
    const existingRecords: RegistroHistorico[] = [];
    for (const file of existing) {
      if (!/^R\d{3}\.json$/.test(file.name ?? "") || !file.id) continue;
      try { existingRecords.push((await this.drive.readJson<RegistroHistorico>(file.id)).data); } catch { /* ignore malformed unrelated files */ }
    }
    const recovered = existingRecords.find(r => r.data === state.data && r.perfil.id === state.perfil.id && r.criadoEm === state.criadoEm);
    if (recovered) {
      await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado: null });
      await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: null });
      return recovered;
    }
    const versions = existingRecords.map(r => r.versao);
    const versao = (versions.length ? Math.max(...versions) : 0) + 1;
    const registro: RegistroHistorico = {
      schemaVersion: 1, id: `${state.data}-R${String(versao).padStart(3, "0")}`, versao, data: state.data,
      perfil: state.perfil, tarefas: state.tarefas, emailsGlobais: state.emailsGlobais, observacao: state.observacao,
      status: "CONCLUIDO", criadoEm: state.criadoEm, concluidoEm, ultimaAlteracao: state.ultimaAlteracao, origemVersao: null
    };
    await this.drive.createJson(dateId, `R${String(versao).padStart(3, "0")}.json`, registro);
    const verified = await this.findSingle(dateId, `R${String(versao).padStart(3, "0")}.json`);
    if (!verified?.id) throw new Error("NÃO FOI POSSÍVEL CONFIRMAR O REGISTRO DO HISTÓRICO.");
    await this.drive.readJson<RegistroHistorico>(verified.id);
    await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado: null });
    await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: null });
    return registro;
  }

  progress(state: EstadoAtual) {
    const emailIds = new Set<string>();
    for (const e of state.emailsGlobais) emailIds.add(e.id);
    for (const t of state.tarefas) for (const e of t.emailsVinculados) emailIds.add(e.id);
    let done = state.tarefas.filter(t => t.concluida).length;
    for (const id of emailIds) {
      const e = state.emailsGlobais.find(x => x.id === id) ?? state.tarefas.flatMap(t => t.emailsVinculados).find(x => x.id === id);
      if (e?.concluido) done++;
    }
    const total = state.tarefas.length + emailIds.size;
    return { done, total, percentage: total ? Math.round(done / total * 100) : 0 };
  }

  async createHistory(rootId: string, registro: RegistroHistorico) {
    const s = await this.structure(rootId);
    const year = registro.data.slice(0, 4);
    const monthNumber = registro.data.slice(5, 7);
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = `${monthNumber} - ${monthNames[Math.max(0, Number(monthNumber) - 1)] ?? monthNumber}`;
    const yearId = await this.drive.findOrCreateFolder(s.historyId, year);
    const monthId = await this.drive.findOrCreateFolder(yearId, month);
    const dateId = await this.drive.findOrCreateFolder(monthId, registro.data);
    const name = `R${String(registro.versao).padStart(3, "0")}.json`;
    const existing = await this.findSingle(dateId, name);
    if (existing) throw new Error("A VERSÃO DO HISTÓRICO JÁ EXISTE. A GRAVAÇÃO FOI BLOQUEADA.");
    return this.drive.createJson(dateId, name, registro);
  }
}
