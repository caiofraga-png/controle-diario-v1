import {useState} from "react";

type SheetInfo={sheetId:number;title:string;hidden:boolean};
type SourceFile={name:string;headers:string[];rows:unknown[][];hash:string};
type Props={onClose?:()=>void;operation?:"import"|"update"};
const TEST_SPREADSHEET_ID="1IDBzTnJBXfsMbkW35xTbjSeoqghNghCn-1uPXrqDAQc";
function md5Hex(buffer:ArrayBuffer){
 const bytes=new Uint8Array(buffer),length=bytes.length,paddedLength=Math.ceil((length+9)/64)*64,data=new Uint8Array(paddedLength);data.set(bytes);data[length]=0x80;
 const bitLength=length*8,view=new DataView(data.buffer);view.setUint32(paddedLength-8,bitLength>>>0,true);view.setUint32(paddedLength-4,Math.floor(bitLength/0x100000000),true);
 let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
 const shifts=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
 const k=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*0x100000000)>>>0),words=new Int32Array(16);
 for(let offset=0;offset<paddedLength;offset+=64){for(let j=0;j<16;j++)words[j]=view.getInt32(offset+j*4,true);let a=a0,b=b0,c=c0,d=d0;
  for(let i=0;i<64;i++){let f:number,g:number;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}const sum=(a+f+k[i]+words[g])|0,rot=(sum<<shifts[i])|(sum>>>(32-shifts[i]));a=d;d=c;c=b;b=(b+rot)|0;}
  a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
 }
 return [a0,b0,c0,d0].map(n=>[0,1,2,3].map(i=>((n>>>(8*i))&255).toString(16).padStart(2,"0")).join("")).join("");
}
async function hashFile(file:File){return md5Hex(await file.arrayBuffer());}

export default function MaintenanceImporterPanel({onClose,operation="import"}:Props){
 const isUpdate=operation==="update";
 // Publicação de homologação: gravações permitidas exclusivamente na cópia de teste.
 const processingRulesApproved=true;
 const [spreadsheetId,setSpreadsheetId]=useState(()=>localStorage.getItem("controle-diario-manut-spreadsheet")??"");
 const [validatedId,setValidatedId]=useState("");
 const [spreadsheetName,setSpreadsheetName]=useState("");
 const [sheets,setSheets]=useState<SheetInfo[]>([]);
 const [targetSheet,setTargetSheet]=useState("");
 const [targetSheetFeitas,setTargetSheetFeitas]=useState("");
 const [targetSheetPrazo,setTargetSheetPrazo]=useState("");
 const [feitas,setFeitas]=useState<SourceFile|null>(null);
 const [prazo,setPrazo]=useState<SourceFile|null>(null);
 const [abertas,setAbertas]=useState<SourceFile|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[completed,setCompleted]=useState(false);
 function changeSpreadsheetId(value:string){setSpreadsheetId(value);setValidatedId("");setSpreadsheetName("");setSheets([]);setTargetSheet("");setTargetSheetFeitas("");setTargetSheetPrazo("");setError("");setMessage("");setCompleted(false);}
 async function loadSheets(){
  const id=spreadsheetId.trim();
  if(!id){setError("INFORME O ID DA PLANILHA DE DESTINO.");return;}
  if(id!==TEST_SPREADSHEET_ID){setError("ESTA VERSÃO ESTÁ RESTRITA À PLANILHA DE HOMOLOGAÇÃO. Use o ID autorizado da cópia de testes.");return;}
  setBusy(true);setError("");setMessage("");setCompleted(false);
  try{
   const r=await (window as any).controleDiario.sistema.testarSheets(id);
   const visible=(r.sheets as SheetInfo[]).filter(s=>!s.hidden);
   setSheets(visible);setValidatedId(id);setSpreadsheetName(String(r.title??""));
   localStorage.setItem("controle-diario-manut-spreadsheet",id);
   const saved=localStorage.getItem("controle-diario-manut-tab")??"";
   const savedFeitas=localStorage.getItem("controle-diario-manut-tab-feitas")??"";
   const savedPrazo=localStorage.getItem("controle-diario-manut-tab-prazo")??"";
   setTargetSheet(visible.some(s=>s.title===saved)?saved:(visible[0]?.title??""));
   setTargetSheetFeitas(visible.some(s=>s.title===savedFeitas)?savedFeitas:"");
   setTargetSheetPrazo(visible.some(s=>s.title===savedPrazo)?savedPrazo:"");
   setMessage(visible.length? `PLANILHA VALIDADA: ${String(r.title??"PLANILHA")}. ${visible.length} ABA(S) VISÍVEL(IS).`:"NENHUMA ABA VISÍVEL FOI ENCONTRADA.");
  }catch(e){setSheets([]);setValidatedId("");setSpreadsheetName("");setTargetSheet("");setTargetSheetFeitas("");setTargetSheetPrazo("");setError(e instanceof Error?e.message:"NÃO FOI POSSÍVEL VALIDAR A PLANILHA.");}
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
  const selectedSheet=kind==="feitas"?targetSheetFeitas:kind==="prazo"?targetSheetPrazo:targetSheet;
  if(!f||!selectedSheet||validatedId!==spreadsheetId.trim())return false;
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
  const prefix=kind==="feitas"?"MANUTFEITAS":kind==="prazo"?"MANUTPRAZO":"MANUTTODASABERTAS";
  const duplicateKey=`${prefix}_PROCESSADO_${day}_${selectedSheet.trim().toUpperCase()}_${f.hash}`;
  if(!confirm&&localStorage.getItem(duplicateKey)){
   if(!window.confirm(`Este arquivo já foi processado hoje para a aba “${selectedSheet}”. Deseja executá-lo novamente?`)){setMessage("OPERAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO NESTA ETAPA.");return false;}
   confirm=true;
  }
  const payload={spreadsheetId:validatedId,sheetTitle:selectedSheet,fileName:f.name,headers:f.headers,rows:f.rows,hash:f.hash,confirmarDuplicidade:confirm};
  const method=kind==="feitas"?"importarManutFeitas":kind==="prazo"?"importarManutPrazo":"atualizarManutTodasAbertas";
  let r=await (window as any).controleDiario.sistema[method](payload);
  if(r.duplicate){if(!window.confirm(r.mensagem??`O arquivo “${f.name}” já foi processado hoje para a aba “${selectedSheet}”. Deseja continuar?`)){setMessage("OPERAÇÃO CANCELADA. NENHUM DADO FOI GRAVADO NESTA ETAPA.");return false;}r=await (window as any).controleDiario.sistema[method]({...payload,confirmarDuplicidade:true});}
  if(r.duplicate)throw new Error("A VERIFICAÇÃO DE DUPLICIDADE NÃO FOI CONCLUÍDA.");
  localStorage.setItem(duplicateKey,JSON.stringify({fileName:f.name,spreadsheetId:validatedId,sheetTitle:selectedSheet,at:new Date().toISOString()}));
  return true;
 }
 async function execute(){
  if(validatedId!==spreadsheetId.trim()){setError("VALIDE O ID DA PLANILHA E CARREGUE AS ABAS ANTES DE CONTINUAR.");return;}
  if(validatedId!==TEST_SPREADSHEET_ID){setError("EXECUÇÃO PERMITIDA SOMENTE NA PLANILHA DE HOMOLOGAÇÃO.");return;}
  if(isUpdate&&!targetSheet){setError("SELECIONE A ABA DE DESTINO.");return;}
  if(!isUpdate&&(!targetSheetFeitas||!targetSheetPrazo)){setError("SELECIONE UMA ABA PARA CADA ARQUIVO: MANUT FEITAS E MANUT PRAZO.");return;}
  if(!isUpdate&&(!feitas||!prazo)){setError("SELECIONE OS DOIS ARQUIVOS: MANUT FEITAS E MANUT PRAZO.");return;}
  if(isUpdate&&!abertas){setError("SELECIONE O ARQUIVO MANUT TODAS ABERTAS.");return;}
  const destination=isUpdate?`PLANILHA: ${spreadsheetName||validatedId}\nABA: ${targetSheet}`:`PLANILHA: ${spreadsheetName||validatedId}\nMANUT FEITAS — ABA: ${targetSheetFeitas}\nMANUT PRAZO — ABA: ${targetSheetPrazo}`;
  if(!window.confirm(isUpdate?`Atualizar registros elegíveis existentes? Nenhuma linha nova será importada.\n\n${destination}`:`Executar MANUT FEITAS e depois MANUT PRAZO?\n\n${destination}`))return;
  setBusy(true);setError("");setMessage("");setCompleted(false);
  try{
   if(!isUpdate){
    const a=await run("feitas");if(!a)return;
    const b=await run("prazo");if(!b)return;
    setMessage(`IMPORTAÇÃO CONCLUÍDA. MANUT FEITAS: ${feitas?.rows.length.toLocaleString("pt-BR")} registros na aba “${targetSheetFeitas}”; MANUT PRAZO: ${prazo?.rows.length.toLocaleString("pt-BR")} registros na aba “${targetSheetPrazo}”.`);
   }else{
    const ok=await run("abertas");if(!ok)return;
    setMessage(`ATUALIZAÇÃO CONCLUÍDA NA ABA “${targetSheet}”.`);
   }
   if(isUpdate)localStorage.setItem("controle-diario-manut-tab",targetSheet);else{localStorage.setItem("controle-diario-manut-tab-feitas",targetSheetFeitas);localStorage.setItem("controle-diario-manut-tab-prazo",targetSheetPrazo);}setCompleted(true);
  }catch(e){setError(e instanceof Error?e.message:"A OPERAÇÃO NÃO FOI CONCLUÍDA.");}
  finally{setBusy(false);}
 }
 const activeFiles=isUpdate?Boolean(abertas):Boolean(feitas&&prazo);
 return <section className="import-workspace">
  <div className="workspace-intro"><h2>Importação</h2></div>
  <div className="importer-shell">
   <header className="importer-brand"><img src="./leste-logo.svg" alt="Leste"/><h2>{isUpdate?"MANUTENÇÃO - TODAS ABERTAS":"MANUTENÇÕES - SUPORTE"}</h2><p>Compilação de Dados - Madrugada</p></header>
   <div className="maintenance-spreadsheet-row"><label className="importer-field maintenance-spreadsheet-field"><span>ID da planilha</span><input type="text" value={spreadsheetId} onChange={e=>changeSpreadsheetId(e.target.value)} placeholder="Cole o ID da planilha de teste ou destino" disabled={busy}/></label><button className="maintenance-refresh-button" type="button" aria-label="Atualizar abas da planilha" title="Atualizar abas" disabled={busy||!spreadsheetId.trim()} onClick={()=>void loadSheets()}>{busy?"…":"↻"}</button></div>
   {validatedId===spreadsheetId.trim()&&validatedId&&<p className="importer-feedback">Destino validado: <strong>{spreadsheetName||validatedId}</strong></p>}
   {isUpdate&&<label className="importer-field"><span>Aba de destino</span><select value={targetSheet} onChange={e=>{setTargetSheet(e.target.value);if(e.target.value)localStorage.setItem("controle-diario-manut-tab",e.target.value);}} disabled={busy||validatedId!==spreadsheetId.trim()||!sheets.length}><option value="">Valide o ID para carregar as abas</option>{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select></label>}
   {isUpdate?<label className="importer-field"><span>MANUT PRAZO — MANUTENÇÃO — TODAS ABERTAS</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"abertas")}/>{abertas&&<small>{abertas.name} · {abertas.rows.length.toLocaleString("pt-BR")} registros</small>}</label>:<div className="maintenance-files">
    <div className="importer-field"><span>MANUT FEITAS</span><select value={targetSheetFeitas} onChange={e=>{setTargetSheetFeitas(e.target.value);if(e.target.value)localStorage.setItem("controle-diario-manut-tab-feitas",e.target.value);}} disabled={busy||validatedId!==spreadsheetId.trim()||!sheets.length}><option value="">Selecionar aba</option>{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select><div className="maintenance-file-subtitle">MANUTENCAO - DEMANDA DO DIA</div><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"feitas")}/>{feitas&&<small>{feitas.name} · {feitas.rows.length.toLocaleString("pt-BR")} registros</small>}</div>
    <div className="importer-field"><span>MANUT PRAZO</span><select value={targetSheetPrazo} onChange={e=>{setTargetSheetPrazo(e.target.value);if(e.target.value)localStorage.setItem("controle-diario-manut-tab-prazo",e.target.value);}} disabled={busy||validatedId!==spreadsheetId.trim()||!sheets.length}><option value="">Selecionar aba</option>{sheets.map(s=><option key={s.sheetId} value={s.title}>{s.title}</option>)}</select><div className="maintenance-file-subtitle">MANUTENCAO — ABERTAS DO DIA</div><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void readFile(e.target.files?.[0],"prazo")}/>{prazo&&<small>{prazo.name} · {prazo.rows.length.toLocaleString("pt-BR")} registros</small>}</div>
   </div>}
   <p className="importer-feedback" role="status">MODO DE HOMOLOGAÇÃO: esta publicação só permite gravações na cópia de testes autorizada. A planilha operacional oficial está bloqueada nesta versão.</p>
   <p className="importer-feedback">{isUpdate?"Use esta operação separadamente, depois das importações MANUT FEITAS e MANUT PRAZO. Ela atualiza somente registros existentes elegíveis.":"Execute MANUT FEITAS e MANUT PRAZO nesta tela. MANUT TODAS ABERTAS fica em uma tela separada e deve ser executada por último."}</p>
   <button className="importer-execute-button" disabled={busy||!activeFiles||(isUpdate?!targetSheet:(!targetSheetFeitas||!targetSheetPrazo))||validatedId!==spreadsheetId.trim()||!processingRulesApproved||validatedId!==TEST_SPREADSHEET_ID} onClick={()=>completed&&onClose?onClose():void execute()}>{busy?"PROCESSANDO…":!processingRulesApproved?"PROCESSAMENTO EM REVISÃO":completed&&onClose?"ENCERRAR":isUpdate?"ATUALIZAR":"EXECUTAR"}</button>
   {error&&<p className="importer-feedback error" role="alert">{error}</p>}{message&&<p className="importer-feedback" role="status">{message}</p>}
  </div>
 </section>;
}
