import { useState } from "react";

type ParsedTicket = { link: string; codigo: string; nome: string };

function valueAfterLabel(text: string, label: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const target = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim().replace(/:$/, "");
    const normalized = current.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized !== target) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate) return candidate;
    }
  }
  return "";
}

export default function AtendimentosPanel() {
  const [ticketText, setTicketText] = useState("");
  const [ticketLink, setTicketLink] = useState("");
  const [parsed, setParsed] = useState<ParsedTicket | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function processTicket() {
    setError("");
    setCopied(false);
    const nome = valueAfterLabel(ticketText, "Cliente");
    const codigo = valueAfterLabel(ticketText, "Código do Cliente");
    if (!ticketLink.trim()) {
      setParsed(null);
      setError("INFORME O LINK DO TICKET.");
      return;
    }
    if (!nome || nome === "Informações do Cliente") {
      setParsed(null);
      setError("NÃO FOI POSSÍVEL IDENTIFICAR O NOME DO CLIENTE. CONFIRA O TEXTO COPIADO.");
      return;
    }
    setParsed({ link: ticketLink.trim(), codigo, nome });
  }

  async function copyRow() {
    if (!parsed) return;
    // A pessoa seleciona a coluna C (TICKET). A saída cobre C:F:
    // TICKET, CANAL (célula vazia), CÓDIGO e NOME.
    const cells = [parsed.link, "", parsed.codigo, parsed.nome];
    try {
      await navigator.clipboard.writeText(cells.join("\t"));
      setCopied(true);
      setError("");
    } catch {
      setError("NÃO FOI POSSÍVEL COPIAR AUTOMATICAMENTE. VERIFIQUE A PERMISSÃO DE ÁREA DE TRANSFERÊNCIA DO NAVEGADOR.");
    }
  }

  return <section className="attendances-workspace">
    <div className="workspace-intro">
      <h2>Atendimentos</h2>
      <p>Organize os dados principais do ticket.</p>
    </div>
    <div className="attendance-form-card">
      <label className="attendance-field">
        <span>LINK DO TICKET</span>
        <input value={ticketLink} onChange={e => { setTicketLink(e.target.value); setParsed(null); setCopied(false); }} />
      </label>
      <label className="attendance-field">
        <span>CONTEÚDO COPIADO</span>
        <textarea value={ticketText} onChange={e => { setTicketText(e.target.value); setParsed(null); setCopied(false); }} rows={12} placeholder="Cole o conteúdo do ticket aqui" />
      </label>
      <div className="attendance-actions">
        <button className="attendance-primary" onClick={processTicket} disabled={!ticketText.trim() || !ticketLink.trim()}>PROCESSAR TICKET</button>
        <button className="attendance-secondary" onClick={() => { setTicketText(""); setTicketLink(""); setParsed(null); setError(""); setCopied(false); }}>LIMPAR</button>
      </div>
      {error && <p className="attendance-error" role="alert">{error}</p>}
    </div>
    {parsed && <div className="attendance-preview-card">
      <div className="attendance-preview-head"><h3>CONFERÊNCIA DOS DADOS</h3><span>PRONTO PARA COPIAR</span></div>
      <dl>
        <div><dt>TICKET</dt><dd>{parsed.link}</dd></div>
        <div><dt>CÓDIGO</dt><dd>{parsed.codigo || "— (SEM CÓDIGO)"}</dd></div>
        <div><dt>NOME</dt><dd>{parsed.nome}</dd></div>
      </dl>
      
      <button className="attendance-primary" onClick={() => void copyRow()}>{copied ? "✓ COPIADO" : "COPIAR PARA A PLANILHA"}</button>
      {copied && <p className="attendance-success">COPIADO. Selecione a célula C (TICKET) da nova linha e cole.</p>}
    </div>}
  </section>;
}
