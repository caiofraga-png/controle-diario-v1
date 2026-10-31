import type { Email, Perfil, Tarefa } from "./domain";

export interface EmailSnapshot extends Email {
  concluido: boolean;
}

export interface TarefaSnapshot extends Omit<Tarefa, "emailsVinculados"> {
  concluida: boolean;
  emailsVinculados: EmailSnapshot[];
}

export interface ExpedienteCatalogSnapshot {
  tarefas: { schemaVersion: 1; tarefas: Tarefa[] };
  perfis: { schemaVersion: 1; perfis: Perfil[] };
  email: { schemaVersion: 1; emails: Email[]; emailsGlobais: string[] };
  layout: { ordemPerfis: string[]; ordemTarefas: Record<string, string[]> };
}

export interface EstadoAtual {
  id: string;
  data: string;
  perfil: Pick<Perfil, "id" | "nome">;
  tarefas: TarefaSnapshot[];
  emailsGlobais: EmailSnapshot[];
  observacao: string;
  criadoEm: string;
  ultimaAlteracao: string;
  /** Immutable catalog/layout version captured when this expediente starts. */
  catalogSnapshot?: ExpedienteCatalogSnapshot;
}

export interface RegistroHistorico {
  schemaVersion: 1;
  id: string;
  versao: number;
  data: string;
  perfil: Pick<Perfil, "id" | "nome">;
  tarefas: TarefaSnapshot[];
  emailsGlobais: EmailSnapshot[];
  observacao: string;
  status: "CONCLUIDO";
  criadoEm: string;
  concluidoEm: string;
  ultimaAlteracao: string;
  origemVersao: string | null;
}
