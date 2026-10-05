import { app } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type BootstrapConfig = { drive: { pastaRaizId: string; contaEmail?: string } };
const file = () => join(app.getPath("userData"), "bootstrap.json");

export async function loadBootstrap(): Promise<BootstrapConfig> {
  if (!existsSync(file())) return { drive: { pastaRaizId: "" } };
  return JSON.parse(await readFile(file(), "utf8"));
}
export async function saveBootstrap(config: BootstrapConfig) {
  await writeFile(file(), JSON.stringify(config, null, 2), "utf8");
}
