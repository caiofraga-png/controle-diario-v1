import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { GoogleAuthManager } from "./googleAuth";

const API_KEY_FILE = () => join(process.resourcesPath, "google-picker-api-key.txt");

let pickerWindow: BrowserWindow | null = null;
let pickerResolve: ((value: { id: string; name: string }) => void) | null = null;
let pickerReject: ((reason?: unknown) => void) | null = null;

async function getApiKey() {
  const candidates = [API_KEY_FILE(), join(app.getAppPath(), "google-picker-api-key.txt")];
  for (const path of candidates) {
    if (existsSync(path)) {
      const key = (await readFile(path, "utf8")).trim();
      if (key) return key;
    }
  }
  throw new Error("CHAVE DO GOOGLE PICKER NÃO CONFIGURADA.");
}

export function registerPickerIpc(auth: GoogleAuthManager) {
  ipcMain.handle("drive-picker:config", async () => ({
    accessToken: await auth.getAccessToken(),
    developerKey: await getApiKey()
  }));

  ipcMain.on("drive-picker:complete", (_event, result: { id?: string; name?: string }) => {
    if (!pickerResolve || !result?.id) return;
    const resolve = pickerResolve;
    cleanupPicker();
    resolve({ id: result.id, name: result.name ?? "" });
  });

  ipcMain.on("drive-picker:cancel", () => {
    if (!pickerReject) return;
    const reject = pickerReject;
    cleanupPicker();
    reject(new Error("SELEÇÃO DA PASTA CANCELADA."));
  });
}

function cleanupPicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
  pickerWindow = null;
  pickerResolve = null;
  pickerReject = null;
}

export function openFolderPicker(): Promise<{ id: string; name: string }> {
  if (pickerWindow) return Promise.reject(new Error("A SELEÇÃO DE PASTA JÁ ESTÁ ABERTA."));
  return new Promise((resolve, reject) => {
    pickerResolve = resolve;
    pickerReject = reject;
    pickerWindow = new BrowserWindow({
      width: 920,
      height: 680,
      minWidth: 720,
      minHeight: 560,
      parent: BrowserWindow.getFocusedWindow() ?? undefined,
      modal: true,
      title: "Selecionar pasta do Google Drive",
      webPreferences: {
        preload: join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    pickerWindow.on("closed", () => {
      if (pickerReject) pickerReject(new Error("SELEÇÃO DA PASTA CANCELADA."));
      pickerWindow = null;
      pickerResolve = null;
      pickerReject = null;
    });
    pickerWindow.loadFile(join(__dirname, "../renderer/picker.html"));
  });
}
