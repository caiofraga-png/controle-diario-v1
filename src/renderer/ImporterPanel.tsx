import { useState } from "react";
import * as XLSX from "xlsx";

type SourceFile = { name: string; headers: string[]; rows: unknown[][]; hash: string };
type SheetInfo = { sheetId: number; title: string; hidden: boolean };
async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export default function ImporterPanel() {
  const [file, setFile] = useState<SourceFile | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState("1608bZtMCXHSbXDzYVIq-X454ZDDOpCUa4TdkHWZT5wM");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [targetSheet, setTargetSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function readFile(selected?: File) {
    setError(""); setMessage(""); setFile(null);
    if (!selected) return;
    if (!selected.name.toLocaleLowerCase().endsWith(".xlsx")) { setError("SELECIONE UM ARQUIVO .XLSX."); return; }
    setBusy(true);
    try {
      const workbook = XLSX.read(await selected.arrayBuffer(), { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("O ARQUIVO NÃO POSSUI ABAS.");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true, blankrows: false });
      if (rows.length < 2) throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
      const headers = (rows[0] ?? []).map(v => String(v ?? "").trim());
      if (!headers.some(Boolean)) throw new Error("NÃO FOI POSSÍVEL IDENTIFICAR O CABEÇALHO DO ARQUIVO.");
      setFile({ name: selected.name, headers, rows: rows.slice(1), hash: await hashFile(selected) });
    } catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL LER O ARQUIVO."); }
    finally { setBusy(false); }
  }

  async function loadSheets() {
    setBusy(true); setError(""); setMessage(""); setSheets([]);
    try {
      const result = await (window as any).controleDiario.sistema.testarSheets(spreadsheetId);
      const visible = result.sheets.filter((s: SheetInfo) => !s.hidden);
      setSheets(visible);
      const saved = localStorage.getItem("controle-diario-importer-tab") ?? "";
      setTargetSheet(visible.some((s: SheetInfo) => s.title === saved) ? saved : (visible[0]?.title ?? ""));
      if (!visible.length) setMessage("NENHUMA ABA VISÍVEL FOI ENCONTRADA.");
    } catch (e) { setError(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CARREGAR AS ABAS."); }
    finally { setBusy(false); }
  }

  async function importFile() {
    if (!file) { setError("SELECIONE A PLANILHA XLSX TRATADA."); return; }
    if (!targetSheet) { setError("SELECIONE A ABA DE DESTINO."); return; }
    if (!window.confirm("Importar os dados do arquivo selecionado para a aba escolhida? A operação gravará dados na planilha empresarial.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = { spreadsheetId, sheetTitle: targetSheet, fileName: file.name, headers: file.headers, rows: file.rows, hash: file.hash };
      let result = await (window as any).controleDiario.sistema.importarEstatisticas(payload);
      if (result.duplicate) {
        const confirmAgain = window.confirm("ESTE MESMO ARQUIVO JÁ FOI IMPORTADO HOJE. Deseja importá-lo novamente?");
        if (!confirmAgain) { setMessage("IMPORTAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO."); return; }
        result = await (window as any).controleDiario.sistema.importarEstatisticas({ ...payload, confirmarDuplicidade: true });
      }
      if (result.duplicate) throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");
      localStorage.setItem("controle-diario-importer-tab", targetSheet);
      setMessage(`IMPORTAÇÃO CONCLUÍDA: ${result.records.toLocaleString("pt-BR")} REGISTROS GRAVADOS NA ABA “${result.sheetTitle}”.`);
    } catch (e) { setError(e instanceof Error ? e.message : "A IMPORTAÇÃO NÃO FOI CONCLUÍDA."); }
    finally { setBusy(false); }
  }

  return <section className="import-workspace">
    <div className="workspace-intro"><h2>Importação de estatísticas</h2><p>Selecione a planilha tratada e importe diretamente para a aba de destino.</p></div>
    <div className="import-placeholder">
      <label className="import-file-label"><span>PLANILHA XLSX TRATADA</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => void readFile(e.target.files?.[0])} /></label>
      {file && <p className="import-note">Arquivo selecionado: <strong>{file.name}</strong> · {file.rows.length.toLocaleString("pt-BR")} registros</p>}
      <label className="import-file-label"><span>ID DA PLANILHA DE DESTINO</span><input value={spreadsheetId} onChange={e => { setSpreadsheetId(e.target.value); setSheets([]); setTargetSheet(""); setMessage(""); }} placeholder="ID da planilha Google Sheets" disabled={busy} /></label>
      <button className="import-action-button" disabled={busy || !spreadsheetId.trim()} onClick={() => void loadSheets()}>CARREGAR ABAS VISÍVEIS</button>
      {sheets.length > 0 && <label className="import-file-label"><span>ABA DE DESTINO</span><select value={targetSheet} onChange={e => setTargetSheet(e.target.value)} disabled={busy}><option value="">Selecione uma aba</option>{sheets.map(s => <option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>}
      <button className="import-action-button" disabled={busy || !file || !targetSheet} onClick={() => void importFile()}>IMPORTAR PLANILHA</button>
      {busy && <p className="system-message">PROCESSANDO…</p>}
      {error && <p className="system-message" role="alert">{error}</p>}
      {message && <p className="system-message" role="status">{message}</p>}
    </div>
  </section>;
}
