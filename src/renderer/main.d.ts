import "./styles.css";
interface Bridge {
    sistema: {
        status: () => Promise<any>;
        autorizarGoogle: () => Promise<any>;
        definirPastaRaiz: (id: string) => Promise<any>;
        selecionarPasta: () => Promise<any>;
        testarConexao: () => Promise<boolean>;
    };
    tarefas: {
        iniciar: (p: {
            data: string;
            perfilId: string;
        }) => Promise<any>;
        trocarPerfil: (perfilId: string) => Promise<any>;
        marcar: (p: {
            tipo: "tarefa" | "email";
            id: string;
            concluido: boolean;
        }) => Promise<any>;
        observacao: (v: string) => Promise<any>;
        concluir: () => Promise<any>;
        abandonar: () => Promise<any>;
    };
    dados: {
        carregar: () => Promise<any>;
        salvarCalendario: (calendario: unknown) => Promise<any>;
    };
    calendario: {
        mes: (p: {
            year: number;
            month: number;
        }) => Promise<any>;
        salvarData: (p: {
            data: string;
            folga: boolean;
            feriado: boolean;
        }) => Promise<any>;
    };
    config: {
        salvar: (config: unknown) => Promise<any>;
        novaTarefa: (input: {
            nome: string;
            link: string;
            criacao: string;
        }) => Promise<any>;
        novoPerfil: (input: {
            nome: string;
            tarefas: string[];
        }) => Promise<any>;
        novoEmail: (input: {
            nome: string;
            titulo: string;
            corpo: string;
            global?: boolean;
        }) => Promise<any>;
    };
    historico: {
        versoes: (date: string) => Promise<any>;
        ler: (p: {
            date: string;
            versao: number;
        }) => Promise<any>;
        errata: (p: {
            source: unknown;
            edited: unknown;
        }) => Promise<any>;
    };
}
declare global {
    interface Window {
        controleDiario: Bridge;
    }
}
export {};
