import { useState } from "react";
import StatisticsImporterPanel from "./StatisticsImporterPanel";
import CallbackImporterPanel from "./CallbackImporterPanel";
import ProductivitySacImporterPanel from "./ProductivitySacImporterPanel";

type Importer = "estatisticas" | "callback" | "prodsac";

export default function ImporterPanel() {
  const [selected, setSelected] = useState<Importer>("estatisticas");
  return (
    <div className="importer-host">
      <div className="importer-switch" role="tablist" aria-label="Selecionar importador">
        <button type="button" role="tab" aria-selected={selected === "estatisticas"} className={selected === "estatisticas" ? "active" : ""} onClick={() => setSelected("estatisticas")}>DADOS ESTATÍSTICOS</button>
        <button type="button" role="tab" aria-selected={selected === "callback"} className={selected === "callback" ? "active" : ""} onClick={() => setSelected("callback")}>CALLBACK</button>
        <button type="button" role="tab" aria-selected={selected === "prodsac"} className={selected === "prodsac" ? "active" : ""} onClick={() => setSelected("prodsac")}>PRODUTIVIDADE SAC</button>
      </div>
      {selected === "estatisticas" ? <StatisticsImporterPanel /> : selected === "callback" ? <CallbackImporterPanel /> : <ProductivitySacImporterPanel />}
    </div>
  );
}
