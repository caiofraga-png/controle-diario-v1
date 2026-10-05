import type { Perfil } from "../shared/types/domain";
import type { EmailSnapshot, EstadoAtual } from "../shared/types/state";
import type { LoadedData } from "./dataRepository";
export declare function buildTaskOrder(profile: Perfil | null, config: LoadedData["configuracao"]): string[];
export declare function availableProfiles(config: LoadedData["configuracao"]): Perfil[];
export declare function findProfile(config: LoadedData["configuracao"], profileId: string): Perfil | null;
export declare function buildState(data: LoadedData, date: string, profileId: string): EstadoAtual;
export declare function uniqueEmailSnapshots(state: EstadoAtual): EmailSnapshot[];
export declare function obligationProgress(state: EstadoAtual): {
    done: number;
    total: number;
    percentage: number;
};
export declare function toggleTask(state: EstadoAtual, taskId: string, checked: boolean): EstadoAtual;
export declare function toggleEmail(state: EstadoAtual, emailId: string, checked: boolean): EstadoAtual;
export declare function setObservation(state: EstadoAtual, value: string): EstadoAtual;
export declare function hasObligations(state: EstadoAtual): boolean;
