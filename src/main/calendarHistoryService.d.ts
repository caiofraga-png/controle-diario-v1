import type { CalendarioData } from "../shared/types/domain";
import type { RegistroHistorico } from "../shared/types/state";
import { DriveService } from "./driveService";
export interface HistoryVersionSummary {
    versao: number;
    nome: string;
    modifiedTime?: string;
}
export declare class CalendarHistoryService {
    private readonly drive;
    constructor(drive: DriveService);
    private historyFolder;
    month(rootId: string, year: number, month: number): Promise<{
        year: number;
        month: number;
        special: CalendarioData[];
        completedDates: string[];
    }>;
    versions(rootId: string, date: string): Promise<HistoryVersionSummary[]>;
    readVersion(rootId: string, date: string, versao: number): Promise<RegistroHistorico>;
    saveErrata(rootId: string, source: RegistroHistorico, edited: Pick<RegistroHistorico, "tarefas" | "emailsGlobais" | "observacao">): Promise<RegistroHistorico>;
}
