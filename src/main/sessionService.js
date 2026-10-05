import { randomUUID } from "node:crypto";
const SESSION_FILE = "sessão";
const HEARTBEAT_MS = 2 * 60 * 1000;
const EXPIRATION_MS = 5 * 60 * 1000;
export class SessionService {
    drive;
    sessionId = randomUUID();
    heartbeatTimer = null;
    rootId = "";
    constructor(drive) {
        this.drive = drive;
    }
    async read(rootId) {
        const structure = await this.drive.ensureStructure(rootId);
        const file = (await this.drive.listChildren(structure["SISTEMA"], SESSION_FILE))[0];
        if (!file?.id)
            return null;
        try {
            return (await this.drive.readJson(file.id)).data;
        }
        catch {
            return null;
        }
    }
    async write(rootId, value) {
        const structure = await this.drive.ensureStructure(rootId);
        const existing = (await this.drive.listChildren(structure["SISTEMA"], SESSION_FILE))[0];
        if (existing?.id) {
            const current = await this.drive.readJson(existing.id);
            await this.drive.writeJson(existing.id, value, current.meta);
        }
        else {
            await this.drive.createJson(structure["SISTEMA"], SESSION_FILE, value);
        }
    }
    async acquire(rootId) {
        this.rootId = rootId;
        const now = Date.now();
        const current = await this.read(rootId);
        if (current && now - Date.parse(current.heartbeatAt) < EXPIRATION_MS && current.sessionId !== this.sessionId) {
            // Taking ownership is intentional: the previous session becomes invalid immediately.
        }
        await this.write(rootId, { sessionId: this.sessionId, computerId: process.env.COMPUTERNAME || process.env.HOSTNAME || "COMPUTADOR", startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() });
        this.startHeartbeat();
        return this.sessionId;
    }
    startHeartbeat() {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => { void this.heartbeat().catch(() => undefined); }, HEARTBEAT_MS);
        this.heartbeatTimer.unref?.();
    }
    async heartbeat() {
        if (!this.rootId)
            return;
        const current = await this.read(this.rootId);
        if (!current || current.sessionId !== this.sessionId)
            throw new Error("A SESSÃO DESTE COMPUTADOR FOI INVALIDADA. NOVAS GRAVAÇÕES FORAM BLOQUEADAS.");
        await this.write(this.rootId, { ...current, heartbeatAt: new Date().toISOString() });
    }
    async assertOwner(rootId) {
        if (!this.rootId)
            await this.acquire(rootId);
        if (this.rootId !== rootId) {
            throw new Error("A PASTA RAIZ ATUAL É DIFERENTE DA SESSÃO ATIVA. A GRAVAÇÃO FOI BLOQUEADA.");
        }
        const current = await this.read(rootId);
        if (!current || current.sessionId !== this.sessionId || Date.now() - Date.parse(current.heartbeatAt) >= EXPIRATION_MS) {
            throw new Error("A SESSÃO DESTE COMPUTADOR NÃO É MAIS VÁLIDA. A GRAVAÇÃO FOI BLOQUEADA.");
        }
    }
    stop() { if (this.heartbeatTimer)
        clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
}
