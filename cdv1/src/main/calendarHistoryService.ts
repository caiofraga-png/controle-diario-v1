import type { CalendarioData } from "../shared/types/domain";
import type { RegistroHistorico, TarefaSnapshot, EmailSnapshot } from "../shared/types/state";
import { DriveService, STRUCTURE } from "./driveService";
import type { LoadedData } from "./dataRepository";

const MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const monthFolder = (date: string) => `${date.slice(5, 7)} - ${MONTHS[Math.max(0, Number(date.slice(5, 7)) - 1)] ?? date.slice(5, 7)}`;
const yearFolder = (date: string) => date.slice(0, 4);
const versionName = (n: number) => `R${String(n).padStart(3, "0")}.json`;

export interface HistoryVersionSummary { versao: number; nome: string; modifiedTime?: string; }

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

export class CalendarHistoryService {
  constructor(private readonly drive: DriveService) {}

  private async historyFolder(rootId: string, date: string, create = false) {
    const structure = await this.drive.ensureStructure(rootId);
    const year = create ? await this.drive.findOrCreateFolder(structure[STRUCTURE.history], yearFolder(date)) : (await this.drive.listChildren(structure[STRUCTURE.history], yearFolder(date))).find(x => x.mimeType === "application/vnd.google-apps.folder")?.id;
    if (!year) return null;
    const month = create ? await this.drive.findOrCreateFolder(year, monthFolder(date)) : (await this.drive.listChildren(year, monthFolder(date))).find(x => x.mimeType === "application/vnd.google-apps.folder")?.id;
    if (!month) return null;
    return month;
  }

  async month(rootId: string, year: number, month: number) {
    const datePrefix = `${year}-${String(month).padStart(2, "0")}`;
    const monthId = await this.historyFolder(rootId, `${datePrefix}-01`, false);
    const completedDates = new Set<string>();
    if (monthId) {
      const children = await this.drive.listChildren(monthId);
      for (const item of children) if (item.mimeType === "application/vnd.google-apps.folder" && /^\d{4}-\d{2}-\d{2}$/.test(item.name ?? "")) completedDates.add(item.name!);
    }
    const structure = await this.drive.ensureStructure(rootId);
    const calendarFile = (await this.drive.listChildren(structure[STRUCTURE.system], "calendario.json"))[0];
    let special: CalendarioData[] = [];
    if (calendarFile?.id) {
      const loaded = await this.drive.readJson<{schemaVersion: 1; datas: CalendarioData[]}>(calendarFile.id);
      special = loaded.data.datas.filter(d => d.data.startsWith(datePrefix));
    }
    return { year, month, special, completedDates: [...completedDates] };
  }

  async versions(rootId: string, date: string): Promise<HistoryVersionSummary[]> {
    const monthId = await this.historyFolder(rootId, date, false);
    if (!monthId) return [];
    const dateFolder = (await this.drive.listChildren(monthId, date)).find(x => x.mimeType === "application/vnd.google-apps.folder")?.id;
    if (!dateFolder) return [];
    const files = await this.drive.listJsonFiles(dateFolder);
    return files.map(f => ({ versao: Number(/^R(\d{3})\.json$/.exec(f.name ?? "")?.[1] ?? 0), nome: f.name ?? "", modifiedTime: f.modifiedTime })).filter(v => v.versao > 0).sort((a,b) => a.versao-b.versao);
  }

  async readVersion(rootId: string, date: string, versao: number): Promise<RegistroHistorico> {
    const monthId = await this.historyFolder(rootId, date, false);
    if (!monthId) throw new Error("NÃO HÁ HISTÓRICO PARA ESTA DATA.");
    const dateFolder = (await this.drive.listChildren(monthId, date)).find(x => x.mimeType === "application/vnd.google-apps.folder")?.id;
    if (!dateFolder) throw new Error("NÃO HÁ HISTÓRICO PARA ESTA DATA.");
    const file = (await this.drive.listChildren(dateFolder, versionName(versao))).find(x => x.id);
    if (!file?.id) throw new Error("A VERSÃO DO HISTÓRICO NÃO FOI ENCONTRADA.");
    return (await this.drive.readJson<RegistroHistorico>(file.id)).data;
  }

  async saveErrata(rootId: string, source: RegistroHistorico, edited: Pick<RegistroHistorico, "tarefas" | "emailsGlobais" | "observacao">): Promise<RegistroHistorico> {
    if (!source?.id || source.data !== source.id.slice(0,10)) throw new Error("REGISTRO HISTÓRICO INVÁLIDO.");
    if (edited.tarefas.length !== source.tarefas.length) throw new Error("A ERRATA TENTOU ALTERAR A ESTRUTURA DAS TAREFAS.");
    const normalizeTask = (t: TarefaSnapshot) => ({ ...t, concluida: Boolean(t.concluida), emailsVinculados: t.emailsVinculados.map(e => ({ ...e, concluido: Boolean(e.concluido) })) });
    const normalizedTasks = edited.tarefas.map(normalizeTask);
    for (let i = 0; i < source.tarefas.length; i++) {
      const a = source.tarefas[i], b = normalizedTasks[i];
      if (a.id !== b.id || a.nome !== b.nome || a.link !== b.link || a.criacao !== b.criacao || JSON.stringify(a.roteiro) !== JSON.stringify(b.roteiro) || a.emailsVinculados.length !== b.emailsVinculados.length) throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
      for (let j = 0; j < a.emailsVinculados.length; j++) {
        const ae = a.emailsVinculados[j], be = b.emailsVinculados[j];
        if (ae.id !== be.id || ae.nome !== be.nome || ae.titulo !== be.titulo || ae.corpo !== be.corpo || ae.ativo !== be.ativo) throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
      }
    }
    if (edited.emailsGlobais.length !== source.emailsGlobais.length) throw new Error("A ERRATA TENTOU ALTERAR OS E-MAILS DO REGISTRO.");
    for (let i = 0; i < source.emailsGlobais.length; i++) {
      const a = source.emailsGlobais[i], b = edited.emailsGlobais[i];
      if (a.id !== b.id || a.nome !== b.nome || a.titulo !== b.titulo || a.corpo !== b.corpo || a.ativo !== b.ativo) throw new Error("A ERRATA SÓ PODE ALTERAR MARCAÇÕES E OBSERVAÇÃO.");
    }
    const byEmail = new Map<string, boolean>();
    for (let i = 0; i < source.tarefas.length; i++) {
      if (source.tarefas[i].concluida !== normalizedTasks[i].concluida) {
        for (const e of normalizedTasks[i].emailsVinculados) byEmail.set(e.id, normalizedTasks[i].concluida);
      }
    }
    for (const task of normalizedTasks) for (const email of task.emailsVinculados) if (byEmail.has(email.id)) email.concluido = byEmail.get(email.id)!;
    for (const email of edited.emailsGlobais) if (byEmail.has(email.id)) email.concluido = byEmail.get(email.id)!;
    const normalizedEdited = { tarefas: normalizedTasks, emailsGlobais: clone(edited.emailsGlobais), observacao: edited.observacao };
    const same = JSON.stringify({tarefas: source.tarefas, emailsGlobais: source.emailsGlobais, observacao: source.observacao}) === JSON.stringify(normalizedEdited);
    if (same) return source;

    const versions = await this.versions(rootId, source.data);
    const next = (versions.length ? Math.max(...versions.map(v => v.versao)) : 0) + 1;
    const registro: RegistroHistorico = {
      ...clone(source),
      id: `${source.data}-${versionName(next).replace(".json", "")}`,
      versao: next,
      tarefas: clone(normalizedTasks),
      emailsGlobais: clone(normalizedEdited.emailsGlobais),
      observacao: edited.observacao,
      ultimaAlteracao: new Date().toISOString(),
      origemVersao: versionName(source.versao).replace(".json", "")
    };
    const monthId = await this.historyFolder(rootId, source.data, true);
    if (!monthId) throw new Error("NÃO FOI POSSÍVEL ACESSAR O HISTÓRICO.");
    const dateFolder = await this.drive.findOrCreateFolder(monthId, source.data);
    await this.drive.createJson(dateFolder, versionName(next), registro);
    const verified = (await this.drive.listChildren(dateFolder, versionName(next))).find(x => x.id);
    if (!verified?.id) throw new Error("NÃO FOI POSSÍVEL CONFIRMAR A NOVA VERSÃO DO HISTÓRICO.");
    await this.drive.readJson<RegistroHistorico>(verified.id);
    return registro;
  }
}
