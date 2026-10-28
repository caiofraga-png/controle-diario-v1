import {
  collection, doc, getDoc, getDocs, query, runTransaction,
  serverTimestamp, setDoc, where, type DocumentData,
} from "firebase/firestore";
import type { EstadoAtual, RegistroHistorico, TarefaSnapshot } from "../shared/types/state";
import { requireFirebase } from "./firebaseClient";

type HistoryEntry = RegistroHistorico & { ownerUid: string };

function assertCurrentState(value: unknown): EstadoAtual | null {
  if (!value || typeof value !== "object" || (value as any).schemaVersion !== 1) {
    throw new Error("O ESTADO ATUAL NO FIREBASE ESTÁ INVÁLIDO.");
  }
  const state = (value as any).estado;
  if (state === null) return null;
  if (!state || typeof state !== "object" || typeof state.id !== "string" ||
      typeof state.data !== "string" || typeof state.observacao !== "string" ||
      !Array.isArray(state.tarefas) || !Array.isArray(state.emailsGlobais) ||
      !state.perfil || typeof state.perfil.id !== "string") {
    throw new Error("O ESTADO ATUAL NO FIREBASE ESTÁ INVÁLIDO.");
  }
  return state as EstadoAtual;
}

function progress(state: EstadoAtual) {
  const emailIds = new Set<string>();
  for (const email of state.emailsGlobais) emailIds.add(email.id);
  for (const task of state.tarefas) for (const email of task.emailsVinculados) emailIds.add(email.id);
  let done = state.tarefas.filter(task => task.concluida).length;
  for (const id of emailIds) {
    const email = state.emailsGlobais.find(item => item.id === id) ??
      state.tarefas.flatMap(task => task.emailsVinculados).find(item => item.id === id);
    if (email?.concluido) done++;
  }
  return { done, total: state.tarefas.length + emailIds.size };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Per-user operational data adapter for the staged Drive-to-Firestore migration.
 * Current state is mutable; completed history is append-only (create-only in rules).
 * This adapter is intentionally not yet wired as the app's live repository.
 */
export class FirebaseOperationalService {
  private uid(): string {
    const { auth } = requireFirebase();
    const user = auth.currentUser;
    if (!user || !user.emailVerified) {
      throw new Error("FAÇA LOGIN COM UMA CONTA EMPRESARIAL VERIFICADA.");
    }
    return user.uid;
  }

  private currentRef(uid: string) {
    const { db } = requireFirebase();
    return doc(db, "users", uid, "operational", "currentState");
  }

  private historyCollection(uid: string) {
    const { db } = requireFirebase();
    return collection(db, "users", uid, "operational", "history", "entries");
  }

  async loadCurrentState(): Promise<EstadoAtual | null> {
    const uid = this.uid();
    const snapshot = await getDoc(this.currentRef(uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (data.ownerUid !== uid) throw new Error("O ESTADO ATUAL NÃO PERTENCE AO USUÁRIO AUTENTICADO.");
    return assertCurrentState(data);
  }

  async saveCurrentState(state: EstadoAtual | null): Promise<void> {
    const uid = this.uid();
    const { db } = requireFirebase();
    await setDoc(this.currentRef(uid), {
      schemaVersion: 1,
      ownerUid: uid,
      estado: state,
      updatedAt: serverTimestamp(),
    });
  }

  async listHistory(date: string): Promise<Array<{ versao: number; nome: string; concluidoEm: string; origemVersao: string | null }>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A DATA DO HISTÓRICO É INVÁLIDA.");
    const uid = this.uid();
    const records = await getDocs(query(this.historyCollection(uid), where("ownerUid", "==", uid)));
    return records.docs.filter(snapshot => snapshot.data().data === date).map(snapshot => {
      const record = snapshot.data() as HistoryEntry;
      return {
        versao: record.versao,
        nome: snapshot.id,
        concluidoEm: record.concluidoEm,
        origemVersao: record.origemVersao,
      };
    }).sort((a, b) => a.versao - b.versao);
  }

  async readHistory(historyId: string): Promise<RegistroHistorico> {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}_R[0-9]{3,}$/.test(historyId)) {
      throw new Error("O IDENTIFICADOR DO HISTÓRICO É INVÁLIDO.");
    }
    const uid = this.uid();
    const { db } = requireFirebase();
    const snapshot = await getDoc(doc(db, "users", uid, "operational", "history", "entries", historyId));
    if (!snapshot.exists()) throw new Error("A VERSÃO DO HISTÓRICO NÃO FOI ENCONTRADA.");
    const data = snapshot.data() as HistoryEntry;
    if (data.ownerUid !== uid || data.status !== "CONCLUIDO" || data.schemaVersion !== 1) {
      throw new Error("O REGISTRO HISTÓRICO NO FIREBASE É INVÁLIDO.");
    }
    const { ownerUid: _ownerUid, ...record } = data;
    return record;
  }

  async completeState(state: EstadoAtual, concluidoEm = new Date().toISOString()): Promise<RegistroHistorico> {
    const uid = this.uid();
    const tally = progress(state);
    if (tally.total === 0 || tally.done !== tally.total) {
      throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.data)) throw new Error("A DATA DO EXPEDIENTE É INVÁLIDA.");

    const { db } = requireFirebase();
    const currentRef = this.currentRef(uid);
    const history = this.historyCollection(uid);

    return runTransaction(db, async transaction => {
      const currentSnapshot = await transaction.get(currentRef);
      const currentData = currentSnapshot.exists() ? currentSnapshot.data() : null;
      const persistedState = currentData ? assertCurrentState(currentData) : null;
      if (!persistedState || persistedState.id !== state.id || persistedState.criadoEm !== state.criadoEm) {
        throw new Error("O EXPEDIENTE MUDOU OU NÃO ESTÁ MAIS EM PRODUÇÃO. RECARREGUE ANTES DE CONCLUIR.");
      }
      const persistedProgress = progress(persistedState);
      if (persistedProgress.total === 0 || persistedProgress.done !== persistedProgress.total) {
        throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
      }
      const existing = await transaction.get(query(history, where("ownerUid", "==", uid)));
      const versions = existing.docs.filter(item => item.data().data === persistedState.data).map(item => Number(item.data().versao)).filter(Number.isFinite);
      const versao = (versions.length ? Math.max(...versions) : 0) + 1;
      const recordId = persistedState.data + "_R" + String(versao).padStart(3, "0");
      const recordRef = doc(history, recordId);
      const record: HistoryEntry = {
        schemaVersion: 1,
        id: persistedState.data + "-R" + String(versao).padStart(3, "0"),
        versao,
        data: persistedState.data,
        perfil: clone(persistedState.perfil),
        tarefas: clone(persistedState.tarefas),
        emailsGlobais: clone(persistedState.emailsGlobais),
        observacao: persistedState.observacao,
        status: "CONCLUIDO",
        criadoEm: persistedState.criadoEm,
        concluidoEm,
        ultimaAlteracao: persistedState.ultimaAlteracao,
        origemVersao: null,
        ownerUid: uid,
      };
      transaction.set(recordRef, record as unknown as DocumentData);
      transaction.set(currentRef, {
        schemaVersion: 1,
        ownerUid: uid,
        estado: null,
        updatedAt: serverTimestamp(),
      });
      return record;
    }).then(({ ownerUid: _ownerUid, ...record }) => record);
  }

  /** Append an errata as a new immutable version; never update/delete prior history. */
  async saveErrata(
    source: RegistroHistorico,
    edited: Pick<RegistroHistorico, "tarefas" | "emailsGlobais" | "observacao">,
  ): Promise<RegistroHistorico> {
    if (!source?.id || source.data !== source.id.slice(0, 10)) throw new Error("REGISTRO HISTÓRICO INVÁLIDO.");
    if (edited.tarefas.length !== source.tarefas.length) throw new Error("A ERRATA TENTOU ALTERAR A ESTRUTURA DAS TAREFAS.");
    const normalizeTask = (task: TarefaSnapshot) => ({
      ...task,
      concluida: Boolean(task.concluida),
      emailsVinculados: task.emailsVinculados.map(email => ({ ...email, concluido: Boolean(email.concluido) })),
    });
    const tasks = edited.tarefas.map(normalizeTask);
    for (let i = 0; i < source.tarefas.length; i++) {
      const before = source.tarefas[i], after = tasks[i];
      if (before.id !== after.id || before.nome !== after.nome || before.link !== after.link ||
          before.criacao !== after.criacao || JSON.stringify(before.roteiro) !== JSON.stringify(after.roteiro) ||
          before.emailsVinculados.length !== after.emailsVinculados.length) {
        throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
      }
      for (let j = 0; j < before.emailsVinculados.length; j++) {
        const a = before.emailsVinculados[j], b = after.emailsVinculados[j];
        if (a.id !== b.id || a.nome !== b.nome || a.titulo !== b.titulo || a.corpo !== b.corpo || a.ativo !== b.ativo) {
          throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
        }
      }
    }
    if (edited.emailsGlobais.length !== source.emailsGlobais.length) throw new Error("A ERRATA TENTOU ALTERAR OS E-MAILS DO REGISTRO.");
    for (let i = 0; i < source.emailsGlobais.length; i++) {
      const a = source.emailsGlobais[i], b = edited.emailsGlobais[i];
      if (a.id !== b.id || a.nome !== b.nome || a.titulo !== b.titulo || a.corpo !== b.corpo || a.ativo !== b.ativo) {
        throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
      }
    }

    const byEmail = new Map<string, boolean>();
    for (let i = 0; i < source.tarefas.length; i++) {
      if (source.tarefas[i].concluida !== tasks[i].concluida) {
        for (const email of tasks[i].emailsVinculados) byEmail.set(email.id, tasks[i].concluida);
      }
    }
    for (const task of tasks) for (const email of task.emailsVinculados) if (byEmail.has(email.id)) email.concluido = byEmail.get(email.id)!;
    const emails = clone(edited.emailsGlobais);
    for (const email of emails) if (byEmail.has(email.id)) email.concluido = byEmail.get(email.id)!;
    const normalized = { tarefas: tasks, emailsGlobais: emails, observacao: edited.observacao };
    if (JSON.stringify({ tarefas: source.tarefas, emailsGlobais: source.emailsGlobais, observacao: source.observacao }) === JSON.stringify(normalized)) return source;

    const uid = this.uid();
    const { db } = requireFirebase();
    const history = this.historyCollection(uid);
    return runTransaction(db, async transaction => {
      const existing = await transaction.get(query(history, where("ownerUid", "==", uid)));
      const versions = existing.docs.filter(item => item.data().data === source.data).map(item => Number(item.data().versao)).filter(Number.isFinite);
      const versao = (versions.length ? Math.max(...versions) : 0) + 1;
      const recordId = source.data + "_R" + String(versao).padStart(3, "0");
      const recordRef = doc(history, recordId);
      const record: HistoryEntry = {
        ...clone(source),
        id: source.data + "-R" + String(versao).padStart(3, "0"),
        versao,
        tarefas: clone(tasks),
        emailsGlobais: clone(emails),
        observacao: edited.observacao,
        ultimaAlteracao: new Date().toISOString(),
        origemVersao: "R" + String(source.versao).padStart(3, "0"),
        ownerUid: uid,
      };
      transaction.set(recordRef, record as unknown as DocumentData);
      return record;
    }).then(({ ownerUid: _ownerUid, ...record }) => record);
  }
}
