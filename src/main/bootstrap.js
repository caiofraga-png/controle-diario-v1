import { app } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const file = () => join(app.getPath("userData"), "bootstrap.json");
export async function loadBootstrap() {
    if (!existsSync(file()))
        return { drive: { pastaRaizId: "" } };
    return JSON.parse(await readFile(file(), "utf8"));
}
export async function saveBootstrap(config) {
    await writeFile(file(), JSON.stringify(config, null, 2), "utf8");
}
