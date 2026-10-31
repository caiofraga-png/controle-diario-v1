import type { Email, Perfil, Tarefa } from "./domain";

export interface EmailSnapshot extends Email {
  concluido: boolean;
}

export interface TarefaSnapshot extends Omit<Tarefa, "emailsVinculados"> {
  concluida: boolean;
  emailsVinculados: EmailSnapshot[];
}

export interface ExpedienteCatalogSnapshot {\n  tarefas: { schemaVersion: 1; tarefas: Tarefa[] };\n  perfis: { schemaVersion: 1; perfis: Perfil[] };\n  email: { schemaVersion: 1; emails: Email[]; emailsGlobais: string[] };\n  layout: { ordemPerfis: string[]; ordemTarefas: Record<string, string[]> };\n}\n\nexport interface EstadoAtual {
  id: string;
  data: string;
  perfil: Pick<Perfil, "id" | "nome">;
  tarefas: TarefaSnapshot[];
  emailsGlobais: EmailSnapshot[];
  observacao: string;
  criadoEm: string;
  ultimaAlteracao: string;
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
