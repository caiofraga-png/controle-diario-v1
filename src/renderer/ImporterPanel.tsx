import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type SourceFile = { name: string; sheetName: string; headers: string[]; rows: unknown[][]; hash: string };
type SheetInfo = { sheetId: number; title: string; hidden: boolean };
const MAP: Record<string, string> = {
  "TICKET": "TICKET",
  "NOME CLIENTE": "NOME_CLIENTE",
  "SUBTIPO": "SUBTIPO",
  "FILA ORIGINAL": "FILA_ORIGINAL",
  "FILA ATUAL": "FILA_ATUAL",
  "TIPO_ESTADO": "TIPO_ESTADO",
  "CIDADE": "CIDADE",
  "DATA ABERTURA TICKET": "TICKET_DATA_ABERTURA",
  "DATA ULTIMA TRANSF.": "ULTIMA_TRANFERENCIA_DATA",
  "DATA ENCERRAMENTO": "ENCERRAMENTO_DATA",
  "RESOLUÇÃO": "resolucao_tipo",
  "RECEBIDO POR": "ATENDENTE",
  "ULTIMA TRANSF. ATENDENTE": "ULTIMA_TRANFERENCIA_ATENDENTE",
  "FECHADO POR": "CLOSEDBY"
};
const PROTECTED = new Set(["ABERTO E FECHADO NO MESMO DIA", "SETOR", "RESOLVIDO?", "ALL", "DATA"]);
const norm = (value: unknown) => String(value ?? "").trim().toLocaleUpperCase("pt-BR");
async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export default function ImporterPanel() {
  const [file, setFile] = useState<SourceFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("1608bZtMCXHSbXDzYVIq-X454ZDDOpCUa4TdkHWZT5wM");
  const [spreadsheetTitle, setSpreadsheetTitle] = useState("");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [targetSheet, setTargetSheet] = useState("");
  const [destination, setDestination] = useState<any>(null);
  const mapping = useMemo(() => {
    if (!file) return [];
    const source = new Map(file.headers.map((header, index) => [norm(header), index]));
    return Object.entries(MAP).map(([destination, sourceName]) => ({
      destination, sourceName, found: source.has(norm(sourceName)), protected: PROTECTED.has(norm(destination))
    }));
  }, [file]);
  const destinationPlan = useMemo(() => {
    if (!file || !destination) return null;
    const sourceIndexes = new Map(file.headers.map((header, index) => [norm(header), index]));
    const columns = destination.headers.map((header: string, index: number) => {
      const key = Object.keys(MAP).find(candidate => norm(candidate) === norm(header));
      const sourceName = key ? MAP[key] : "";
      const sourceIndex = sourceName ? sourceIndexes.get(norm(sourceName)) : undefined;
      const protectedColumn = PROTECTED.has(norm(header));
      return { header, index, sourceName, sourceIndex, protectedColumn, importable: Boolean(header && !protectedColumn && sourceName && sourceIndex !== undefined) };
    });
    const missing = columns.filter((column: any) => column.header && !column.protectedColumn && column.sourceName && column.sourceIndex === undefined);
    const mapped = columns.filter((column: any) => column.importable);
    const sample = file.rows.slice(0, 5).map(row => mapped.map((column: any) => row[column.sourceIndex as number] instanceof Date ? (row[column.sourceIndex as number] as Date).toLocaleString("pt-BR") : String(row[column.sourceIndex as number] ?? "")));
    return { columns, missing, mapped, sample };
  }, [file, destination]);


  async function loadDestinationSheets() {
    setBusy(true); setError(""); setDestination(null); setSheets([]);
    try { const result = await (window as any).controleDiario.sistema.testarSheets(spreadsheetId); setSpreadsheetTitle(result.title); const visible = result.sheets.filter((s: { hidden: boolean; title: string }) => !s.hidden); setSheets(visible); if (!visible.some((s: { title: string }) => s.title === targetSheet)) setTargetSheet(visible[0]?.title ?? ""); }
    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL LISTAR AS ABAS DA PLANILHA."); }
    finally { setBusy(false); }
  }
  async function inspectDestination() {
    if (!targetSheet) { setError("SELECIONE A ABA DE DESTINO."); return; }
    setBusy(true); setError(""); setDestination(null);
    try { setDestination(await (window as any).controleDiario.sistema.inspecionarDestino(spreadsheetId, targetSheet)); }
    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL INSPECIONAR A ABA DE DESTINO."); }
    finally { setBusy(false); }
  }

  async function readFile(selected?: File) {
    setError(""); setFile(null);
    if (!selected) return;
    if (!selected.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setError("SELECIONE UM ARQUIVO .XLSX.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await selected.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("O ARQUIVO NÃO POSSUI ABAS.");
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false });
      if (rows.length < 2) throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
      const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
      if (!headers.some(Boolean)) throw new Error("NÃO FOI POSSÍVEL IDENTIFICAR O CABEÇALHO DA PRIMEIRA LINHA.");
      const hash = await sha256(selected);
      setFile({ name: selected.name, sheetName, headers, rows: rows.slice(1), hash });
    } catch (e) {
      setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL LER O ARQUIVO XLSX.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="import-workspace">
    <div className="workspace-intro">
      <h2>Importação de estatísticas</h2>
      <p>Selecione o arquivo .xlsx e conecte a planilha empresarial pela conta Google autorizada. Esta etapa lê a origem e inspeciona o destino, sem gravar dados.</p>
    </div>
    <div className="import-placeholder">
      <label className="import-file-label">
        <span>ARQUIVO XLSX</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => void readFile(e.target.files?.[0])} />
      </label>
      <h3>Planilha empresarial</h3>
      <label className="import-file-label"><span>ID DA PLANILHA</span><input value={spreadsheetId} onChange={e => { setSpreadsheetId(e.target.value); setSheets([]); setDestination(null); }} placeholder="ID da planilha Google Sheets" /></label>
      <button className="import-action-button" disabled={busy || !spreadsheetId.trim()} onClick={() => void loadDestinationSheets()}>CARREGAR ABAS VISÍVEIS</button>
      {spreadsheetTitle && <p className="import-note">Planilha encontrada: <strong>{spreadsheetTitle}</strong></p>}
      {sheets.length > 0 && <><label className="import-file-label"><span>ABA DE DESTINO</span><select value={targetSheet} onChange={e => { setTargetSheet(e.target.value); setDestination(null); }}><option value="">Selecione uma aba</option>{sheets.map(s => <option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label><button className="import-action-button" disabled={busy || !targetSheet} onClick={() => void inspectDestination()}>INSPECIONAR DESTINO</button></>}
      {destination && <div className="import-destination-result"><h3>Destino validado para prévia</h3><div className="import-summary"><div><span>ABA</span><strong>{destination.sheetTitle}</strong></div><div><span>COLUNA TICKET</span><strong>{destination.ticketColumn}</strong></div><div><span>ÚLTIMA LINHA COM TICKET</span><strong>{destination.lastTicketRow}</strong></div><div><span>LINHA DO CABEÇALHO NOVO</span><strong>{destination.headerRow}</strong></div></div><p className="import-note">A primeira linha prevista para os dados seria {destination.firstDataRow}. A planilha foi consultada apenas em leitura.</p><details className="import-source-details"><summary>Ver cabeçalhos atuais do destino</summary><ol>{destination.headers.map((header:string,i:number)=><li key={i}>{header || "(cabeçalho vazio)"}</li>)}</ol></details></div>}
      {busy && <p className="system-message">PROCESSANDO…</p>}
      {error && <p className="system-message" role="alert">{error}</p>}
      {file && <>
        <div className="import-summary">
          <div><span>ARQUIVO</span><strong>{file.name}</strong></div>
          <div><span>ABA LIDA</span><strong>{file.sheetName}</strong></div>
          <div><span>LINHAS DE DADOS</span><strong>{file.rows.length.toLocaleString("pt-BR")}</strong></div>
          <div><span>COLUNAS DE ORIGEM</span><strong>{file.headers.filter(Boolean).length}</strong></div>
        </div>
        <h3>Validação do mapeamento do script atual</h3>
        <p>O arquivo é lido pela primeira aba, conforme o importador original. Os nomes abaixo são comparados sem diferenciar maiúsculas/minúsculas e removendo espaços nas extremidades.</p>
        <div className="import-map-table">
          <div className="import-map-row import-map-head"><span>COLUNA DE DESTINO</span><span>COLUNA DE ORIGEM ESPERADA</span><span>RESULTADO</span></div>
          {mapping.map(item => <div className="import-map-row" key={item.destination}>
            <span>{item.destination}</span><span>{item.sourceName}</span>
            <strong className={item.found ? "import-found" : "import-missing"}>{item.found ? "ENCONTRADA" : "AUSENTE"}</strong>
          </div>)}
        </div>
        <details className="import-source-details"><summary>Ver cabeçalhos encontrados no arquivo</summary><ol>{file.headers.map((header, i) => <li key={i}>{header || "(cabeçalho vazio)"}</li>)}</ol></details>
        {destinationPlan && <section className="import-preview">
          <h3>Prévia de importação (somente leitura)</h3>
          <p className="import-note">Colunas de destino que receberiam dados: <strong>{destinationPlan.mapped.length}</strong>. Colunas protegidas e colunas sem mapeamento ficam fora da gravação. A prévia abaixo mostra até cinco registros.</p>
          {destinationPlan.missing.length > 0 && <p className="import-warning">Colunas de origem ausentes: {destinationPlan.missing.map((column:any) => column.sourceName).join(", ")}. Essas colunas seriam ignoradas pelo script original.</p>}
          {destinationPlan.mapped.length > 0 ? <div className="import-map-table"><div className="import-map-row import-map-head"><span>DESTINO</span><span>ORIGEM</span><span>AMOSTRA</span></div>{destinationPlan.mapped.slice(0,12).map((column:any,i:number)=><div className="import-map-row" key={column.header}><span>{column.header}</span><span>{column.sourceName}</span><span>{destinationPlan.sample[0]?.[i] ?? "(vazio)"}</span></div>)}</div> : <p className="import-warning">Nenhuma coluna mapeável foi encontrada para o destino selecionado.</p>}
        </section>}
        <div className="import-integrity"><span>SHA-256 DO ARQUIVO</span><code>{file.hash}</code></div>
        <p className="import-note">Nenhum dado foi gravado. A inspeção do destino é somente leitura; a próxima etapa será montar a prévia linha a linha antes de habilitar qualquer gravação.</p>
      </>}
    </div>
  </section>;
}
