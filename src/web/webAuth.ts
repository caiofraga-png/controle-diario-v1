export type GoogleClientConfig = { client_id: string };
export type AuthStatus = { authenticated: boolean; email?: string };

type TokenResponse = { access_token: string; expires_in: number; scope?: string; token_type?: string };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (options:any)=>any } } };

const SCOPES = "https://www.googleapis.com/auth/drive openid email";
const TOKEN_KEY = "controle-diario.google.token";
const EMAIL_KEY = "controle-diario.google.email";
const ROOT_KEY = "controle-diario.root.id";
const CLIENT_ID = () => ((globalThis as any).__CONTROLE_DIARIO_CONFIG__?.googleClientId ?? "").trim();

function identity(): GoogleIdentity {
  const g=(globalThis as any).google as GoogleIdentity|undefined;
  if(!g?.accounts?.oauth2) throw new Error("O SERVIÇO DE IDENTIDADE DO GOOGLE AINDA NÃO FOI CARREGADO.");
  return g;
}

export class WebGoogleAuth {
  private accessToken = sessionStorage.getItem(TOKEN_KEY) ?? "";
  private expiresAt = Number(sessionStorage.getItem(`${TOKEN_KEY}.expires`) ?? 0);
  get rootId(){ return localStorage.getItem(ROOT_KEY) ?? ""; }
  set rootId(v:string){ if(v) localStorage.setItem(ROOT_KEY,v); else localStorage.removeItem(ROOT_KEY); }
  get email(){ return sessionStorage.getItem(EMAIL_KEY) ?? ""; }
  private setToken(r:TokenResponse){ this.accessToken=r.access_token; this.expiresAt=Date.now()+Math.max(0,r.expires_in-60)*1000; sessionStorage.setItem(TOKEN_KEY,r.access_token); sessionStorage.setItem(`${TOKEN_KEY}.expires`,String(this.expiresAt)); }
  async getStatus():Promise<AuthStatus>{
    if(!this.accessToken || Date.now()>=this.expiresAt) return {authenticated:false,email:this.email||undefined};
    try { const r=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${this.accessToken}`}}); if(!r.ok) return {authenticated:false}; const u=await r.json() as {email?:string}; if(u.email) sessionStorage.setItem(EMAIL_KEY,u.email); return {authenticated:true,email:(u.email ?? this.email) || undefined}; } catch { return {authenticated:false}; }
  }
  async getAccessToken():Promise<string>{ if(this.accessToken && Date.now()<this.expiresAt) return this.accessToken; throw new Error("AUTORIZAÇÃO DO GOOGLE NECESSÁRIA."); }
  async authorize():Promise<AuthStatus>{
    const clientId=CLIENT_ID(); if(!clientId) throw new Error("CLIENT ID DO GOOGLE NÃO CONFIGURADO. Configure public/config.js.");
    return new Promise((resolve,reject)=>{
      const client=identity().accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPES,callback:async (response:TokenResponse)=>{
        if(!response?.access_token){reject(new Error("NÃO FOI POSSÍVEL AUTORIZAR O GOOGLE."));return;}
        try{this.setToken(response);const status=await this.getStatus();resolve(status);}catch(e){reject(e);}
      }});
      try{client.requestAccessToken({prompt:""});}catch(e){reject(e);}
    });
  }
  disconnect(){this.accessToken="";this.expiresAt=0;sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(`${TOKEN_KEY}.expires`);sessionStorage.removeItem(EMAIL_KEY);}
}

export function loadBootstrap(){ return {drive:{pastaRaizId:localStorage.getItem(ROOT_KEY)??"",contaEmail:sessionStorage.getItem(EMAIL_KEY)??undefined}}; }
export function saveBootstrap(config:{drive:{pastaRaizId:string;contaEmail?:string}}){ if(config.drive.pastaRaizId)localStorage.setItem(ROOT_KEY,config.drive.pastaRaizId); else localStorage.removeItem(ROOT_KEY); if(config.drive.contaEmail)sessionStorage.setItem(EMAIL_KEY,config.drive.contaEmail); }
