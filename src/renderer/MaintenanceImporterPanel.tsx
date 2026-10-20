import {useState} from "react";

type SheetInfo={sheetId:number;title:string;hidden:boolean};
type SourceFile={name:string;headers:string[];rows:unknown[][];hash:string};
type Props={onClose?:()=>void;operation?:"import"|"update"};
async function hashFile(file:File){const d=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");}

export default function MaintenanceImporterPanel({onClose,operation="import"}:Props){
 const isUpdate=operation==="update";
 const [spreadsheetId,setSpreadsheetId]=useState(()=>localStorage.getItem("controle-diario-manut-spreadsheet")??"");
 const [validatedId,setValidatedId]=useState("");
 const [spreadsheetName,setSpreadsheetName]=useState("");
 const [sheets,setSheets]=useState<SheetInfo[]>([]);
 const [targetSheet,setTargetSheet]=useState("");
 const [feitas,setFeitas]=useState<SourceFile|null>(null);
 const [prazo,setPrazo]=useState<SourceFile|null>(null);
 const [abertas,setAbertas]=useState<SourceFile|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[completed,setCompleted]=useState(false);
 function changeSpreadsheetId(value:string){setSpreadsheetId(value);setValidatedId("");setSpreadsheetName("");setSheets([]);setTargetSheet("");setError("");setMessage("");setCompleted(false);}
 async function loadSheets(){
  const id=spreadsheetId.trim();
  if(!id){setError("INFORME O ID DA PLANILHA DE DESTINO.");return;}
  setBusy(true);setError("");setMessage("");setCompleted(false);
  try{
   const r=await (window as any).controleDiario.sistema.testarSheets(id);
   const visible=(r.sheets as SheetInfo[]).filter(s=>!s.hidden);
   setSheets(visible);setValidatedId(id);setSpreadsheetName(String(r.title??""));
   localStorage.setItem("controle-diario-manut-spreadsheet",id);
   const saved=localStorage.getItem("controle-diario-manut-tab")??"";
   setTargetSheet(visible.some(s=>s.title===saved)?saved:(visible[0]?.title??""));
   setMessage(visible.length? `PLANILHA VALIDADA: ${String(r.title??"PLANILHA")}. ${visible.length} ABA(S) VISÍVEL(IS).`:"NENHUMA ABA VISÍVEL FOI ENCONTRADA.");
  }catch(e){setSheets([]);setValidatedId("");setSpreadsheetName("");setTargetSheet("");setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL VALIDAR A PLANILHA.");}
  finally{setBusy(false);}
 }
 async function readFile(file:File|undefined,kind:"feitas"|"prazo"|"abertas"){
  setError("");setMessage("");setCompleted(false);
  if(kind==="feitas")setFeitas(null);else if(kind==="prazo")setPrazo(null);else setAbertas(null);
  if(!file)return;
  if(!file.name.toLowerCase().endsWith(".xlsx")){setError("SELECIONE UM ARQUIVO .XLSX.");return;}
  setBusy(true);
  try{
   const r=await (window as any).controleDiario.sistema.prepararEstatisticas(file);
   const headers=(r.headers as unknown[]).map(v=>String(v??"").trim()),rows=r.rows as unknown[][];
   if(rows.length<1||!headers.some(Boolean))throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
   const parsed={name:file.name,headers,rows,hash:await hashFile(file)};
   if(kind==="feitas")setFeitas(parsed);else if(kind==="prazo")setPrazo(parsed);else setAbertas(parsed);
  }catch(e){setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL LER O ARQUIVO.");}
  finally{setBusy(false);}
 }
 async function run(kind:"feitas"|"prazo"|"abertas",confirm=false):Promise<boolean>{
  const f=kind==="feitas"?feitas:kind==="prazo"?prazo:abertas;
  if(!f||!targetSheet||validatedId!==spreadsheetId.trim())return false;
  const payload={spreadsheetId:validatedId,sheetTitle:targetSheet,fileName:f.name,headers:f.headers,rows:f.rows,hash:f.hash,confirmarDuplicidade:confirm};
  const method=kind==="feitas"?"importarManutFeitas":kind==="prazo"?"importarManutPrazo":"atualizarManutTodasAbertas";
  let r=await (window as any).controleDiario.sistema[method](payload);
  if(r.duplicate){if(!window.confirm(r.mensagem??`O arquivo “${f.name}” já foi processado hoje para a aba “${targetSheet}”. Deseja continuar?`)){setMessage("OPERAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO NESTA ETAPA.");return false;}r=await (window as any).controleDiario.sistema[method]({...payload,confirmarDuplicidade:true});}
  if(r.duplicate)throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");
  return true;
 }
 async function execute(){
  if(validatedId!==spreadsheetId.trim()){setError("VALIDE O ID DA PLANILHA E CARREGUE AS ABAS ANTES DE CONTINUAR.");return;}
  if(!targetSheet){setError("SELECIONE A ABA DE DESTINO.");return;}
  if(!isUpdate&&(!feitas||!prazo)){setError("SELECIONE OS DOIS ARQUIVOS: MANUT FEITAS E MANUT PRAZO.");return;}
  if(isUpdate&&!abertas){setError("SELECIONE O ARQUIVO MANUT TODAS ABERTAS.");return;}
  const destination=`PLANILHA: ${spreadsheetName||validatedId}\nABA: ${targetSheet}`;
  if(!window.confirm(isUpdate?`Atualizar registros elegíveis existentes? Nenhuma linha nova será importada.\n\n${destination}`:`Executar MANUT FEITAS e depois MANUT PRAZO?\n\n${destination}`))return;
  setBusy(true);setError("");setMessage("");setCompleted(false);
  try{
   if(!isUpdate){
    const a=await run("feitas");if(!a)return;
    const b=await run("prazo");if(!b)return;
    setMessage(`IMPORTAÇÃO CONCLUÍDA. MANUT FEITAS: ${feitas?.rows.length.toLocaleString("pt-BR")} registros; MANUT PRAZO: ${prazo?.rows.length.toLocaleString("pt-BR")} registros. Aba: “${targetSheet}”.`);
   }else{
    const ok=await run("abertas");if(!ok)return;
    setMessage(`ATUALIZAÇÃO CONCLUÍDA NA ABA “${targetSheet}”.`);
   }
   localStorage.setItem("controle-diario-manut-tab",targetSheet);setCompleted(true);
  }catch(e){setError(e instanceof Error?e.message:"A OPERAÇÃO NÃO FOI CONCLUÍDA.");}
  finally{setBusy(false);}
 }
 const activeFiles=isUpdate?Boolean(abertas):Boolean(feitas&&prazo);
 return <section className="import-workspace">
  <div className="workspace-intro"><h2>Importação</h2></div>
  <div className="importer-shell">
   <header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>{isUpdate?"MANUTENÇÃO - TODAS ABERTAS":"MANUTENÇÕES - SUPORTE"}</h2><p>Compilação de Dados - Madrugada</p></header>
   <label className="importer-field"><span>ID da planilha</span><input type="text" value={spreadsheetId} onChange={e=>changeSpreadsheetId(e.target.value)} placeholder="Cole o ID da planilha de teste ou destino" disabled={busy}/></label>
   <div className="importer-controls"><button className="importer-secondary-button" type="button" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}>VALIDAR ID E CARREGAR ABAS</button></div>
   {validatedId===spreadsheetId.trim()&&validatedId&&<p className="importer-feedback">Destino validado: <strong>{spreadsheetName||validatedId}</strong></p>}
   <label className="importer-field"><span>Aba</span><select value={targetSheet} onChange={e=>{setTargetSheet(e.target.value);if(e.target.value)localStorage.setItem("controle-diario-manut-tab",e.target.value);}} disabled={busy||validatedId!==spreadsheetId.trim()||!sheets.length}><option value="">Valide o ID para carregar as abas</option>{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>
   {isUpdate?<label className="importer-field"><span>MANUT PRAZO — MANUTENÇÃO — TODAS ABERTAS</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"abertas")}/>{abertas&&<small>{abertas.name} · {abertas.rows.length.toLocaleString("pt-BR")} registros</small>}</label>:<div className="maintenance-files">
    <label className="importer-field"><span>MANUT FEITAS — MANUTENCAO - DEMANDA DO DIA</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"feitas")}/>{feitas&&<small>{feitas.name} · {feitas.rows.length.toLocaleString("pt-BR")} registros</small>}</label>
    <label className="importer-field"><span>MANUT PRAZO — MANUTENCAO - ABERTAS DO DIA</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"prazo")}/>{prazo&&<small>{prazo.name} · {prazo.rows.length.toLocaleString("pt-BR")} registros</small>}</label>
   </div>}
   <p className="importer-feedback">{isUpdate?"Use esta operação separadamente, depois das importações MANUT FEITAS e MANUT PRAZO. Ela atualiza somente registros existentes elegíveis.":"Execute MANUT FEITAS e MANUT PRAZO nesta tela. MANUT TODAS ABERTAS fica em uma tela separada e deve ser executada por último."}</p>
   <button className="importer-execute-button" disabled={busy||!activeFiles||!targetSheet||validatedId!==spreadsheetId.trim()} onClick={()=>completed&&onClose?onClose():void execute()}>{busy?"PROCESSANDO…":completed&&onClose?"ENCERRAR":isUpdate?"ATUALIZAR":"EXECUTAR"}</button>
   {error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
  </div>
 </section>;
}
