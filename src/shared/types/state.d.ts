import type { Email, Perfil, Tarefa } from "./domain";
export interface EmailSnapshot extends Email {
    concluido: boolean;
}
export interface TarefaSnapshot extends Omit<Tarefa, "emailsVinculados"> {
    concluida: boolean;
    emailsVinculados: EmailSnapshot[];
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
