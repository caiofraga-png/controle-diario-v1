import { useState } from "react";
type SheetInfo={sheetId:number;title:string;hidden:boolean};
type SourceFile={file:File;name:string;headers:string[];rows:unknown[][];hash:string};
async function hashFile(file:File){const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
function downloadBase64(base64:string,name:string){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
type ImporterPanelProps={onClose?:()=>void};
export default function VolSupImporterPanel({onClose}:ImporterPanelProps){
 const [spreadsheetId]=useState(()=>localStorage.getItem("controle-diario-volsup-spreadsheet")??"1608bZtMCXHSbXDzYVIq-X454ZDDOpCUa4TdkHWZT5wM");
 const [sheets,setSheets]=useState<SheetInfo[]>([]),[targetSheet,setTargetSheet]=useState("");
 const [volsup,setVolsup]=useState<SourceFile|null>(null),[midias,setMidias]=useState<SourceFile|null>(null);
 const [busy,setBusy]=useState(false),[busyType,setBusyType]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[completed,setCompleted]=useState(false);
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
 async function importFile(which:"volsup"|"midias"):Promise<boolean>{const file=which==="volsup"?volsup:midias;if(!file){setError("SELECIONE O ARQUIVO XLSX.");return false;}if(!targetSheet){setError("SELECIONE A ABA DE DESTINO.");return false;}
  if(!window.confirm(`Importar ${which==="volsup"?"VOLUMETRIA SUPORTE":"VOLUMETRIA SUPORTE - MÍDIAS"} para a aba “${targetSheet}”? A operação gravará dados na planilha empresarial.`))return false;
  setBusy(true);setBusyType(which==="volsup"?"IMPORTANDO VOLSUP":"IMPORTANDO MÍDIAS");
  try{const payload={spreadsheetId,sheetTitle:targetSheet,fileName:file.name,headers:file.headers,rows:file.rows,hash:file.hash};const method=which==="volsup"?"importarVolSup":"importarVolSupMid";let result=await (window as any).controleDiario.sistema[method](payload);
   if(result.duplicate){if(!window.confirm(`O arquivo “${file.name}” já foi processado para a aba “${targetSheet}”. Deseja processá-lo novamente?`)){setMessage("IMPORTAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO.");return false;}result=await (window as any).controleDiario.sistema[method]({...payload,confirmarDuplicidade:true});}
   if(result.duplicate)throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");localStorage.setItem("controle-diario-volsup-tab",targetSheet);
   setMessage(`${which==="volsup"?"VOLSUP":"VOLSUP MÍDIAS"} CONCLUÍDO: ${result.openRecords??0} ABERTOS E ${result.closedRecords??0} ENCERRADOS; ${result.openSubtypes??0} SUBTIPOS ABERTOS E ${result.closedSubtypes??0} SUBTIPOS ENCERRADOS.`);return true;
  }catch(e){const detail=e instanceof Error?e.message:"A IMPORTAÇÃO NÃO FOI CONCLUÍDA.";setError(previous=>previous?`${previous}\n${which==="volsup"?"VOLUMETRIA SUPORTE":"VOLUMETRIA SUPORTE - MIDIAS"}: ${detail}`:`${which==="volsup"?"VOLUMETRIA SUPORTE":"VOLUMETRIA SUPORTE - MIDIAS"}: ${detail}`);return false;}finally{setBusy(false);setBusyType("");}
 }
 async function executeSelected(){if(completed&&onClose){onClose();return;}if(!volsup&&!midias){setError("SELECIONE AO MENOS UM ARQUIVO.");return;}if(!targetSheet){setError("SELECIONE A ABA DO DIA.");return;}setError("");setMessage("");setCompleted(false);const results:boolean[]=[];if(volsup)results.push(await importFile("volsup"));if(midias)results.push(await importFile("midias"));if(results.length&&results.every(Boolean))setCompleted(true);}
 async function generate(type:"OSCILACAO"|"INCONFORMIDADE"){if(!volsup){setError("SELECIONE O ARQUIVO XLSX DE VOLUMETRIA SUPORTE.");return;}setBusy(true);setBusyType(type==="OSCILACAO"?"GERANDO OSCILAÇÃO":"GERANDO INCONFORMIDADE");setError("");setMessage("");try{const result=await (window as any).controleDiario.sistema.gerarVolSupArquivoFiltrado(volsup.file,type);if(!result?.base64||!result?.fileName)throw new Error("O ARQUIVO FILTRADO NÃO FOI GERADO.");downloadBase64(result.base64,result.fileName);setMessage(`DOWNLOAD GERADO: ${result.fileName}`);}catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL GERAR O XLSX FILTRADO.");}finally{setBusy(false);setBusyType("");}}
 return <section className="import-workspace"><div className="workspace-intro"><h2>Importação</h2></div><div className="importer-shell">
  <header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>VOLUMETRIA DIÁRIA - SUPORTE</h2><p>Compilação de Dados - Madrugada</p></header>
  <div className="volsup-layout">
   <label className="importer-field"><span>ABA DO DIA</span><select value={targetSheet} onChange={e=>{setTargetSheet(e.target.value);if(e.target.value)localStorage.setItem("controle-diario-volsup-tab",e.target.value);}} disabled={busy||!sheets.length}>{!sheets.length&&<option value="">Carregue as abas disponíveis</option>}{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>
   <div className="importer-field"><span>VOLUMETRIA SUPORTE</span><label className="volsup-file-picker"><span>SELECIONAR</span><em>{volsup?.name??"Nenhum arquivo selecionado"}</em><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"volsup")}/></label>{volsup&&<small>{volsup.name} · {volsup.rows.length.toLocaleString("pt-BR")} registros</small>}</div>
   <div className="importer-field"><span>VOLUMETRIA SUPORTE - MIDIAS</span><label className="volsup-file-picker"><span>SELECIONAR</span><em>{midias?.name??"Nenhum arquivo selecionado"}</em><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"midias")}/></label>{midias&&<small>{midias.name} · {midias.rows.length.toLocaleString("pt-BR")} registros</small>}</div>
  </div>
  <div className="volsup-actions"><button className="importer-execute-button" disabled={busy||(!volsup&&!midias)||!targetSheet} onClick={()=>void executeSelected()}>{busy?"PROCESSANDO…":completed&&onClose?"ENCERRAR":"EXECUTAR"}</button></div>
  <div className="importer-controls volsup-downloads"><button className="importer-secondary-button" disabled={busy||!volsup} onClick={()=>void generate("OSCILACAO")}>{busy&&busyType==="GERANDO OSCILAÇÃO"?"GERANDO…":"OSCILAÇÃO"}</button><button className="importer-secondary-button" disabled={busy||!volsup} onClick={()=>void generate("INCONFORMIDADE")}>{busy&&busyType==="GERANDO INCONFORMIDADE"?"GERANDO…":"INCONFORMIDADE"}</button></div>
  <div className="volsup-base"><button className="importer-secondary-button" title="Atualizar abas disponíveis" aria-label="Atualizar abas disponíveis" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}><span aria-hidden="true">⟳</span></button></div>
  {busy&&<p className="importer-feedback" role="status">{busyType}… AGUARDE.</p>}{error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
 </div></section>;
}
