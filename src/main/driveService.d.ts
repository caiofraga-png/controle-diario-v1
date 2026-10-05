import { GoogleAuthManager } from "./googleAuth";
export declare const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export declare const STRUCTURE: {
    readonly config: "CONFIGURAÇÃO";
    readonly history: "HISTÓRICO";
    readonly system: "SISTEMA";
};
export declare const CONFIG_FILES: readonly ["tarefas.json", "perfis.json", "email.json", "layout.json"];
export type DriveMeta = {
    id: string;
    name: string;
    modifiedTime?: string;
    md5Checksum?: string;
    version?: string;
};
type DriveFileRecord = {
    id?: string | null;
    name?: string | null;
    mimeType?: string | null;
    trashed?: boolean | null;
    modifiedTime?: string | null;
    md5Checksum?: string | null;
    version?: string | null;
    capabilities?: {
        canAddChildren?: boolean | null;
    } | null;
};
export declare class DriveService {
    private readonly auth;
    constructor(auth: GoogleAuthManager);
    private api;
    validateRoot(folderId: string): Promise<{
        id: any;
        name: any;
    }>;
    testConnection(rootId: string): Promise<boolean>;
    private childFolders;
    ensureStructure(rootId: string): Promise<Record<string, string>>;
    listChildren(parentId: string, name?: string): Promise<DriveFileRecord[]>;
    findOrCreateFolder(parentId: string, name: string): Promise<any>;
    listJsonFiles(parentId: string): Promise<DriveFileRecord[]>;
    readJson<T>(fileId: string): Promise<{
        data: T;
        meta: DriveMeta;
    }>;
    writeJson<T>(fileId: string, data: T, expected: DriveMeta): Promise<void>;
    createJson<T>(parentId: string, name: string, data: T): Promise<any>;
}
export {};
