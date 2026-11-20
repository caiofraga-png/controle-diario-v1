import { collectionGroup, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type LiveOperationalEvent = {
  id: string;
  type: "EXPEDIENTE_INICIADO" | "EXPEDIENTE_FINALIZADO" | "TAREFA_FINALIZADA" | "ATENDIMENTO_REGISTRADO";
  uid: string;
  occurredAt: string;
  profile: string;
  date: string;
  task?: string;
  subtype?: string;
  ticket?: string;
};

type State = {
  id?: string;
  data?: string;
  perfil?: { nome?: string };
  criadoEm?: string;
  ultimaAlteracao?: string;
  tarefas?: Array<{ id: string; nome: string; concluida: boolean; concluidaEm?: string }>;
  atendimentos?: Array<{ id: string; subtipo?: string; ticket?: string; criadoEm?: string }>;
} | null;

type History = {
  ownerUid?: string;
  schemaVersion?: number;
  status?: string;
  data?: string;
  criadoEm?: string;
  concluidoEm?: string;
  ultimaAlteracao?: string;
  perfil?: { nome?: string };
  tarefas?: Array<{ id: string; nome: string; concluida: boolean; concluidaEm?: string }>;
  atendimentos?: Array<{ id: string; subtipo?: string; ticket?: string; criadoEm?: string }>;
};

function eventTime(state: State): string {
  const value = state?.ultimaAlteracao || state?.criadoEm;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return new Date().toISOString();
}

function eventsFromHistory(record: History, id: string): LiveOperationalEvent[] {
  if (record.schemaVersion !== 1 || record.status !== "CONCLUIDO" || !record.ownerUid) return [];
  const uid = record.ownerUid, profile = String(record.perfil?.nome ?? "—"), date = String(record.data ?? "");
  const events: LiveOperationalEvent[] = [];
  if (record.criadoEm) events.push({ id: id + "-inicio", type: "EXPEDIENTE_INICIADO", uid, occurredAt: record.criadoEm, profile, date });
  for (const task of record.tarefas ?? []) if (task.concluida && task.concluidaEm) events.push({
    id: id + "-tarefa-" + task.id + "-" + task.concluidaEm, type: "TAREFA_FINALIZADA", uid,
    occurredAt: task.concluidaEm, profile, date, task: task.nome,
  });
  for (const attendance of record.atendimentos ?? []) if (attendance.id) {
    const time = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm))
      ? attendance.criadoEm : record.ultimaAlteracao ?? record.concluidoEm ?? record.criadoEm ?? "";
    events.push({ id: id + "-atendimento-" + attendance.id, type: "ATENDIMENTO_REGISTRADO", uid, occurredAt: time, profile, date, subtype: String(attendance.subtipo ?? "").trim(), ticket: String(attendance.ticket ?? "").trim() });
  }
  if (record.concluidoEm) events.push({ id: id + "-fim", type: "EXPEDIENTE_FINALIZADO", uid, occurredAt: record.concluidoEm, profile, date });
  return events;
}

export function subscribeLiveOperationalEvents(
  callback: (events: LiveOperationalEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = requireFirebase();
  const currentFeed: LiveOperationalEvent[] = [];
  const historicalByPath = new Map<string, LiveOperationalEvent[]>();
  const previous = new Map<string, State>();
  let initializedCurrent = false;

  const emit = () => {
    const historical = [...historicalByPath.values()].flat();
    const combined = [...currentFeed, ...historical];
    combined.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    callback(combined.slice(0, 100));
  };

  const currentSource = query(collectionGroup(db, "operational"), where("schemaVersion", "==", 1));
  const historySource = query(collectionGroup(db, "entries"), where("schemaVersion", "==", 1));

  const unsubscribeCurrent = onSnapshot(currentSource, snapshot => {
    if (!initializedCurrent) {
      for (const item of snapshot.docs) {
        if (item.id !== "currentState") continue;
        const envelope = item.data(), state = (envelope.estado ?? null) as State;
        previous.set(item.ref.path, state);
        if (!state) continue;
        const uid = String(envelope.ownerUid ?? "");
        if (uid) currentFeed.push({ id: item.ref.path + "-inicio-" + String(state.criadoEm ?? state.data ?? ""), type: "EXPEDIENTE_INICIADO", uid, occurredAt: typeof state.criadoEm === "string" ? state.criadoEm : eventTime(state), profile: String(state.perfil?.nome ?? "—"), date: String(state.data ?? "") });
        for (const task of state.tarefas ?? []) if (uid && task.concluida && task.concluidaEm) currentFeed.push({
          id: item.ref.path + "-tarefa-" + task.id + "-" + task.concluidaEm, type: "TAREFA_FINALIZADA", uid,
          occurredAt: task.concluidaEm, profile: String(state.perfil?.nome ?? "—"), date: String(state.data ?? ""), task: task.nome,
        });
        for (const attendance of state.atendimentos ?? []) if (uid && attendance.id) {
          const attendanceTime = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm)) ? attendance.criadoEm : eventTime(state);
          currentFeed.push({ id: item.ref.path + "-atendimento-" + attendance.id, type: "ATENDIMENTO_REGISTRADO", uid, occurredAt: attendanceTime, profile: String(state.perfil?.nome ?? "—"), date: String(state.data ?? ""), subtype: String(attendance.subtipo ?? "").trim(), ticket: String(attendance.ticket ?? "").trim() });
        }
      }
      initializedCurrent = true;
      emit();
      return;
    }
    for (const change of snapshot.docChanges()) {
      const item = change.doc;
      if (item.id !== "currentState") continue;
      const uid = String(item.data().ownerUid ?? "");
      if (!uid) continue;
      const next = (item.data().estado ?? null) as State, before = previous.get(item.ref.path);
      const occurredAt = eventTime(next ?? before ?? null), profile = String(next?.perfil?.nome ?? before?.perfil?.nome ?? "—"), date = String(next?.data ?? before?.data ?? "");
      if (change.type === "added" && next) currentFeed.push({ id: item.ref.path + "-inicio-" + occurredAt, type: "EXPEDIENTE_INICIADO", uid, occurredAt, profile, date });
      else if (before === null && next) currentFeed.push({ id: item.ref.path + "-inicio-" + occurredAt, type: "EXPEDIENTE_INICIADO", uid, occurredAt, profile, date });
      else if (before && !next) currentFeed.push({ id: item.ref.path + "-fim-" + occurredAt, type: "EXPEDIENTE_FINALIZADO", uid, occurredAt, profile, date });
      else if (before && next) {
        const oldAttendanceIds = new Set((before.atendimentos ?? []).map(a => a.id));
        for (const attendance of next.atendimentos ?? []) if (attendance.id && !oldAttendanceIds.has(attendance.id)) {
          const time = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm)) ? attendance.criadoEm : occurredAt;
          currentFeed.push({ id: item.ref.path + "-atendimento-" + attendance.id, type: "ATENDIMENTO_REGISTRADO", uid, occurredAt: time, profile, date, subtype: String(attendance.subtipo ?? "").trim(), ticket: String(attendance.ticket ?? "").trim() });
        }
        const oldTasks = new Map((before.tarefas ?? []).map(t => [t.id, t]));
        for (const task of next.tarefas ?? []) {
          const prior = oldTasks.get(task.id), changed = Boolean(task.concluidaEm && task.concluidaEm !== prior?.concluidaEm), newlyDone = task.concluida && prior?.concluida !== true && !task.concluidaEm;
          if (task.concluida && (changed || newlyDone)) currentFeed.push({ id: item.ref.path + "-tarefa-" + task.id + "-" + (task.concluidaEm || occurredAt), type: "TAREFA_FINALIZADA", uid, occurredAt: task.concluidaEm || occurredAt, profile, date, task: task.nome });
        }
      }
      previous.set(item.ref.path, next);
    }
    emit();
  }, error => onError(error instanceof Error ? error : new Error(String(error))));

  const unsubscribeHistory = onSnapshot(historySource, snapshot => {
    for (const change of snapshot.docChanges()) {
      const item = change.doc;
      historicalByPath.set(item.ref.path, eventsFromHistory(item.data() as History, item.ref.path));
    }
    emit();
  }, error => onError(error instanceof Error ? error : new Error(String(error))));

  return () => { unsubscribeCurrent(); unsubscribeHistory(); };
}
