import { useState } from "react";
type SheetInfo={sheetId:number;title:string;hidden:boolean};
type Source={name:string;headers:string[];rows:unknown[][];hash:string};
async function sha(file:File){const b=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
export default function ProductivitySacImporterPanel(){
 const [spreadsheetId,setSpreadsheetId]=useState(()=>localStorage.getItem("controle-diario-prodsac-id")??"");
 const [sheets,setSheets]=useState<SheetInfo[]>([]);
 const [pairs,setPairs]=useState([{label:"GERAL",file:null as Source|null,tab:""},{label:"ABERTAS",file:null as Source|null,tab:""}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function loadSheets(){setBusy(true);setError("");setMessage("");try{const r=await (window as any).controleDiario.sistema.testarSheets(spreadsheetId);const v=r.sheets.filter((s:SheetInfo)=>!s.hidden);setSheets(v);setPairs(old=>old.map(p=>({...p,tab:v.some((s:SheetInfo)=>s.title===p.tab)?p.tab:""})));if(!v.length)setMessage("NENHUMA ABA VISÍVEL ENCONTRADA.");}catch(e){setError(e instanceof Error?e.message:"ERRO AO CARREGAR ABAS.");}finally{setBusy(false);}}
 async function selectFile(i:number,f?:File){setError("");setMessage("");if(!f)return;if(!f.name.toLowerCase().endsWith(".xlsx")){setError("SELECIONE UM ARQUIVO .XLSX.");return;}setBusy(true);try{const d=await (window as any).controleDiario.sistema.prepararEstatisticas(f);if(d.rows.length<1||!d.headers.some((h:string)=>h.trim()))throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E DADOS.");const source={name:f.name,headers:d.headers,rows:d.rows,hash:await sha(f)};setPairs(old=>old.map((p,n)=>n===i?{...p,file:source}:p));}catch(e){setError(e instanceof Error?e.message:"ERRO AO LER ARQUIVO.");}finally{setBusy(false);}}
 async function execute(){const chosen=pairs.filter(p=>p.file||p.tab);if(!chosen.length){setError("SELECIONE PELO MENOS UM PAR DE ARQUIVO E ABA.");return;}if(chosen.some(p=>!p.file||!p.tab)){setError("CADA PAR INICIADO PRECISA TER ARQUIVO E ABA DE DESTINO.");return;}if(!window.confirm("Executar a importação de PRODUTIVIDADE SAC? Os pares selecionados serão importados em sequência para a planilha empresarial."))return;setBusy(true);setError("");setMessage("");try{const out=[];for(const p of chosen){let r=await (window as any).controleDiario.sistema.importarProdutividadeSac({spreadsheetId,sheetTitle:p.tab,fileName:p.file!.name,headers:p.file!.headers,rows:p.file!.rows,hash:p.file!.hash,source:p.label});if(r.duplicate){if(!window.confirm("O arquivo "+p.file!.name+" já foi importado hoje para "+p.tab+". Importar novamente?"))throw new Error("Operação cancelada após detectar duplicidade. Confira os resultados antes de tentar novamente.");r=await (window as any).controleDiario.sistema.importarProdutividadeSac({spreadsheetId,sheetTitle:p.tab,fileName:p.file!.name,headers:p.file!.headers,rows:p.file!.rows,hash:p.file!.hash,source:p.label,confirmarDuplicidade:true});}if(r.duplicate)throw new Error("Não foi possível confirmar a duplicidade de "+p.label+".");out.push(p.label+": "+r.records+" registros em "+r.sheetTitle);}localStorage.setItem("controle-diario-prodsac-id",spreadsheetId);setMessage("IMPORTAÇÃO CONCLUÍDA — "+out.join(" | "));}catch(e){setError(e instanceof Error?e.message:"IMPORTAÇÃO NÃO CONCLUÍDA.");}finally{setBusy(false);}}
 return <section className="import-workspace">
  <div className="workspace-intro"><h2>Importação</h2></div>
  <div className="importer-shell">
   <header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>PRODUTIVIDADE SAC</h2><p>Compilação de Dados - Madrugada</p></header>
   <div className="prodsac-pairs">
    {pairs.map((p,i)=><div className="prodsac-pair" key={p.label}>
     <h3>{p.label}</h3>
     <label className="importer-field"><span>Aba</span><select value={p.tab} disabled={busy||!sheets.length} onChange={e=>setPairs(old=>old.map((x,n)=>n===i?{...x,tab:e.target.value}:x))}><option value="">{sheets.length?"Selecione a aba de destino":"Carregue as abas disponíveis"}</option>{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>
     <label className="importer-field"><span>Arquivo</span><input className="prodsac-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void selectFile(i,e.target.files?.[0])}/>{p.file&&<small>{p.file.name} · {p.file.rows.length.toLocaleString("pt-BR")} registros</small>}</label>
    </div>)}
   </div>
   <div className="importer-controls"><label className="importer-spreadsheet-id"><span>ID da planilha</span><input value={spreadsheetId} onChange={e=>{setSpreadsheetId(e.target.value);setSheets([]);setMessage("");}} placeholder="ID da planilha Google Sheets" disabled={busy}/></label><button className="importer-secondary-button" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}>CARREGAR ABAS</button></div>
   <button className="importer-execute-button" disabled={busy||!pairs.some(p=>p.file&&p.tab)} onClick={()=>void execute()}>{busy?"PROCESSANDO…":"EXECUTAR"}</button>
   {error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
  </div>
 </section>;
}
