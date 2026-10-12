import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type SourceFile = { name: string; sheetName: string; headers: string[]; rows: unknown[][]; hash: string };
type SheetInfo = { sheetId: number; title: string; hidden: boolean };\ndeclare global { interface Window { controleDiario: { sistema: { testarSheets: (id: string) => Promise<{spreadsheetId:string;title:string;sheets:SheetInfo[]}>; inspecionarDestino: (id:string,title:string) => Promise<{spreadsheetId:string;sheetTitle:string;headers:string[];lastTicketRow:number;headerRow:number;firstDataRow:number;ticketColumn:string}> } } } }
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
  const [spreadsheetId, setSpreadsheetId] = useState("1608bZtMCXHSbXDzYVIq-X454ZDDOpCUa4TdkHWZT5wM");\n  const [spreadsheetTitle, setSpreadsheetTitle] = useState("");\n  const [sheets, setSheets] = useState<SheetInfo[]>([]);\n  const [targetSheet, setTargetSheet] = useState("");\n  const [destination, setDestination] = useState<any>(null);
  const mapping = useMemo(() => {
    if (!file) return [];
    const source = new Map(file.headers.map((header, index) => [norm(header), index]));
    return Object.entries(MAP).map(([destination, sourceName]) => ({
      destination, sourceName, found: source.has(norm(sourceName)), protected: PROTECTED.has(norm(destination))
    }));
  }, [file]);

  async function loadDestinationSheets() {\n    setBusy(true); setError(""); setDestination(null); setSheets([]);\n    try { const result = await window.controleDiario.sistema.testarSheets(spreadsheetId); setSpreadsheetTitle(result.title); const visible = result.sheets.filter(s => !s.hidden); setSheets(visible); if (!visible.some(s => s.title === targetSheet)) setTargetSheet(visible[0]?.title ?? ""); }\n    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL LISTAR AS ABAS DA PLANILHA."); }\n    finally { setBusy(false); }\n  }\n  async function inspectDestination() {\n    if (!targetSheet) { setError("SELECIONE A ABA DE DESTINO."); return; }\n    setBusy(true); setError(""); setDestination(null);\n    try { setDestination(await window.controleDiario.sistema.inspecionarDestino(spreadsheetId, targetSheet)); }\n    catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL INSPECIONAR A ABA DE DESTINO."); }\n    finally { setBusy(false); }\n  }\n\n  async function readFile(selected?: File) {
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
      <label className="import-file-label"><span>ID DA PLANILHA</span><input value={spreadsheetId} onChange={e => { setSpreadsheetId(e.target.value); setSheets([]); setDestination(null); }} placeholder="ID da planilha Google Sheets" /></label>\n      <button className="import-action-button" disabled={busy || !spreadsheetId.trim()} onClick={() => void loadDestinationSheets()}>CARREGAR ABAS VISÍVEIS</button>\n      {spreadsheetTitle && <p className="import-note">Planilha encontrada: <strong>{spreadsheetTitle}</strong></p>}\n      {sheets.length > 0 && <><label className="import-file-label"><span>ABA DE DESTINO</span><select value={targetSheet} onChange={e => { setTargetSheet(e.target.value); setDestination(null); }}><option value="">Selecione uma aba</option>{sheets.map(s => <option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label><button className="import-action-button" disabled={busy || !targetSheet} onClick={() => void inspectDestination()}>INSPECIONAR DESTINO</button></>}\n      {destination && <div className="import-destination-result"><h3>Destino validado para prévia</h3><div className="import-summary"><div><span>ABA</span><strong>{destination.sheetTitle}</strong></div><div><span>COLUNA TICKET</span><strong>{destination.ticketColumn}</strong></div><div><span>ÚLTIMA LINHA COM TICKET</span><strong>{destination.lastTicketRow}</strong></div><div><span>LINHA DO CABEÇALHO NOVO</span><strong>{destination.headerRow}</strong></div></div><p className="import-note">A primeira linha prevista para os dados seria {destination.firstDataRow}. A planilha foi consultada apenas em leitura.</p><details className="import-source-details"><summary>Ver cabeçalhos atuais do destino</summary><ol>{destination.headers.map((header:string,i:number)=><li key={i}>{header || "(cabeçalho vazio)"}</li>)}</ol></details></div>}\n      {busy && <p className="system-message">PROCESSANDO…</p>
      {error && <p className="system-message" role="alert">{error}</p>}
      {file && <>
        <div className="import-summary">
          <div><span>ARQUIVO</span><strong>{file.name}</strong></div>
          <div><span>ABA LIDA</span><strong>{file.sheetName}</strong></div>
          <div><span>LINHAS DE DADOS</span><strong>{file.rows.length.toLocaleString("pt-BR")}</strong></div>
          <div><span>COLUNAS DE ORIGEM</span><strong>{file.headers.filter(Boolean).length}</strong></div>
        </div>
        <label className="import-file-label">
          <span>ABA DE DESTINO (PRÉ-SELEÇÃO)</span>
          <input value={targetSheet} onChange={e => setTargetSheet(e.target.value)} placeholder="Nome exato da aba da planilha empresarial" />
        </label>
        <p className="import-note">A lista automática de abas será ligada à Sheets API na próxima etapa. Por enquanto, este campo é apenas uma anotação e não executa gravação.</p>
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
        <div className="import-integrity"><span>SHA-256 DO ARQUIVO</span><code>{file.hash}</code></div>
        <p className="import-note">Nenhum dado foi gravado. A inspeção do destino é somente leitura; a próxima etapa será montar a prévia linha a linha antes de habilitar qualquer gravação.</p>
      </>}
    </div>
  </section>;
}
