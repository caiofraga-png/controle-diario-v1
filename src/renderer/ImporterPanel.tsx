import { useState } from "react";
import StatisticsImporterPanel from "./StatisticsImporterPanel";
import ProductivitySacImporterPanel from "./ProductivitySacImporterPanel";
export default function ImporterPanel(){
 const [selected,setSelected]=useState<"estatisticas"|"prodsac">("estatisticas");
 return <div className="importer-host"><div className="importer-switch" role="tablist" aria-label="Selecionar importador"><button type="button" role="tab" aria-selected={selected==="estatisticas"} className={selected==="estatisticas"?"active":""} onClick={()=>setSelected("estatisticas")}>DADOS ESTATÍSTICOS</button><button type="button" role="tab" aria-selected={selected==="prodsac"} className={selected==="prodsac"?"active":""} onClick={()=>setSelected("prodsac")}>PRODUTIVIDADE SAC</button></div>{selected==="estatisticas"?<StatisticsImporterPanel/>:<ProductivitySacImporterPanel/>}</div>;
}
