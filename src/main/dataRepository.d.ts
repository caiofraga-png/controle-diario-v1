import type { CalendarioData, Email, Perfil, Tarefa } from "../shared/types/domain";
import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { DriveService } from "./driveService";
export interface LayoutConfig {
    schemaVersion: 1;
    blocos: string[];
    ordemPerfis: string[];
    ordemTarefas: Record<string, string[]>;
    abas: string[];
    painelLateral: {
        largura: number;
    };
    expansaoLateral?: {
        posicao: "esquerda" | "direita";
    };
    criacaoRoteiro?: {
        modo: "POPUP" | "EXPANSÃO";
    };
}
export interface Configuracao {
    tarefas: {
        schemaVersion: 1;
        tarefas: Tarefa[];
    };
    perfis: {
        schemaVersion: 1;
        perfis: Perfil[];
    };
    email: {
        schemaVersion: 1;
        emails: Email[];
        emailsGlobais: string[];
    };
    layout: LayoutConfig;
}
export interface LoadedData {
    configuracao: Configuracao;
    calendario: {
        schemaVersion: 1;
        datas: CalendarioData[];
    };
    estado: EstadoAtual | null;
}
export declare function validateTarefas(value: unknown): Configuracao["tarefas"];
export declare function validatePerfis(value: unknown): Configuracao["perfis"];
export declare function validateEmails(value: unknown): Configuracao["email"];
export declare function validateLayout(value: unknown): LayoutConfig;
export declare class DataRepository {
    private readonly drive;
    private readonly meta;
    private structureCache;
    constructor(drive: DriveService);
    private structure;
    private findSingle;
    private readNamed;
    private writeNamed;
    load(rootId: string): Promise<LoadedData>;
    saveConfiguration(rootId: string, kind: "tarefas" | "perfis" | "email" | "layout", value: unknown): Promise<LayoutConfig | {
        schemaVersion: 1;
        tarefas: Tarefa[];
    } | {
        schemaVersion: 1;
        perfis: Perfil[];
    } | {
        schemaVersion: 1;
        emails: Email[];
        emailsGlobais: string[];
    }>;
    saveConfigurationBundle(rootId: string, config: Configuracao): Promise<Configuracao>;
    saveCurrentState(rootId: string, estado: EstadoAtual | null): Promise<void>;
    saveCalendar(rootId: string, calendario: LoadedData["calendario"]): Promise<void>;
    completeState(rootId: string, state: EstadoAtual, concluidoEm: string): Promise<RegistroHistorico>;
    progress(state: EstadoAtual): {
        done: number;
        total: number;
        percentage: number;
    };
    createHistory(rootId: string, registro: RegistroHistorico): Promise<any>;
}
