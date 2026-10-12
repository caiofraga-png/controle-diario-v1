import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type SourceFile = { name: string; sheetName: string; headers: string[]; rows: unknown[][]; hash: string };
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
  const [targetSheet, setTargetSheet] = useState("");
  const mapping = useMemo(() => {
    if (!file) return [];
    const source = new Map(file.headers.map((header, index) => [norm(header), index]));
    return Object.entries(MAP).map(([destination, sourceName]) => ({
      destination, sourceName, found: source.has(norm(sourceName)), protected: PROTECTED.has(norm(destination))
    }));
  }, [file]);

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
      <p>Selecione o arquivo .xlsx para leitura local no navegador. Esta etapa apenas analisa e valida os dados; ainda não grava nada na planilha empresarial.</p>
    </div>
    <div className="import-placeholder">
      <label className="import-file-label">
        <span>ARQUIVO XLSX</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => void readFile(e.target.files?.[0])} />
      </label>
      {busy && <p className="system-message">LENDO ARQUIVO…</p>}
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
        <p className="import-note">Nenhum dado foi enviado ao Google Drive ou à planilha empresarial. A gravação só será habilitada após a validação da leitura da planilha de destino e da prévia de importação.</p>
      </>}
    </div>
  </section>;
}
