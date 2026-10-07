export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const STRUCTURE = { config: "CONFIGURAÇÃO", history: "HISTÓRICO", system: "SISTEMA" } as const;
export const CONFIG_FILES = ["tarefas.json", "perfis.json", "email.json", "layout.json"] as const;

export type DriveMeta = { id: string; name: string; modifiedTime?: string; md5Checksum?: string; version?: string };
type DriveFileRecord = { id?: string | null; name?: string | null; mimeType?: string | null; trashed?: boolean | null; modifiedTime?: string | null; md5Checksum?: string | null; version?: string | null; capabilities?: { canAddChildren?: boolean | null } | null };
type DriveFileList = { files?: DriveFileRecord[] | null };

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export class DriveService {
  constructor(private readonly auth: { getAccessToken(): Promise<string> }) {}
  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.auth.getAccessToken();
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!response.ok) {
      let message = `GOOGLE DRIVE RETORNOU HTTP ${response.status}.`;
      try { const body = await response.json(); if (body?.error?.message) message = body.error.message; } catch { /* ignore */ }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
  async validateRoot(folderId: string) {
    const f = await this.request<DriveFileRecord>(`${API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)`);
    if (!f.id || f.mimeType !== DRIVE_FOLDER_MIME || f.trashed) throw new Error("A PASTA RAIZ INFORMADA NÃO É VÁLIDA.");
    if (f.capabilities?.canAddChildren === false) throw new Error("SEM PERMISSÃO PARA GRAVAR NA PASTA RAIZ.");
    return { id: f.id, name: f.name ?? "" };
  }
  async testConnection(rootId: string) {
    await this.validateRoot(rootId);
    const id = await this.createJson(rootId, `.controle-diario-write-test-${Date.now()}.json`, { teste: true });
    await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  }
  private async list(parentId: string, qExtra = "", fields = "files(id,name,mimeType,modifiedTime,md5Checksum,version)") {
    const q = `'${parentId}' in parents and trashed=false${qExtra}`;
    const data = await this.request<DriveFileList>(`${API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=${encodeURIComponent(fields)}`);
    return data.files ?? [];
  }
  private async childFolders(parentId: string) { return this.list(parentId, ` and mimeType='${DRIVE_FOLDER_MIME}'`, "files(id,name,mimeType,trashed,capabilities(canAddChildren))"); }
  async ensureStructure(rootId: string) {
    await this.validateRoot(rootId);
    const folders = await this.childFolders(rootId); const out: Record<string,string> = {};
    for (const name of Object.values(STRUCTURE)) {
      const matches = folders.filter(f => f.name === name);
      if (matches.length > 1) throw new Error(`HÁ MAIS DE UMA PASTA "${name}" NA PASTA RAIZ.`);
      if (matches[0]?.id) out[name] = matches[0].id;
      else {
        const created = await this.request<{id?:string}>(`${API}/files?fields=id`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name,parents:[rootId],mimeType:DRIVE_FOLDER_MIME}) });
        if (!created.id) throw new Error(`NÃO FOI POSSÍVEL CRIAR A PASTA ${name}.`); out[name]=created.id;
      }
    }
    return out;
  }
  async listChildren(parentId: string, name?: string) {
    const clause = name ? ` and name='${name.replace(/\\/g,"\\\\").replace(/'/g,"\\'")}'` : "";
    return this.list(parentId, clause);
  }
  async findOrCreateFolder(parentId: string, name: string) {
    const matches = (await this.listChildren(parentId,name)).filter(f=>f.mimeType===DRIVE_FOLDER_MIME);
    if (matches.length>1) throw new Error(`HÁ MAIS DE UMA PASTA "${name}" NO HISTÓRICO.`);
    if (matches[0]?.id) return matches[0].id;
    const created = await this.request<{id?:string}>(`${API}/files?fields=id`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,parents:[parentId],mimeType:DRIVE_FOLDER_MIME})});
    if (!created.id) throw new Error(`NÃO FOI POSSÍVEL CRIAR A PASTA ${name}.`); return created.id;
  }
  async listJsonFiles(parentId: string) { return this.list(parentId, " and mimeType='application/json'"); }
  async readJson<T>(fileId:string):Promise<{data:T;meta:DriveMeta}> {
    const meta=await this.request<DriveFileRecord>(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,md5Checksum,version`);
    const data=await this.request<T>(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
    return {data,meta:{id:meta.id??"",name:meta.name??"",modifiedTime:meta.modifiedTime??undefined,md5Checksum:meta.md5Checksum??undefined,version:meta.version??undefined}};
  }
  async writeJson<T>(fileId:string,data:T,expected:DriveMeta) {
    const current=await this.request<DriveFileRecord>(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,md5Checksum,version`);
    if(current.modifiedTime!==expected.modifiedTime || current.md5Checksum!==expected.md5Checksum) throw new Error("O ARQUIVO FOI ALTERADO FORA DO CONTROLE DIÁRIO. A GRAVAÇÃO FOI BLOQUEADA.");
    await this.request(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  }
  async createJson<T>(parentId:string,name:string,data:T) {
    const existing=await this.listChildren(parentId,name); if(existing.length) throw new Error(`O ARQUIVO ${name} JÁ EXISTE.`);
    const created=await this.request<{id?:string}>(`${API}/files?fields=id`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,parents:[parentId],mimeType:"application/json"})});
    if(!created.id) throw new Error(`NÃO FOI POSSÍVEL CRIAR ${name}.`);
    await this.request(`${UPLOAD}/files/${encodeURIComponent(created.id)}?uploadType=media`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    return created.id;
  }
}
