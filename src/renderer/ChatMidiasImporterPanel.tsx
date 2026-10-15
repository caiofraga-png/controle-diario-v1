import { useState } from "react";
type SheetInfo={sheetId:number;title:string;hidden:boolean};
type SourceFile={name:string;headers:string[];rows:unknown[][];hash:string};
async function hashFile(file:File){const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
export default function ChatMidiasImporterPanel(){
 const [spreadsheetId,setSpreadsheetId]=useState(()=>localStorage.getItem("controle-diario-chatmidias-spreadsheet")??"");
 const [sheets,setSheets]=useState<SheetInfo[]>([]);
 const [targetSheet,setTargetSheet]=useState(()=>localStorage.getItem("controle-diario-chatmidias-tab")??"");
 const [file,setFile]=useState<SourceFile|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function readFile(selected?:File){
  setError("");setMessage("");setFile(null);if(!selected)return;
  if(!selected.name.toLowerCase().endsWith(".xlsx")){setError("SELECIONE UM ARQUIVO .XLSX.");return;}
  setBusy(true);
  try{const parsed=await (window as any).controleDiario.sistema.prepararEstatisticas(selected);const headers=(parsed.headers as unknown[]).map(v=>String(v??"").trim()),rows=parsed.rows as unknown[][];
   if(rows.length<1||!headers.some(Boolean))throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
   setFile({name:selected.name,headers,rows,hash:await hashFile(selected)});
  }catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL LER O ARQUIVO.");}finally{setBusy(false);}
 }
 async function loadSheets(){
  setBusy(true);setError("");setMessage("");setSheets([]);
  try{const result=await (window as any).controleDiario.sistema.testarSheets(spreadsheetId),visible=(result.sheets as SheetInfo[]).filter(s=>!s.hidden);setSheets(visible);
   const saved=localStorage.getItem("controle-diario-chatmidias-tab")??"";setTargetSheet(visible.some(s=>s.title===saved)?saved:(visible[0]?.title??""));
   if(!visible.length)setMessage("NENHUMA ABA VISÍVEL FOI ENCONTRADA.");
  }catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CARREGAR AS ABAS.");}finally{setBusy(false);}
 }
 async function importFile(){
  if(!file){setError("SELECIONE UM ARQUIVO XLSX.");return;}if(!targetSheet){setError("SELECIONE A ABA DE DESTINO.");return;}
  if(!window.confirm("Importar o arquivo CHAT MÍDIAS - SUPORTE para a aba escolhida? A operação gravará dados na planilha empresarial."))return;
  setBusy(true);setError("");setMessage("");
  try{const payload={spreadsheetId,sheetTitle:targetSheet,fileName:file.name,headers:file.headers,rows:file.rows,hash:file.hash};
   let result=await (window as any).controleDiario.sistema.importarChatMidias(payload);
   if(result.duplicate){if(!window.confirm("ESTE ARQUIVO JÁ FOI IMPORTADO HOJE. Deseja importá-lo novamente?")){setMessage("IMPORTAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO.");return;}
    result=await (window as any).controleDiario.sistema.importarChatMidias({...payload,confirmarDuplicidade:true});}
   if(result.duplicate)throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");
   localStorage.setItem("controle-diario-chatmidias-spreadsheet",spreadsheetId);localStorage.setItem("controle-diario-chatmidias-tab",targetSheet);
   const missing=result.missingColumns?.length?" COLUNAS AUSENTES NA ORIGEM: "+result.missingColumns.join(", ")+".":"";
   const warning=result.warning?" "+result.warning:"";
   setMessage(`IMPORTAÇÃO CONCLUÍDA: ${result.records.toLocaleString("pt-BR")} REGISTROS.${missing}${warning}`);
  }catch(e){setError(e instanceof Error?e.message:"A IMPORTAÇÃO CHAT MÍDIAS - SUPORTE NÃO FOI CONCLUÍDA.");}finally{setBusy(false);}
 }
 return <div className="importer-shell"><header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>CHAT MÍDIAS - SUPORTE</h2><p>Compilação de Dados - Madrugada</p></header>
  <div className="importer-fields"><label className="importer-field"><span>Aba</span><select value={targetSheet} onChange={e=>setTargetSheet(e.target.value)} disabled={busy||sheets.length===0}>{sheets.length===0&&<option value="">Carregue as abas disponíveis</option>}{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>
   <label className="importer-field"><span>Arquivo</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0])}/>{file&&<small>{file.name} · {file.rows.length.toLocaleString("pt-BR")} registros</small>}</label></div>
  <div className="importer-controls"><label className="importer-spreadsheet-id"><span>ID da planilha</span><input value={spreadsheetId} onChange={e=>{setSpreadsheetId(e.target.value);setSheets([]);setTargetSheet("");setMessage("");}} placeholder="ID da planilha Google Sheets" disabled={busy}/></label><button className="importer-secondary-button" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}>CARREGAR ABAS</button></div>
  <button className="importer-execute-button" disabled={busy||!file||!targetSheet} onClick={()=>void importFile()}>{busy?"PROCESSANDO…":"EXECUTAR"}</button>
  {error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
 </div>;
}
