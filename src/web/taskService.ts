import type { Email, Perfil, Tarefa } from "../shared/types/domain";
import type { EmailSnapshot, EstadoAtual, TarefaSnapshot } from "../shared/types/state";
import type { LoadedData } from "./dataRepository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildTaskOrder(profile: Perfil | null, config: LoadedData["configuracao"]): string[] {
  const active = new Set(config.tarefas.tarefas.filter(t => t.ativo).map(t => t.id));
  if (!profile) return config.layout.ordemTarefas.GERAL?.filter(id => active.has(id)) ?? [];
  const configured = config.layout.ordemTarefas[profile.id] ?? [];
  const associated = new Set(profile.tarefas.filter(id => active.has(id)));
  return configured.filter(id => associated.has(id));
}

export function availableProfiles(config: LoadedData["configuracao"]): Perfil[] {
  return config.layout.ordemPerfis
    .map(id => config.perfis.perfis.find(p => p.id === id))
    .filter((p): p is Perfil => Boolean(p?.ativo));
}

export function findProfile(config: LoadedData["configuracao"], profileId: string): Perfil | null {
  if (profileId === "GERAL") return null;
  return config.perfis.perfis.find(p => p.id === profileId && p.ativo) ?? null;
}

function emailSnapshot(email: Email, concluido = false): EmailSnapshot {
  return { ...clone(email), concluido };
}

export function buildState(data: LoadedData, date: string, profileId: string): EstadoAtual {
  const profile = findProfile(data.configuracao, profileId);
  const order = buildTaskOrder(profile, data.configuracao);
  const byId = new Map(data.configuracao.tarefas.tarefas.map(t => [t.id, t]));
  const emailById = new Map(data.configuracao.email.emails.map(e => [e.id, e]));

  const tasks: TarefaSnapshot[] = [];
  const linkedEmailIds = new Set<string>();
  for (const id of order) {
    const task = byId.get(id);
    if (!task || !task.ativo) continue;
    const emails: EmailSnapshot[] = [];
    for (const emailId of task.emailsVinculados) {
      const configuredEmail = emailById.get(emailId);
      const taskOwned = emailId === `${task.id}_EMAIL`;
      if (linkedEmailIds.has(emailId)) continue;
      if (taskOwned) {
        linkedEmailIds.add(emailId);
        emails.push({
          id: emailId,
          nome: `E-MAIL — ${task.nome}`,
          titulo: "",
          corpo: "",
          ativo: true,
          concluido: false
        });
        continue;
      }
      if (!configuredEmail || !configuredEmail.ativo) continue;
      linkedEmailIds.add(configuredEmail.id);
      emails.push(emailSnapshot(configuredEmail, false));
    }
    tasks.push({ ...clone(task), concluida: false, emailsVinculados: emails });
  }

  const globalIds = [...new Set(data.configuracao.email.emailsGlobais)].filter(id => {
    const email = emailById.get(id);
    return Boolean(email?.ativo);
  });
  const globalEmails = globalIds.map(id => emailSnapshot(emailById.get(id)!, false));

  return {
    id: `${date}-${profileId}`,
    data: date,
    perfil: profile ? { id: profile.id, nome: profile.nome } : { id: "GERAL", nome: "GERAL" },
    tarefas: tasks,
    emailsGlobais: globalEmails,
    observacao: "",
    criadoEm: new Date().toISOString(),
    ultimaAlteracao: new Date().toISOString()
  };
}

export function uniqueEmailSnapshots(state: EstadoAtual): EmailSnapshot[] {
  const map = new Map<string, EmailSnapshot>();
  for (const email of state.emailsGlobais) map.set(email.id, email);
  for (const task of state.tarefas) for (const email of task.emailsVinculados) if (!map.has(email.id)) map.set(email.id, email);
  return [...map.values()];
}

export function obligationProgress(state: EstadoAtual) {
  const emailIds = new Set<string>();
  for (const email of state.emailsGlobais) emailIds.add(email.id);
  for (const task of state.tarefas) for (const email of task.emailsVinculados) emailIds.add(email.id);
  const tasksDone = state.tarefas.filter(t => t.concluida).length;
  let emailsDone = 0;
  for (const id of emailIds) {
    const global = state.emailsGlobais.find(e => e.id === id);
    const linked = state.tarefas.flatMap(t => t.emailsVinculados).find(e => e.id === id);
    if (global?.concluido || linked?.concluido) emailsDone++;
  }
  const total = state.tarefas.length + emailIds.size;
  const done = tasksDone + emailsDone;
  return { done, total, percentage: total ? Math.round((done / total) * 100) : 0 };
}

export function toggleTask(state: EstadoAtual, taskId: string, checked: boolean): EstadoAtual {
  const next = clone(state);
  const task = next.tarefas.find(t => t.id === taskId);
  if (!task) throw new Error("TAREFA NÃO ENCONTRADA.");
  task.concluida = checked;
  const linkedIds = new Set(task.emailsVinculados.map(e => e.id));
  for (const t of next.tarefas) for (const email of t.emailsVinculados) if (linkedIds.has(email.id)) email.concluido = checked;
  for (const email of next.emailsGlobais) if (linkedIds.has(email.id)) email.concluido = checked;
  next.ultimaAlteracao = new Date().toISOString();
  return next;
}

export function toggleEmail(state: EstadoAtual, emailId: string, checked: boolean): EstadoAtual {
  const next = clone(state);
  for (const email of next.emailsGlobais) if (email.id === emailId) email.concluido = checked;
  for (const task of next.tarefas) for (const email of task.emailsVinculados) if (email.id === emailId) email.concluido = checked;
  next.ultimaAlteracao = new Date().toISOString();
  return next;
}

export function setObservation(state: EstadoAtual, value: string): EstadoAtual {
  const next = clone(state);
  next.observacao = value;
  next.ultimaAlteracao = new Date().toISOString();
  return next;
}

export function hasObligations(state: EstadoAtual): boolean {
  return obligationProgress(state).total > 0;
}
