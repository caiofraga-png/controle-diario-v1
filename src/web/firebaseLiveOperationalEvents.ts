import { collectionGroup, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { requireFirebase } from "./firebaseClient";

export type LiveOperationalEvent = {
  id: string;
  type: "EXPEDIENTE_INICIADO" | "EXPEDIENTE_FINALIZADO" | "TAREFA_FINALIZADA";
  uid: string;
  occurredAt: string;
  profile: string;
  date: string;
  task?: string;
};

type State = {
  id?: string;
  data?: string;
  perfil?: { nome?: string };
  criadoEm?: string;
  ultimaAlteracao?: string;
  tarefas?: Array<{ id: string; nome: string; concluida: boolean }>;
} | null;

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
        if (item.id !== "currentState") continue;
        const state = (item.data().estado ?? null) as State;
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
        }
      }
      initialized = true;
      feed.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      callback(feed.slice(0, 100));
      return;
    }

    for (const change of snapshot.docChanges()) {
      const item = change.doc;
      if (item.id !== "currentState") continue;
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
        const oldTasks = new Map((before.tarefas ?? []).map(task => [task.id, task.concluida]));
        for (const task of next.tarefas ?? []) {
          if (task.concluida && oldTasks.get(task.id) === false) {
            feed.push({ id: item.id + "-" + task.id + "-" + occurredAt, type: "TAREFA_FINALIZADA", uid, occurredAt, profile, date, task: task.nome });
          }
        }
      }
      previous.set(item.ref.path, next);
    }

    feed.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    callback(feed.slice(0, 100));
  }, error => onError(error instanceof Error ? error : new Error(String(error))));
}
