export interface Tarefa {
    id: string;
    nome: string;
    link: string;
    criacao: string;
    roteiro: Roteiro;
    emailsVinculados: string[];
    ativo: boolean;
}
export interface Roteiro {
    linhas: number;
    colunas: number;
    largurasColunas: number[];
    celulas: Record<string, Celula>;
    mesclas: Array<{
        inicio: string;
        fim: string;
    }>;
    filtro: {
        linhaInicial: number;
        linhaFinal: number;
    } | null;
}
export interface Celula {
    valor?: string;
    formatacao?: Record<string, unknown>;
}
export interface Perfil {
    id: string;
    nome: string;
    tarefas: string[];
    ativo: boolean;
}
export interface Email {
    id: string;
    nome: string;
    titulo: string;
    corpo: string;
    ativo: boolean;
}
export interface CalendarioData {
    data: string;
    folga: boolean;
    feriado: boolean;
}
