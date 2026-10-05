import { google } from "googleapis";
import { Readable } from "node:stream";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const STRUCTURE = { config: "CONFIGURAÇÃO", history: "HISTÓRICO", system: "SISTEMA" };
export const CONFIG_FILES = ["tarefas.json", "perfis.json", "email.json", "layout.json"];
export class DriveService {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    async api() {
        return google.drive({ version: "v3", auth: await this.auth.getClient() });
    }
    async validateRoot(folderId) {
        const drive = await this.api();
        const result = await drive.files.get({ fileId: folderId, fields: "id,name,mimeType,trashed,capabilities(canAddChildren)" });
        const f = result.data;
        if (!f.id || f.mimeType !== DRIVE_FOLDER_MIME || f.trashed)
            throw new Error("A PASTA RAIZ INFORMADA NÃO É VÁLIDA.");
        if (f.capabilities?.canAddChildren === false)
            throw new Error("SEM PERMISSÃO PARA GRAVAR NA PASTA RAIZ.");
        return { id: f.id, name: f.name ?? "" };
    }
    async testConnection(rootId) {
        await this.validateRoot(rootId);
        const drive = await this.api();
        const name = `.controle-diario-write-test-${Date.now()}.json`;
        const created = await drive.files.create({
            requestBody: { name, parents: [rootId], mimeType: "application/json" },
            media: { mimeType: "application/json", body: Readable.from([Buffer.from('{"teste":true}', "utf8")]) },
            fields: "id"
        });
        if (!created.data.id)
            throw new Error("NÃO FOI POSSÍVEL CONFIRMAR A GRAVAÇÃO.");
        await drive.files.get({ fileId: created.data.id, fields: "id,name" });
        await drive.files.delete({ fileId: created.data.id });
        return true;
    }
    async childFolders(parentId) {
        const drive = await this.api();
        const res = await drive.files.list({ q: `'${parentId}' in parents and trashed=false and mimeType='${DRIVE_FOLDER_MIME}'`, fields: "files(id,name)" });
        return res.data.files ?? [];
    }
    async ensureStructure(rootId) {
        await this.validateRoot(rootId);
        const drive = await this.api();
        const folders = await this.childFolders(rootId);
        const out = {};
        for (const name of Object.values(STRUCTURE)) {
            const matches = folders.filter(f => f.name === name);
            if (matches.length > 1)
                throw new Error(`HÁ MAIS DE UMA PASTA "${name}" NA PASTA RAIZ.`);
            if (matches[0]?.id)
                out[name] = matches[0].id;
            else {
                const created = await drive.files.create({ requestBody: { name, parents: [rootId], mimeType: DRIVE_FOLDER_MIME }, fields: "id" });
                if (!created.data.id)
                    throw new Error(`NÃO FOI POSSÍVEL CRIAR A PASTA ${name}.`);
                out[name] = created.data.id;
            }
        }
        return out;
    }
    async listChildren(parentId, name) {
        const drive = await this.api();
        const escaped = name ? name.replace(/\\/g, "\\\\").replace(/'/g, "\\'") : null;
        const nameClause = escaped ? ` and name='${escaped}'` : "";
        const res = await drive.files.list({ q: `'${parentId}' in parents and trashed=false${nameClause}`, fields: "files(id,name,mimeType,modifiedTime,md5Checksum,version)" });
        return res.data.files ?? [];
    }
    async findOrCreateFolder(parentId, name) {
        const matches = await this.listChildren(parentId, name);
        const folders = matches.filter(f => f.mimeType === DRIVE_FOLDER_MIME);
        if (folders.length > 1)
            throw new Error(`HÁ MAIS DE UMA PASTA "${name}" NO HISTÓRICO.`);
        if (folders[0]?.id)
            return folders[0].id;
        const drive = await this.api();
        const created = await drive.files.create({ requestBody: { name, parents: [parentId], mimeType: DRIVE_FOLDER_MIME }, fields: "id" });
        if (!created.data.id)
            throw new Error(`NÃO FOI POSSÍVEL CRIAR A PASTA ${name}.`);
        return created.data.id;
    }
    async listJsonFiles(parentId) {
        const drive = await this.api();
        const res = await drive.files.list({ q: `'${parentId}' in parents and trashed=false and mimeType='application/json'`, fields: "files(id,name,modifiedTime,md5Checksum,version)" });
        return res.data.files ?? [];
    }
    async readJson(fileId) {
        const drive = await this.api();
        const meta = await drive.files.get({ fileId, fields: "id,name,modifiedTime,md5Checksum,version" });
        const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
        return { data: JSON.parse(response.data), meta: {
                id: meta.data.id ?? "",
                name: meta.data.name ?? "",
                modifiedTime: meta.data.modifiedTime ?? undefined,
                md5Checksum: meta.data.md5Checksum ?? undefined,
                version: meta.data.version ?? undefined
            } };
    }
    async writeJson(fileId, data, expected) {
        const drive = await this.api();
        const current = await drive.files.get({ fileId, fields: "id,name,modifiedTime,md5Checksum,version" });
        const c = current.data;
        if (c.modifiedTime !== expected.modifiedTime || c.md5Checksum !== expected.md5Checksum)
            throw new Error("O ARQUIVO FOI ALTERADO FORA DO CONTROLE DIÁRIO. A GRAVAÇÃO FOI BLOQUEADA.");
        await drive.files.update({ fileId, media: { mimeType: "application/json", body: Readable.from([Buffer.from(JSON.stringify(data, null, 2), "utf8")]) } });
    }
    async createJson(parentId, name, data) {
        const drive = await this.api();
        const existing = await drive.files.list({ q: `'${parentId}' in parents and trashed=false and name='${name.replace(/'/g, "\\'")}'`, fields: "files(id,name)" });
        if ((existing.data.files ?? []).length)
            throw new Error(`O ARQUIVO ${name} JÁ EXISTE.`);
        const created = await drive.files.create({ requestBody: { name, parents: [parentId], mimeType: "application/json" }, media: { mimeType: "application/json", body: Readable.from([Buffer.from(JSON.stringify(data, null, 2), "utf8")]) }, fields: "id" });
        if (!created.data.id)
            throw new Error(`NÃO FOI POSSÍVEL CRIAR ${name}.`);
        return created.data.id;
    }
}
