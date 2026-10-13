import { useState } from "react";
import StatisticsImporterPanel from "./StatisticsImporterPanel";
import CallbackImporterPanel from "./CallbackImporterPanel";

export default function ImporterPanel() {
  const [importer, setImporter] = useState<"estatisticas" | "callback">("estatisticas");
  return <section className="import-workspace">
    <div className="workspace-intro"><h2>Importação</h2></div>
    <div className="importer-switch" role="tablist" aria-label="Selecionar importador">
      <button type="button" role="tab" aria-selected={importer === "estatisticas"} className={importer === "estatisticas" ? "active" : ""} onClick={() => setImporter("estatisticas")}>DADOS ESTATÍSTICOS</button>
      <button type="button" role="tab" aria-selected={importer === "callback"} className={importer === "callback" ? "active" : ""} onClick={() => setImporter("callback")}>CALLBACK</button>
    </div>
    {importer === "estatisticas" ? <StatisticsImporterPanel /> : <CallbackImporterPanel />}
  </section>;
}
