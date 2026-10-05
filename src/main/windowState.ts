import { app } from "electron";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type WindowState = { x?: number; y?: number; width: number; height: number; isMaximized: boolean };
const file = () => join(app.getPath("userData"), "window-state.json");
const defaults: WindowState = { width: 1280, height: 820, isMaximized: false };

export async function loadWindowState(): Promise<WindowState> {
  if (!existsSync(file())) return defaults;
  try { return { ...defaults, ...JSON.parse(await readFile(file(), "utf8")) }; } catch { return defaults; }
}
export async function saveWindowState(state: WindowState) { await writeFile(file(), JSON.stringify(state, null, 2), "utf8"); }
