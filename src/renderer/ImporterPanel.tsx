import { useState } from "react";
import StatisticsImporterPanel from "./StatisticsImporterPanel";
import CallbackImporterPanel from "./CallbackImporterPanel";
import ProductivitySacImporterPanel from "./ProductivitySacImporterPanel";
import ChatMidiasImporterPanel from "./ChatMidiasImporterPanel";
import ChatMidiasFinanceiroImporterPanel from "./ChatMidiasFinanceiroImporterPanel";
import ChatMidiasComercialImporterPanel from "./ChatMidiasComercialImporterPanel";
import VolSupImporterPanel from "./VolSupImporterPanel";
import MaintenanceImporterPanel from "./MaintenanceImporterPanel";

type Importer = "estatisticas" | "callback" | "prodsac" | "chatmidias" | "chatfinanceiro" | "chatcomercial" | "volsup" | "manutencao";

type ImporterPanelProps = { initialImporter?: Importer; showSelector?: boolean; tabGroup?: "all" | "chatmidias"; onClose?: () => void };

export default function ImporterPanel({ initialImporter = "estatisticas", showSelector = true, tabGroup = "all", onClose }: ImporterPanelProps) {
  const [selected, setSelected] = useState<Importer>(initialImporter);
  return (
    <div className="importer-host">
      {showSelector && <div className="importer-switch" role="tablist" aria-label="Selecionar importador">
        {tabGroup === "all" && <button type="button" role="tab" aria-selected={selected === "estatisticas"} className={selected === "estatisticas" ? "active" : ""} onClick={() => setSelected("estatisticas")}>DADOS ESTATÍSTICOS</button>}
        {tabGroup === "all" && <button type="button" role="tab" aria-selected={selected === "callback"} className={selected === "callback" ? "active" : ""} onClick={() => setSelected("callback")}>CALLBACK</button>}
        {tabGroup === "all" && <button type="button" role="tab" aria-selected={selected === "prodsac"} className={selected === "prodsac" ? "active" : ""} onClick={() => setSelected("prodsac")}>PRODUTIVIDADE SAC</button>}
        {(tabGroup === "all" || tabGroup === "chatmidias") && <button type="button" role="tab" aria-selected={selected === "chatmidias"} className={selected === "chatmidias" ? "active" : ""} onClick={() => setSelected("chatmidias")}>CHAT MÍDIAS - SUPORTE</button>}
        {(tabGroup === "all" || tabGroup === "chatmidias") && <button type="button" role="tab" aria-selected={selected === "chatfinanceiro"} className={selected === "chatfinanceiro" ? "active" : ""} onClick={() => setSelected("chatfinanceiro")}>CHAT MÍDIAS - FINANCEIRO</button>}
        {(tabGroup === "all" || tabGroup === "chatmidias") && <button type="button" role="tab" aria-selected={selected === "chatcomercial"} className={selected === "chatcomercial" ? "active" : ""} onClick={() => setSelected("chatcomercial")}>CHAT MÍDIAS - COMERCIAL</button>}
        {tabGroup === "all" && <button type="button" role="tab" aria-selected={selected === "volsup"} className={selected === "volsup" ? "active" : ""} onClick={() => setSelected("volsup")}>VOLUMETRIA SUPORTE</button>}
      </div>}
      {selected === "estatisticas" ? <StatisticsImporterPanel onClose={onClose} /> : selected === "callback" ? <CallbackImporterPanel onClose={onClose} /> : selected === "prodsac" ? <ProductivitySacImporterPanel onClose={onClose} /> : selected === "chatmidias" ? <ChatMidiasImporterPanel onClose={onClose} /> : selected === "chatfinanceiro" ? <ChatMidiasFinanceiroImporterPanel onClose={onClose} /> : selected === "chatcomercial" ? <ChatMidiasComercialImporterPanel onClose={onClose} /> : selected === "volsup" ? <VolSupImporterPanel onClose={onClose} /> : <MaintenanceImporterPanel onClose={onClose} /> }
    </div>
  );
}
