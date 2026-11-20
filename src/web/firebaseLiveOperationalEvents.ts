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

function eventsFromHistory(record: History, id: string): LiveOperationalEvent[] {
  if (record.schemaVersion !== 1 || record.status !== "CONCLUIDO" || !record.ownerUid) return [];
  const uid = record.ownerUid;
  const profile = String(record.perfil?.nome ?? "—");
  const date = String(record.data ?? "");
  const events: LiveOperationalEvent[] = [];
  if (record.criadoEm) events.push({ id: id + "-inicio", type: "EXPEDIENTE_INICIADO", uid, occurredAt: record.criadoEm, profile, date });
  for (const task of record.tarefas ?? []) {
    if (task.concluida && task.concluidaEm) events.push({
      id: id + "-tarefa-" + task.id + "-" + task.concluidaEm, type: "TAREFA_FINALIZADA",
      uid, occurredAt: task.concluidaEm, profile, date, task: task.nome,
    });
  }
  for (const attendance of record.atendimentos ?? []) {
    if (!attendance.id) continue;
    const time = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm)) ? attendance.criadoEm : record.ultimaAlteracao ?? record.concluidoEm ?? record.criadoEm;
    events.push({ id: id + "-atendimento-" + attendance.id, type: "ATENDIMENTO_REGISTRADO", uid, occurredAt: time, profile, date, subtype: String(attendance.subtipo ?? "").trim(), ticket: String(attendance.ticket ?? "").trim() });
  }
  if (record.concluidoEm) events.push({ id: id + "-fim", type: "EXPEDIENTE_FINALIZADO", uid, occurredAt: record.concluidoEm, profile, date });
  return events;
}

function eventTime(state: State): string {
  const value = state?.ultimaAlteracao || state?.criadoEm;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return new Date().toISOString();
}

export function subscribeLiveOperationalEvents(
  callback: (events: LiveOperationalEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = requireFirebase();
  const feed: LiveOperationalEvent[] = [];
  const previous = new Map<string, State>();
  let initialized = false;
  const source = query(collectionGroup(db, "operational"), where("schemaVersion", "==", 1));

  return onSnapshot(source, snapshot => {
    if (!initialized) {
      for (const item of snapshot.docs) {
        const envelope = item.data();
        if (item.id !== "currentState") {
          feed.push(...eventsFromHistory(envelope as History, item.ref.path));
          continue;
        }
        const state = (envelope.estado ?? null) as State;
        previous.set(item.ref.path, state);
        if (state) {
          const uid = String(item.data().ownerUid ?? "");
          if (uid) feed.push({
            id: item.id + "-inicio-" + String(state.criadoEm ?? state.data ?? item.ref.path),
            type: "EXPEDIENTE_INICIADO",
            uid,
            occurredAt: typeof state.criadoEm === "string" ? state.criadoEm : eventTime(state),
            profile: String(state.perfil?.nome ?? "—"),
            date: String(state.data ?? ""),
          });
          for (const task of state.tarefas ?? []) {
            if (uid && task.concluida && task.concluidaEm) feed.push({
              id: item.ref.path + "-tarefa-" + task.id + "-" + task.concluidaEm,
              type: "TAREFA_FINALIZADA",
              uid,
              occurredAt: task.concluidaEm,
              profile: String(state.perfil?.nome ?? "—"),
              date: String(state.data ?? ""),
              task: task.nome,
            });
          }
          // Reconstitui os atendimentos já existentes em expedientes ainda abertos
          // para que a lista sobreviva à atualização da página, sem novas gravações.
          for (const attendance of state.atendimentos ?? []) {
            if (!uid || !attendance.id) continue;
            const attendanceTime = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm))
              ? attendance.criadoEm
              : eventTime(state);
            feed.push({
              id: item.ref.path + "-atendimento-" + attendance.id,
              type: "ATENDIMENTO_REGISTRADO",
              uid,
              occurredAt: attendanceTime,
              profile: String(state.perfil?.nome ?? "—"),
              date: String(state.data ?? ""),
              subtype: String(attendance.subtipo ?? "").trim(),
              ticket: String(attendance.ticket ?? "").trim(),
            });
          }
        }
      }
      initialized = true;
      feed.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      callback(feed.slice(0, 100));
      return;
    }

    for (const change of snapshot.docChanges()) {
      const item = change.doc;
      if (item.id !== "currentState") {
        if (change.type === "added" || change.type === "modified") {
          const historical = eventsFromHistory(item.data() as History, item.ref.path);
          const ids = new Set(feed.map(event => event.id));
          for (const event of historical) if (!ids.has(event.id)) feed.push(event);
        }
        continue;
      }
      const uid = String(item.data().ownerUid ?? "");
      if (!uid) continue;
      const next = (item.data().estado ?? null) as State;
      const before = previous.get(item.ref.path);
      const occurredAt = eventTime(next ?? before ?? null);
      const profile = String(next?.perfil?.nome ?? before?.perfil?.nome ?? "—");
      const date = String(next?.data ?? before?.data ?? "");

      if (change.type === "added" && next) {
        feed.push({ id: item.id + "-" + occurredAt, type: "EXPEDIENTE_INICIADO", uid, occurredAt, profile, date });
      } else if (before === null && next) {
        feed.push({ id: item.id + "-" + occurredAt, type: "EXPEDIENTE_INICIADO", uid, occurredAt, profile, date });
      } else if (before && !next) {
        feed.push({ id: item.id + "-" + occurredAt, type: "EXPEDIENTE_FINALIZADO", uid, occurredAt, profile, date });
      } else if (before && next) {
        const oldAttendanceIds = new Set((before.atendimentos ?? []).map(item => item.id));
        for (const attendance of next.atendimentos ?? []) {
          if (!attendance.id || oldAttendanceIds.has(attendance.id)) continue;
          const attendanceTime = typeof attendance.criadoEm === "string" && !Number.isNaN(Date.parse(attendance.criadoEm))
            ? attendance.criadoEm
            : occurredAt;
          feed.push({
            id: item.ref.path + "-atendimento-" + attendance.id,
            type: "ATENDIMENTO_REGISTRADO",
            uid,
            occurredAt: attendanceTime,
            profile,
            date,
            subtype: String(attendance.subtipo ?? "").trim(),
            ticket: String(attendance.ticket ?? "").trim(),
          });
        }
        const oldTasks = new Map((before.tarefas ?? []).map(task => [task.id, task]));
        for (const task of next.tarefas ?? []) {
          const previousTask = oldTasks.get(task.id);
          const completionTimestampChanged = Boolean(
            task.concluidaEm && task.concluidaEm !== previousTask?.concluidaEm
          );
          const newlyCompletedWithoutTimestamp = task.concluida && previousTask?.concluida !== true && !task.concluidaEm;
          if (task.concluida && (completionTimestampChanged || newlyCompletedWithoutTimestamp)) {
            const taskTime = task.concluidaEm || occurredAt;
            feed.push({ id: item.ref.path + "-tarefa-" + task.id + "-" + taskTime, type: "TAREFA_FINALIZADA", uid, occurredAt: taskTime, profile, date, task: task.nome });
          }
        }
      }
      previous.set(item.ref.path, next);
    }

    feed.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    callback(feed.slice(0, 100));
  }, error => onError(error instanceof Error ? error : new Error(String(error))));
}
