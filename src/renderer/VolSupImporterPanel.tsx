import { useState } from "react";
type SheetInfo={sheetId:number;title:string;hidden:boolean};
type SourceFile={file:File;name:string;headers:string[];rows:unknown[][];hash:string};
async function hashFile(file:File){const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
function downloadBase64(base64:string,name:string){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
export default function VolSupImporterPanel(){
 const [spreadsheetId,setSpreadsheetId]=useState("1608bZtMCXHSbXDzYVIq-X454ZDDOpCUa4TdkHWZT5wM");
 const [sheets,setSheets]=useState<SheetInfo[]>([]),[targetSheet,setTargetSheet]=useState("");
 const [volsup,setVolsup]=useState<SourceFile|null>(null),[midias,setMidias]=useState<SourceFile|null>(null);
 const [busy,setBusy]=useState(false),[busyType,setBusyType]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function readFile(selected:File|undefined,which:"volsup"|"midias"){
  setError("");setMessage("");if(which==="volsup")setVolsup(null);else setMidias(null);if(!selected)return;
  if(!selected.name.toLowerCase().endsWith(".xlsx")){setError("SELECIONE UM ARQUIVO .XLSX.");return;}
  setBusy(true);setBusyType("LENDO ARQUIVO");
  try{const parsed=await (window as any).controleDiario.sistema.prepararEstatisticas(selected);const headers=(parsed.headers as unknown[]).map(v=>String(v??"").trim()),rows=parsed.rows as unknown[][];
   if(rows.length<1||!headers.some(Boolean))throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
   const value={file:selected,name:selected.name,headers,rows,hash:await hashFile(selected)};if(which==="volsup")setVolsup(value);else setMidias(value);
  }catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL LER O ARQUIVO.");}finally{setBusy(false);setBusyType("");}
 }
 async function loadSheets(){setBusy(true);setError("");setMessage("");setSheets([]);try{const result=await (window as any).controleDiario.sistema.testarSheets(spreadsheetId),visible=(result.sheets as SheetInfo[]).filter(s=>!s.hidden);setSheets(visible);const saved=localStorage.getItem("controle-diario-volsup-tab")??"";setTargetSheet(visible.some(s=>s.title===saved)?saved:(visible[0]?.title??""));if(!visible.length)setMessage("NENHUMA ABA VISÍVEL FOI ENCONTRADA.");}catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL CARREGAR AS ABAS.");}finally{setBusy(false);}}
 async function importFile(which:"volsup"|"midias"){const file=which==="volsup"?volsup:midias;if(!file){setError("SELECIONE O ARQUIVO XLSX.");return;}if(!targetSheet){setError("SELECIONE A ABA DE DESTINO.");return;}
  if(!window.confirm(`Importar ${which==="volsup"?"VOLUMETRIA SUPORTE":"VOLUMETRIA SUPORTE - MÍDIAS"} para a aba “${targetSheet}”? A operação gravará dados na planilha empresarial.`))return;
  setBusy(true);setBusyType(which==="volsup"?"IMPORTANDO VOLSUP":"IMPORTANDO MÍDIAS");setError("");setMessage("");
  try{const payload={spreadsheetId,sheetTitle:targetSheet,fileName:file.name,headers:file.headers,rows:file.rows,hash:file.hash};const method=which==="volsup"?"importarVolSup":"importarVolSupMid";let result=await (window as any).controleDiario.sistema[method](payload);
   if(result.duplicate){if(!window.confirm(`O arquivo “${file.name}” já foi processado para a aba “${targetSheet}”. Deseja processá-lo novamente?`)){setMessage("IMPORTAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO.");return;}result=await (window as any).controleDiario.sistema[method]({...payload,confirmarDuplicidade:true});}
   if(result.duplicate)throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");localStorage.setItem("controle-diario-volsup-tab",targetSheet);
   setMessage(`${which==="volsup"?"VOLSUP":"VOLSUP MÍDIAS"} CONCLUÍDO: ${result.openRecords??0} ABERTOS E ${result.closedRecords??0} ENCERRADOS; ${result.openSubtypes??0} SUBTIPOS ABERTOS E ${result.closedSubtypes??0} SUBTIPOS ENCERRADOS.`);
  }catch(e){setError(e instanceof Error?e.message:"A IMPORTAÇÃO NÃO FOI CONCLUÍDA.");}finally{setBusy(false);setBusyType("");}
 }
 async function executeSelected(){if(!volsup&&!midias){setError("SELECIONE AO MENOS UM ARQUIVO.");return;}if(!targetSheet){setError("SELECIONE A ABA DO DIA.");return;}if(volsup)await importFile("volsup");if(midias)await importFile("midias");}
 async function generate(type:"OSCILACAO"|"INCONFORMIDADE"){if(!volsup){setError("SELECIONE O ARQUIVO XLSX DE VOLUMETRIA SUPORTE.");return;}setBusy(true);setBusyType(type==="OSCILACAO"?"GERANDO OSCILAÇÃO":"GERANDO INCONFORMIDADE");setError("");setMessage("");try{const result=await (window as any).controleDiario.sistema.gerarVolSupArquivoFiltrado(volsup.file,type);if(!result?.base64||!result?.fileName)throw new Error("O ARQUIVO FILTRADO NÃO FOI GERADO.");downloadBase64(result.base64,result.fileName);setMessage(`DOWNLOAD GERADO: ${result.fileName}`);}catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL GERAR O XLSX FILTRADO.");}finally{setBusy(false);setBusyType("");}}
 return <section className="import-workspace"><div className="workspace-intro"><h2>Importação</h2></div><div className="importer-shell">
  <header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>VOLUMETRIA DIÁRIA - SUPORTE</h2><p>Importação de suporte e mídias · geração de XLSX filtrados</p></header>
  <div className="volsup-layout">
   <label className="importer-field"><span>ABA DO DIA</span><select value={targetSheet} onChange={e=>setTargetSheet(e.target.value)} disabled={busy||!sheets.length}>{!sheets.length&&<option value="">Carregue as abas disponíveis</option>}{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>
   <label className="importer-field"><span>VOLUMETRIA SUPORTE</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"volsup")}/>{volsup&&<small>{volsup.name} · {volsup.rows.length.toLocaleString("pt-BR")} registros</small>}</label>
   <label className="importer-field"><span>VOLUMETRIA SUPORTE - MIDIAS</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"midias")}/>{midias&&<small>{midias.name} · {midias.rows.length.toLocaleString("pt-BR")} registros</small>}</label>
  </div>
  <div className="volsup-actions"><button className="importer-execute-button" disabled={busy||(!volsup&&!midias)||!targetSheet} onClick={()=>void executeSelected()}>{busy?"PROCESSANDO…":"EXECUTAR"}</button></div>
  <div className="importer-controls volsup-downloads"><button className="importer-secondary-button" disabled={busy||!volsup} onClick={()=>void generate("OSCILACAO")}>{busy&&busyType==="GERANDO OSCILAÇÃO"?"GERANDO…":"GERAR XLSX · OSCILAÇÃO"}</button><button className="importer-secondary-button" disabled={busy||!volsup} onClick={()=>void generate("INCONFORMIDADE")}>{busy&&busyType==="GERANDO INCONFORMIDADE"?"GERANDO…":"GERAR XLSX · INCONFORMIDADE"}</button></div>
  <div className="volsup-base"><label className="importer-spreadsheet-id"><span>ID DA PLANILHA</span><input value={spreadsheetId} onChange={e=>{setSpreadsheetId(e.target.value);setSheets([]);setTargetSheet("");setMessage("");}} placeholder="ID da planilha de destino" disabled={busy}/></label><button className="importer-secondary-button" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}>CARREGAR ABAS</button></div>
  {busy&&<p className="importer-feedback" role="status">{busyType}… AGUARDE.</p>}{error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
 </div></section>;
}
