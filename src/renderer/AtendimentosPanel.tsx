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
    // Ordem dos cabeçalhos informados: LEGENDAS, DATA, TICKET, CANAL, CÓDIGO, NOME,
    // TIPO, RESOLVIDO?, SUBTIPO, MOTIVO..., ROUTETHIS, SOLUÇÃO, DIFERENÇA, RETIDO?,
    // AGENDAMENTO, DIA DA RETIRADA, RETIRADO?
    const cells = Array(17).fill("");
    cells[2] = parsed.link;
    cells[4] = parsed.codigo;
    cells[5] = parsed.nome;
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
      <p>Organize os dados principais do ticket para copiar e inserir na planilha diária.</p>
    </div>
    <div className="attendance-form-card">
      <label className="attendance-field">
        <span>LINK DO TICKET <b>OBRIGATÓRIO</b></span>
        <input value={ticketLink} onChange={e => { setTicketLink(e.target.value); setParsed(null); setCopied(false); }} placeholder="Cole o link do ticket do SOS Beta" />
      </label>
      <label className="attendance-field">
        <span>CONTEÚDO COPIADO DO SOS BETA</span>
        <textarea value={ticketText} onChange={e => { setTicketText(e.target.value); setParsed(null); setCopied(false); }} rows={12} placeholder="Copie as informações do ticket no SOS Beta e cole todo o conteúdo aqui." />
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
      <p className="attendance-note">A cópia respeita a ordem dos 17 cabeçalhos informados. Somente TICKET, CÓDIGO e NOME recebem valores; as demais posições ficam vazias. Cole o resultado na primeira célula de uma nova linha vazia da planilha.</p>
      <button className="attendance-primary" onClick={() => void copyRow()}>{copied ? "✓ LINHA COPIADA" : "COPIAR LINHA PARA PLANILHA"}</button>
      {copied && <p className="attendance-success">LINHA COPIADA. Agora cole na primeira célula de uma nova linha vazia do Google Planilhas.</p>}
    </div>}
  </section>;
}
