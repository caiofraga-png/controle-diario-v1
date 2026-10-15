import { useState } from "react";
import StatisticsImporterPanel from "./StatisticsImporterPanel";
import CallbackImporterPanel from "./CallbackImporterPanel";
import ProductivitySacImporterPanel from "./ProductivitySacImporterPanel";
import ChatMidiasImporterPanel from "./ChatMidiasImporterPanel";
import ChatMidiasFinanceiroImporterPanel from "./ChatMidiasFinanceiroImporterPanel";

type Importer = "estatisticas" | "callback" | "prodsac" | "chatmidias" | "chatfinanceiro";

export default function ImporterPanel() {
  const [selected, setSelected] = useState<Importer>("estatisticas");
  return (
    <div className="importer-host">
      <div className="importer-switch" role="tablist" aria-label="Selecionar importador">
        <button type="button" role="tab" aria-selected={selected === "estatisticas"} className={selected === "estatisticas" ? "active" : ""} onClick={() => setSelected("estatisticas")}>DADOS ESTATÍSTICOS</button>
        <button type="button" role="tab" aria-selected={selected === "callback"} className={selected === "callback" ? "active" : ""} onClick={() => setSelected("callback")}>CALLBACK</button>
        <button type="button" role="tab" aria-selected={selected === "prodsac"} className={selected === "prodsac" ? "active" : ""} onClick={() => setSelected("prodsac")}>PRODUTIVIDADE SAC</button>
        <button type="button" role="tab" aria-selected={selected === "chatmidias"} className={selected === "chatmidias" ? "active" : ""} onClick={() => setSelected("chatmidias")}>CHAT MÍDIAS - SUPORTE</button>
        <button type="button" role="tab" aria-selected={selected === "chatfinanceiro"} className={selected === "chatfinanceiro" ? "active" : ""} onClick={() => setSelected("chatfinanceiro")}>CHAT MÍDIAS - FINANCEIRO</button>
      </div>
      {selected === "estatisticas" ? <StatisticsImporterPanel /> : selected === "callback" ? <CallbackImporterPanel /> : selected === "prodsac" ? <ProductivitySacImporterPanel /> : selected === "chatmidias" ? <ChatMidiasImporterPanel /> : <ChatMidiasFinanceiroImporterPanel /> }
    </div>
  );
}
