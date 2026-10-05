import { app, safeStorage, shell } from "electron";
import { OAuth2Client } from "google-auth-library";
import { createServer, randomBytes } from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const TOKEN_FILE = () => join(app.getPath("userData"), "google-auth.dat");
const CLIENT_FILE = () => join(process.resourcesPath, "google-oauth-client.json");

export type GoogleClientConfig = { client_id: string; client_secret?: string };
export type AuthStatus = { authenticated: boolean; email?: string };

type StoredCredentials = Record<string, unknown>;

async function clientConfig(): Promise<GoogleClientConfig> {
  const candidates = [CLIENT_FILE(), join(app.getAppPath(), "google-oauth-client.json")];
  for (const path of candidates) {
    if (existsSync(path)) return JSON.parse(await readFile(path, "utf8"));
  }
  throw new Error("CREDENCIAIS DO GOOGLE NÃO CONFIGURADAS.");
}

async function saveCredentials(credentials: StoredCredentials) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("NÃO FOI POSSÍVEL PROTEGER A AUTORIZAÇÃO NESTE COMPUTADOR.");
  const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
  await writeFile(TOKEN_FILE(), encrypted);
}

async function loadCredentials(): Promise<StoredCredentials | null> {
  if (!existsSync(TOKEN_FILE())) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = await readFile(TOKEN_FILE());
  return JSON.parse(safeStorage.decryptString(encrypted));
}

async function userEmail(accessToken: string): Promise<string | undefined> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return undefined;
  const data = await response.json() as { email?: string };
  return data.email;
}

export class GoogleAuthManager {
  private oauth: OAuth2Client | null = null;

  async getStatus(): Promise<AuthStatus> {
    const credentials = await loadCredentials();
    if (!credentials?.access_token) return { authenticated: false };
    const config = await clientConfig();
    this.oauth = new OAuth2Client(config.client_id, config.client_secret);
    this.oauth.setCredentials(credentials as any);
    try {
      const token = await this.oauth.getAccessToken();
      if (!token.token) return { authenticated: false };
      return { authenticated: true, email: await userEmail(token.token) };
    } catch {
      return { authenticated: false };
    }
  }

  async getAccessToken(): Promise<string> {
    const client = await this.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error("AUTORIZAÇÃO DO GOOGLE NECESSÁRIA.");
    return token.token;
  }

  async getClient(): Promise<OAuth2Client> {
    const credentials = await loadCredentials();
    if (!credentials?.refresh_token) throw new Error("AUTORIZAÇÃO DO GOOGLE NECESSÁRIA.");
    const config = await clientConfig();
    this.oauth = new OAuth2Client(config.client_id, config.client_secret);
    this.oauth.setCredentials(credentials as any);
    await this.oauth.getAccessToken();
    return this.oauth;
  }

  async authorize(): Promise<AuthStatus> {
    const config = await clientConfig();
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve((server.address() as any).port));
    });
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauth = new OAuth2Client(config.client_id, config.client_secret, redirectUri);
    const state = randomBytes(32).toString("hex");

    const codePromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("TEMPO DE AUTORIZAÇÃO ESGOTADO.")), 5 * 60_000);
      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/oauth2callback") return;
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("Autorização inválida. Você pode fechar esta janela.");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          clearTimeout(timeout);
          reject(new Error("AUTORIZAÇÃO DO GOOGLE CANCELADA."));
        } else {
          const code = url.searchParams.get("code");
          if (!code) reject(new Error("NÃO FOI POSSÍVEL CONCLUIR A AUTORIZAÇÃO."));
          else resolve(code);
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><p>Autorização concluída. Você pode fechar esta janela.</p></body></html>");
      });
    });

    try {
      const authUrl = oauth.generateAuthUrl({ access_type: "offline", scope: SCOPES, state, prompt: "consent", include_granted_scopes: true });
      await shell.openExternal(authUrl);
      const code = await codePromise;
      const { tokens } = await oauth.getToken(code);
      if (!tokens.refresh_token) throw new Error("O GOOGLE NÃO RETORNOU UMA AUTORIZAÇÃO PERSISTENTE.");
      await saveCredentials(tokens as any);
      this.oauth = oauth;
      const token = tokens.access_token;
      return { authenticated: true, email: token ? await userEmail(token) : undefined };
    } finally {
      server.close();
    }
  }

  async disconnect() {
    if (existsSync(TOKEN_FILE())) await unlink(TOKEN_FILE());
    this.oauth = null;
  }
}
