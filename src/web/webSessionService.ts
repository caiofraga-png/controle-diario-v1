import { DriveService } from "./webDriveService";
const SESSION_FILE="sessão"; const HEARTBEAT_MS=2*60*1000; const EXPIRATION_MS=5*60*1000; const COMPUTER_KEY="controle-diario.browser.id";
type SessionRecord={sessionId:string;computerId:string;startedAt:string;heartbeatAt:string};
export class WebSessionService{
 private readonly sessionId=crypto.randomUUID(); private heartbeatTimer:number|null=null; private rootId="";
 private computerId(){let id=localStorage.getItem(COMPUTER_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(COMPUTER_KEY,id);}return id;}
 private async read(rootId:string){const s=await this.drive.ensureStructure(rootId);const file=(await this.drive.listChildren(s["SISTEMA"],SESSION_FILE))[0];if(!file?.id)return null;try{return (await this.drive.readJson<SessionRecord>(file.id)).data;}catch{return null;}}
 private async write(rootId:string,value:SessionRecord){const s=await this.drive.ensureStructure(rootId);const existing=(await this.drive.listChildren(s["SISTEMA"],SESSION_FILE))[0];if(existing?.id){const current=await this.drive.readJson<SessionRecord>(existing.id);await this.drive.writeJson(existing.id,value,current.meta);}else await this.drive.createJson(s["SISTEMA"],SESSION_FILE,value);}
 async acquire(rootId:string){this.rootId=rootId;await this.write(rootId,{sessionId:this.sessionId,computerId:this.computerId(),startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString()});this.startHeartbeat();return this.sessionId;}
 private startHeartbeat(){if(this.heartbeatTimer!==null)window.clearInterval(this.heartbeatTimer);this.heartbeatTimer=window.setInterval(()=>void this.heartbeat().catch(()=>undefined),HEARTBEAT_MS);}
 async heartbeat(){if(!this.rootId)return;const current=await this.read(this.rootId);if(!current||current.sessionId!==this.sessionId)throw new Error("A SESSÃO DESTE NAVEGADOR FOI INVALIDADA. NOVAS GRAVAÇÕES FORAM BLOQUEADAS.");await this.write(this.rootId,{...current,heartbeatAt:new Date().toISOString()});}
 async assertOwner(rootId:string){if(!this.rootId)await this.acquire(rootId);if(this.rootId!==rootId)throw new Error("A PASTA RAIZ ATUAL É DIFERENTE DA SESSÃO ATIVA. A GRAVAÇÃO FOI BLOQUEADA.");const current=await this.read(rootId);if(!current||current.sessionId!==this.sessionId||Date.now()-Date.parse(current.heartbeatAt)>=EXPIRATION_MS)throw new Error("A SESSÃO DESTE NAVEGADOR NÃO É MAIS VÁLIDA. A GRAVAÇÃO FOI BLOQUEADA.");}
 stop(){if(this.heartbeatTimer!==null)window.clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}
 constructor(private readonly drive:DriveService){}
}
