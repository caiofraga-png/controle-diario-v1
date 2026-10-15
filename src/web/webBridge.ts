import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { createEmail, createProfile, createTask } from "./configService";
import { buildState, obligationProgress, setObservation, toggleEmail, toggleTask } from "./taskService";
import { DataRepository } from "./dataRepository";
import { CalendarHistoryService } from "./calendarHistoryService";
import { DriveService } from "./webDriveService";
import { WebGoogleAuth, loadBootstrap, saveBootstrap } from "./webAuth";
import { pickDriveFolder } from "./webPicker";
import { WebSessionService } from "./webSessionService";

const auth=new WebGoogleAuth(); const drive=new DriveService(auth); const data=new DataRepository(drive); const calendarHistory=new CalendarHistoryService(drive); const session=new WebSessionService(drive);

const boot=()=>loadBootstrap();

/**
 * Reproduz o fluxo do importador Apps Script: envia o arquivo escolhido
 * temporariamente ao Drive, converte para Google Sheets, lê a primeira aba
 * como valores e remove os dois arquivos temporários ao final.
 */
async function prepararEstatisticas(file: File) {
 if (!file || !file.name.toLocaleLowerCase().endsWith(".xlsx")) throw new Error("SELECIONE UM ARQUIVO .XLSX.");
 const token=await auth.getAccessToken();
 const authHeaders={Authorization:`Bearer ${token}`};
 const uploadedType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
 const googleSheetType="application/vnd.google-apps.spreadsheet";
 let uploadedId="";
 let convertedId="";
 const apiError=async(response:Response,fallback:string)=>{if(response.ok)return;let message=`${fallback} (HTTP ${response.status}).`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);};
 const deleteTemporary=async(id:string)=>{if(!id)return;try{await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,{method:"DELETE",headers:authHeaders});}catch{/* limpeza best-effort */}};
 try {
  const boundary="cd_"+crypto.randomUUID().replace(/-/g,"");
  const metadata={name:`TEMP_CONTROLE_DIARIO_CONVERTIDO_${Date.now()}`,mimeType:googleSheetType};
  const bytes=await file.arrayBuffer();
  const multipart=new Blob([
   `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
   `--${boundary}\r\nContent-Type: ${uploadedType}\r\n\r\n`,
   bytes,
   `\r\n--${boundary}--`
  ]);
  const upload=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,mimeType",{method:"POST",headers:{...authHeaders,"Content-Type":`multipart/related; boundary=${boundary}`},body:multipart});
  await apiError(upload,"NÃO FOI POSSÍVEL ENVIAR TEMPORARIAMENTE O XLSX PARA CONVERSÃO");
  uploadedId=String((await upload.json()).id??"");
  if(!uploadedId)throw new Error("O GOOGLE DRIVE NÃO RETORNOU O ID DO ARQUIVO TEMPORÁRIO.");
  convertedId=uploadedId;
  uploadedId="";
  let spreadsheet:any=null,lastReadError:unknown=null;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(convertedId)}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))`,{headers:authHeaders});
    await apiError(response,"NÃO FOI POSSÍVEL ABRIR A PLANILHA TEMPORÁRIA CONVERTIDA");
    spreadsheet=await response.json();if(spreadsheet.sheets?.length)break;
   }catch(e){lastReadError=e;}
   if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*1000));
  }
  const firstSheet=spreadsheet?.sheets?.[0];
  if(!firstSheet)throw lastReadError instanceof Error?lastReadError:new Error("O ARQUIVO CONVERTIDO NÃO POSSUI ABAS.");
  const title=String(firstSheet.properties?.title??"");
  const rowCount=Math.max(1,Number(firstSheet.properties?.gridProperties?.rowCount??1));
  const columnCount=Math.max(1,Number(firstSheet.properties?.gridProperties?.columnCount??1));
  const col=(n:number)=>{let out="";for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
  const range=`'${title.replace(/'/g,"''")}'!A1:${col(columnCount)}${rowCount}`;
  const valuesResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(convertedId)}?includeGridData=true&ranges=${encodeURIComponent(range)}&fields=sheets(properties(title),data(rowData(values(effectiveValue,effectiveFormat(numberFormat),formattedValue))))`,{headers:authHeaders});
  await apiError(valuesResponse,"NÃO FOI POSSÍVEL LER OS VALORES DA PLANILHA CONVERTIDA");
  const valuesBook=await valuesResponse.json();
  const gridRows=valuesBook.sheets?.[0]?.data?.[0]?.rowData??[];
  const serialDate=(serial:number)=>new Date(Date.UTC(1899,11,30)+serial*86400000);
  const rows=gridRows.map((row:any)=> (row.values??[]).map((cell:any)=>{
   const value=cell.effectiveValue;
   if(!value)return "";
   if(value.errorValue)return String(cell.formattedValue??value.errorValue.message??"");
   if(value.numberValue!==undefined){
    const type=String(cell.effectiveFormat?.numberFormat?.type??"");
    if(["DATE","TIME","DATE_TIME"].includes(type))return serialDate(value.numberValue);
    return value.numberValue;
   }
   if(value.stringValue!==undefined)return value.stringValue;
   if(value.boolValue!==undefined)return value.boolValue;
   return "";
  }));
  while(rows.length&&rows[rows.length-1].every((v:any)=>v===""||v===null||v===undefined))rows.pop();
  const maxWidth=rows.reduce((n:number,row:any[])=>Math.max(n,row.length),0);
  for(const row of rows)while(row.length<maxWidth)row.push("");
  if(rows.length<2)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
  return {headers:(rows[0]??[]).map((v:any)=>String(v??"").trim()),rows:rows.slice(1)};
 } finally {
  await deleteTemporary(convertedId);
  await deleteTemporary(uploadedId);
 }
}
async function configureRoot(id:string){ if(!id?.trim())throw new Error("INFORME O ID DA PASTA."); const root=await drive.validateRoot(id.trim()); await drive.testConnection(root.id); await drive.ensureStructure(root.id); const status=await auth.getStatus(); saveBootstrap({drive:{pastaRaizId:root.id,contaEmail:status.email}}); await session.acquire(root.id); return {root,status}; }

export function installWebBridge(){
 const bridge:any={
  ready:true,
  sistema:{
   status:async()=>({auth:await auth.getStatus(),bootstrap:boot()}),
   autorizarGoogle:async()=>{const status=await auth.authorize();const b=boot();saveBootstrap({drive:{pastaRaizId:b.drive.pastaRaizId,contaEmail:status.email}});if(b.drive.pastaRaizId)await session.acquire(b.drive.pastaRaizId);return status;},
   definirPastaRaiz:configureRoot,
   selecionarPasta:async()=>{const cfg=await (async()=>{const c=(globalThis as any).__CONTROLE_DIARIO_CONFIG__??{};return {developerKey:String(c.googlePickerApiKey??"").trim(),accessToken:await auth.getAccessToken()};})();const id=await pickDriveFolder(cfg);return configureRoot(id);},
   testarConexao:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);return drive.testConnection(id)},
   prepararEstatisticas,
   testarSheets:async(spreadsheetId:string)=>{const id=spreadsheetId.trim();if(!id)throw new Error("INFORME O ID DA PLANILHA.");if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");const token=await auth.getAccessToken();const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,hidden))`;const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok){let message=`GOOGLE SHEETS API RETORNOU HTTP ${response.status}.`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const result=await response.json();return {spreadsheetId:id,title:String(result.properties?.title??"PLANILHA SEM TÍTULO"),sheets:(result.sheets??[]).map((s:any)=>({sheetId:Number(s.properties?.sheetId),title:String(s.properties?.title??""),hidden:Boolean(s.properties?.hidden)})).filter((s:any)=>s.title)};},
   inspecionarDestino:async(spreadsheetId:string,sheetTitle:string)=>{const id=spreadsheetId.trim();const title=sheetTitle.trim();if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");const token=await auth.getAccessToken();const quoted=`'${title.replace(/'/g,"''")}'`;const headersUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(quoted+"!1:1")}?majorDimension=ROWS`;const headersResponse=await fetch(headersUrl,{headers:{Authorization:`Bearer ${token}`}});if(!headersResponse.ok){let message=`NÃO FOI POSSÍVEL LER O CABEÇALHO DA ABA (HTTP ${headersResponse.status}).`;try{const body=await headersResponse.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const headersResult=await headersResponse.json();const headers=(headersResult.values?.[0]??[]).map((v:any)=>String(v??"").trim());const ticketIndex=headers.findIndex((v:string)=>v.trim().toLocaleUpperCase("pt-BR")==="TICKET");if(ticketIndex<0)throw new Error("A ABA DE DESTINO NÃO POSSUI UMA COLUNA TICKET NA LINHA 1.");const col=(n:number)=>{let out="";for(let x=n+1;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};const ticketRange=`${quoted}!${col(ticketIndex)}2:${col(ticketIndex)}`;const ticketsUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(ticketRange)}?majorDimension=ROWS`;const ticketsResponse=await fetch(ticketsUrl,{headers:{Authorization:`Bearer ${token}`}});if(!ticketsResponse.ok){let message=`NÃO FOI POSSÍVEL LER A COLUNA TICKET (HTTP ${ticketsResponse.status}).`;try{const body=await ticketsResponse.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);}const ticketsResult=await ticketsResponse.json();const tickets=ticketsResult.values??[];let lastTicketRow=1;for(let i=0;i<tickets.length;i++){if(String(tickets[i]?.[0]??"").trim())lastTicketRow=i+2;}return {spreadsheetId:id,sheetTitle:title,headers,lastTicketRow,headerRow:lastTicketRow+2,firstDataRow:lastTicketRow+3,ticketColumn:col(ticketIndex)};},
   importarProdutividadeSac:async(p:any)=>{
    const id=String(p.spreadsheetId??"").trim(),title=String(p.sheetTitle??"").trim(),source=String(p.source??"GERAL").trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");
    if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
    if(!["GERAL","ABERTAS"].includes(source))throw new Error("TIPO DE IMPORTAÇÃO INVÁLIDO.");
    if(!Array.isArray(p.headers)||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
    const hash=String(p.hash??"").trim();if(!/^[a-f0-9]{64}$/i.test(hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");
    const token=await auth.getAccessToken(),h={Authorization:`Bearer ${token}`};
    const apiError=async(r:Response,msg:string)=>{if(r.ok)return;let m=`${msg} (HTTP ${r.status}).`;try{const b=await r.json();if(b?.error?.message)m=b.error.message;}catch{}throw new Error(m);};
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
    const key=`PRODSAC_${source}_${day}`;
    const search=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:key}}]})});
    await apiError(search,"NÃO FOI POSSÍVEL VERIFICAR IMPORTAÇÕES ANTERIORES");
    const found=await search.json(),entries=found.matchedDeveloperMetadata??[];
    if(entries.some((x:any)=>String(x.developerMetadata?.metadataValue??"").includes(hash))&&!p.confirmarDuplicidade)return {duplicate:true};
    const bookRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))`,{headers:h});await apiError(bookRes,"NÃO FOI POSSÍVEL ABRIR A PLANILHA DE DESTINO");
    const book=await bookRes.json(),sheet=(book.sheets??[]).find((s:any)=>s.properties?.title===title);
    if(!sheet||sheet.properties?.hidden)throw new Error("A ABA DE DESTINO NÃO EXISTE OU ESTÁ OCULTA.");
    const quoted=`'${title.replace(/'/g,"''")}'`;
    const headRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(quoted+"!1:1")}?majorDimension=ROWS`,{headers:h});await apiError(headRes,"NÃO FOI POSSÍVEL LER OS CABEÇALHOS DO DESTINO");
    const destHeaders=((await headRes.json()).values?.[0]??[]).map((v:any)=>String(v??"").trim());
    const ticket=destHeaders.findIndex((v:string)=>v.trim().toLocaleUpperCase("pt-BR")==="TICKET");if(ticket<0)throw new Error("A ABA DE DESTINO NÃO POSSUI COLUNA TICKET NA LINHA 1.");
    const col=(n:number)=>{let s="";for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;};
    const ticketRange=`${quoted}!${col(ticket)}2:${col(ticket)}`;
    const ticketRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(ticketRange)}?majorDimension=ROWS`,{headers:h});await apiError(ticketRes,"NÃO FOI POSSÍVEL LER A COLUNA TICKET");
    const vals=(await ticketRes.json()).values??[];let last=1;for(let i=0;i<vals.length;i++)if(String(vals[i]?.[0]??"").trim())last=i+2;
    const headerRow=last+2,firstData=headerRow+1;
    const protectedNames=["ABERTURA","ENCERRAMENTO","TEMPO DE TRANSFERÊNCIA","TEMPO DE ENCERRAMENTO"];
    const protectedIndexes=new Set([0,1,47,48]); // A, B, AV e AW nunca recebem escrita
    const normalizeHeader=(value:any)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("pt-BR").replace(/[_-]+/g," ").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
    const sourceHeaders=p.headers.map((v:any)=>String(v??"").trim());
    const sourceNormalized=sourceHeaders.map(normalizeHeader);
    const mapped=destHeaders.map((dh:string,index:number)=>{
     const upper=dh.trim().toLocaleUpperCase("pt-BR");
     if(!dh||protectedIndexes.has(index)||protectedNames.includes(upper))return -1;
     return sourceNormalized.findIndex((sh:string)=>sh===normalizeHeader(dh));
    });
    const missing=destHeaders.filter((dh:string,i:number)=>dh&&mapped[i]===-1&&!protectedIndexes.has(i)&&!protectedNames.includes(dh.trim().toLocaleUpperCase("pt-BR")));
    const width=destHeaders.length;
    const outHeader=new Array(width).fill("");
    for(let c=0;c<destHeaders.length;c++)if(mapped[c]>=0)outHeader[c]=sourceHeaders[mapped[c]];
    const data=p.rows.map((row:any[])=>{const out=new Array(width).fill("");for(let c=0;c<destHeaders.length;c++)if(mapped[c]>=0)out[c]=row[mapped[c]]??"";return out;});
    const needed=firstData+data.length-1,gridRows=Number(sheet.properties?.gridProperties?.rowCount??1000);
    if(needed>gridRows){const add=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:sheet.properties.sheetId,dimension:"ROWS",length:needed-gridRows}}]})});await apiError(add,"NÃO FOI POSSÍVEL AMPLIAR A ABA DE DESTINO");}
    // Grava apenas blocos contíguos de colunas não protegidas; A, B, AV e AW são omitidas por completo.
    const writable:number[]=[];
    for(let c=0;c<width;c++)if(!protectedIndexes.has(c)&&!protectedNames.includes(String(destHeaders[c]??"").trim().toLocaleUpperCase("pt-BR")))writable.push(c);
    const segments:number[][]=[];
    for(const index of writable){const current=segments[segments.length-1];if(current&&index===current[current.length-1]+1)current.push(index);else segments.push([index]);}
    const valueData=segments.map(segment=>({
     range:`${quoted}!${col(segment[0])}${headerRow}:${col(segment[segment.length-1])}${needed}`,
     majorDimension:"ROWS",
     values:[outHeader,...data].map((row:any[])=>segment.map(index=>row[index]??""))
    }));
    if(valueData.length){
     const write=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data:valueData})});
     await apiError(write,"NÃO FOI POSSÍVEL GRAVAR A IMPORTAÇÃO");
    }
    const meta=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:key,metadataValue:JSON.stringify({hash,fileName:String(p.fileName??""),tab:title}),visibility:"DOCUMENT",location:{sheetId:sheet.properties.sheetId}}}}]})});await apiError(meta,"DADOS IMPORTADOS, MAS NÃO FOI POSSÍVEL REGISTRAR A DUPLICIDADE");
    return {duplicate:false,records:data.length,columns:mapped.filter((x:number)=>x>=0).length,sheetTitle:title,missingColumns:missing};
   },
   importarChatMidias:async(p:any)=>{
    const id=String(p.spreadsheetId??"").trim(),title=String(p.sheetTitle??"").trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");
    if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
    if(!Array.isArray(p.headers)||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
    const hash=String(p.hash??"").trim();if(!/^[a-f0-9]{64}$/i.test(hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");
    const token=await auth.getAccessToken(),h={Authorization:`Bearer ${token}`};
    const apiError=async(r:Response,msg:string)=>{if(r.ok)return;let m=`${msg} (HTTP ${r.status}).`;try{const b=await r.json();if(b?.error?.message)m=b.error.message;}catch{}throw new Error(m);};
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
    const duplicateKey=`CHAT_MIDIAS_ARQUIVO_${day}`;
    const search=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:duplicateKey}}]})});
    await apiError(search,"NÃO FOI POSSÍVEL VERIFICAR IMPORTAÇÕES ANTERIORES");
    const sr=await search.json(),duplicate=(sr.matchedDeveloperMetadata??[]).some((m:any)=>{try{return JSON.parse(String(m.developerMetadata?.metadataValue??"{}")).hash===hash;}catch{return false;}});
    if(duplicate&&!p.confirmarDuplicidade)return {duplicate:true,fileName:String(p.fileName??""),sheetTitle:title};
    const bookRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))`,{headers:h});await apiError(bookRes,"NÃO FOI POSSÍVEL ABRIR A PLANILHA DE DESTINO");
    const book=await bookRes.json(),sheet=(book.sheets??[]).find((s:any)=>s.properties?.title===title);
    if(!sheet)throw new Error("A ABA DE DESTINO NÃO FOI ENCONTRADA.");if(sheet.properties?.hidden)throw new Error("A ABA DE DESTINO ESTÁ OCULTA E NÃO PODE SER UTILIZADA.");
    const quote=`'${title.replace(/'/g,"''")}'`,col=(n:number)=>{let out="";for(let x=n+1;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
    const read=async(range:string)=>{const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{headers:h});await apiError(r,"NÃO FOI POSSÍVEL LER A ABA DE DESTINO");return await r.json();};
    const dest=await read(`${quote}!1:1`),destHeaders=(dest.values?.[0]??[]).map((v:any)=>String(v??"").trim());
    if(!destHeaders.length)throw new Error("A ABA DE DESTINO NÃO POSSUI CABEÇALHOS.");
    const ticket=destHeaders.findIndex((v:string)=>v.toUpperCase()==="TICKET");if(ticket<0)throw new Error('A COLUNA "TICKET" NÃO FOI ENCONTRADA NA ABA DE DESTINO.');
    const tr=await read(`${quote}!${col(ticket)}2:${col(ticket)}`),tickets=tr.values??[];let lastTicket=1;
    for(let i=tickets.length-1;i>=0;i--)if(tickets[i]?.[0]!==""&&tickets[i]?.[0]!==null&&tickets[i]?.[0]!==undefined){lastTicket=i+2;break;}
    const headerRow=lastTicket+2,firstDataRow=headerRow+1,lastDataRow=firstDataRow+p.rows.length-1,rowCount=Number(sheet.properties?.gridProperties?.rowCount??1000),needed=lastDataRow-rowCount;
    if(needed>0){const gr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:Number(sheet.properties?.sheetId),dimension:"ROWS",length:needed}}]})});await apiError(gr,"NÃO FOI POSSÍVEL AMPLIAR A ABA DE DESTINO");}
    const sourceHeaders=(p.headers as any[]).map(v=>String(v??"").trim()),sourceMap:Record<string,number>={};
    sourceHeaders.forEach((name:string,i:number)=>{if(name)sourceMap[name.toUpperCase()]=i;});
    const protectedNames=["DATA ABERTURA","DATA ENCERRAMENTO","HORA ABERTURA","HORA ENCERRAMENTO"];
    const protectedCols:Record<number,boolean>={};
    destHeaders.forEach((name:string,i:number)=>{if(protectedNames.includes(name.toUpperCase()))protectedCols[i]=true;});
    const closeTime=destHeaders.findIndex((name:string)=>name.toUpperCase()==="HORA ENCERRAMENTO");
    if(closeTime>=0)protectedCols[closeTime+1]=true;
    const width=Math.max(destHeaders.length,closeTime+2);
    while(destHeaders.length<width)destHeaders.push("");
    const missing:string[]=[],notImported:string[]=[],mapped=destHeaders.map((name:string,i:number)=>{
      if(protectedCols[i]){notImported.push(name||"[COLUNA SEM NOME - À DIREITA DE HORA ENCERRAMENTO]");return -1;}
      if(!name)return -1;
      const index=sourceMap[name.toUpperCase()];
      if(index===undefined){missing.push(name);return -1;}
      return index;
    });
    const outHeaders=destHeaders.map((name:string,i:number)=>protectedCols[i]||!name?"":mapped[i]>=0?sourceHeaders[mapped[i]]:name);
    const data=(p.rows as any[][]).map((row:any[])=>destHeaders.map((name:string,i:number)=>{
      const sourceIndex=mapped[i];if(sourceIndex<0)return "";
      let value=row?.[sourceIndex]??"";
      if(name.trim().toUpperCase()==="CHAT_ENCERRADO"&&value!==""&&value!==null&&value!==undefined){
        const formatDate=(date:Date)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(date).replace(",", "");
        if(value instanceof Date&&!Number.isNaN(value.getTime()))value=formatDate(value);
        else if(typeof value==="string"){
          const text=value.trim();
          const slash=text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
          const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
          if(slash)value=`${slash[1]}/${slash[2]}/${slash[3]} ${slash[4]??"00"}:${slash[5]??"00"}:${slash[6]??"00"}`;
          else if(iso)value=`${iso[3]}/${iso[2]}/${iso[1]} ${iso[4]}:${iso[5]}:${iso[6]??"00"}`;
          else {const parsed=new Date(text);if(!Number.isNaN(parsed.getTime()))value=formatDate(parsed);}
        }
      }
      return value;
    }));
    const matrix=[outHeaders,...data],writable:number[]=[];
    for(let i=0;i<width;i++)if(!protectedCols[i])writable.push(i);
    const segments:number[][]=[];
    for(const i of writable){const current=segments[segments.length-1];if(current&&i===current[current.length-1]+1)current.push(i);else segments.push([i]);}
    const ranges=segments.map(segment=>({range:`${quote}!${col(segment[0])}${headerRow}:${col(segment[segment.length-1])}${lastDataRow}`,majorDimension:"ROWS",values:matrix.map(row=>segment.map(index=>row[index]??""))}));
    if(ranges.length){const wr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data:ranges})});await apiError(wr,"A GRAVAÇÃO DA IMPORTAÇÃO CHAT MÍDIAS FALHOU");}
    // Finaliza em uma única chamada à API: formato e marca de duplicidade.
    // A gravação dos valores já ocorreu; falhas nesta etapa viram aviso, sem repetir a importação.
    const closeCol=destHeaders.findIndex((name:string)=>name.toUpperCase()==="CHAT_ENCERRADO");
    const finalizeRequests:any[]=[];
    if(closeCol>=0&&!protectedCols[closeCol]){
      finalizeRequests.push({repeatCell:{range:{sheetId:Number(sheet.properties?.sheetId),startRowIndex:firstDataRow-1,endRowIndex:lastDataRow,startColumnIndex:closeCol,endColumnIndex:closeCol+1},cell:{userEnteredFormat:{numberFormat:{type:"DATE_TIME",pattern:"dd/MM/yyyy HH:mm:ss"}}},fields:"userEnteredFormat.numberFormat"}});
    }
    finalizeRequests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:duplicateKey,metadataValue:JSON.stringify({hash,fileName:String(p.fileName??""),sheetTitle:title,importedAt:new Date().toISOString()}),visibility:"DOCUMENT",location:{spreadsheet:true}}}});
    const finalize=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({requests:finalizeRequests})});
    return {duplicate:false,fileName:String(p.fileName??""),sheetTitle:title,records:data.length,columns:mapped.filter((v:number,i:number)=>v>=0&&!protectedCols[i]).length,headerRow,firstDataRow,missingColumns:missing,protectedColumns:notImported,warning:mark.ok?"":"DADOS GRAVADOS, MAS NÃO FOI POSSÍVEL REGISTRAR A DUPLICIDADE."};
   },
   importarEstatisticas:async(p:any)=>{
    const id=String(p.spreadsheetId??"").trim(),title=String(p.sheetTitle??"").trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");
    if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
    if(!Array.isArray(p.headers)||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
    const token=await auth.getAccessToken(),headersAuth={Authorization:`Bearer ${token}`};
    const apiError=async(response:Response,fallback:string)=>{if(response.ok)return;let message=`${fallback} (HTTP ${response.status}).`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);};
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
    const hash=String(p.hash??"").trim();if(!/^[a-f0-9]{64}$/i.test(hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");
    const duplicateKey=`ESTATISTICAS_IMPORTADO_${day}`;
    const duplicateSearch=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:duplicateKey}}]})});
    await apiError(duplicateSearch,"NÃO FOI POSSÍVEL VERIFICAR IMPORTAÇÕES ANTERIORES");const duplicateResult=await duplicateSearch.json();
    const previous=(duplicateResult.matchedDeveloperMetadata??[]).some((m:any)=>{try{return JSON.parse(String(m.developerMetadata?.metadataValue??"{}")).hash===hash;}catch{return false;}});if(previous&&!p.confirmarDuplicidade)return {duplicate:true,fileName:String(p.fileName??""),sheetTitle:title};
    const metaResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))`,{headers:headersAuth});
    await apiError(metaResponse,"NÃO FOI POSSÍVEL CONSULTAR A PLANILHA");const meta=await metaResponse.json();
    const sheet=(meta.sheets??[]).find((s:any)=>s.properties?.title===title);if(!sheet)throw new Error("A ABA DE DESTINO NÃO FOI ENCONTRADA.");
    const rowCount=Number(sheet.properties?.gridProperties?.rowCount??1000),columnCount=Number(sheet.properties?.gridProperties?.columnCount??26);
    const quote=`'${title.replace(/'/g,"''")}'`,col=(n:number)=>{let out="";for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
    const read=async(range:string)=>{const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{headers:headersAuth});await apiError(r,"NÃO FOI POSSÍVEL LER A ABA DE DESTINO");return await r.json();};
    const destResult=await read(`${quote}!A1:${col(columnCount)}1`),destHeaders=(destResult.values?.[0]??[]).map((v:any)=>String(v??"").trim());
    const norm=(v:any)=>String(v??"").trim().toLocaleUpperCase("pt-BR");
    const map:Record<string,string>={"TICKET":"TICKET","NOME CLIENTE":"NOME_CLIENTE","SUBTIPO":"SUBTIPO","FILA ORIGINAL":"FILA_ORIGINAL","FILA ATUAL":"FILA_ATUAL","TIPO_ESTADO":"TIPO_ESTADO","CIDADE":"CIDADE","DATA ABERTURA TICKET":"TICKET_DATA_ABERTURA","DATA ULTIMA TRANSF.":"ULTIMA_TRANFERENCIA_DATA","DATA ENCERRAMENTO":"ENCERRAMENTO_DATA","RESOLUÇÃO":"resolucao_tipo","RECEBIDO POR":"ATENDENTE","ULTIMA TRANSF. ATENDENTE":"ULTIMA_TRANFERENCIA_ATENDENTE","FECHADO POR":"CLOSEDBY"};
    const protectedCols=new Set(["ABERTO E FECHADO NO MESMO DIA","SETOR","RESOLVIDO?","ALL","DATA"]);
    const sourceHeaders=(p.headers as any[]).map(v=>String(v??"").trim()),sourceIndex=new Map(sourceHeaders.map((h,i)=>[norm(h),i]));
    const ticketIndex=destHeaders.findIndex((h:string)=>norm(h)==="TICKET");if(ticketIndex<0)throw new Error("A ABA DE DESTINO NÃO POSSUI UMA COLUNA TICKET NA LINHA 1.");
    const ticketResult=await read(`${quote}!${col(ticketIndex+1)}2:${col(ticketIndex+1)}`),tickets=ticketResult.values??[];let lastTicketRow=1;
    for(let i=0;i<tickets.length;i++)if(String(tickets[i]?.[0]??"").trim())lastTicketRow=i+2;
    const headerRow=lastTicketRow+2,firstDataRow=headerRow+1,lastDataRow=firstDataRow+p.rows.length-1;
    const neededRows=lastDataRow-rowCount;
    if(neededRows>0){const insert=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:Number(sheet.properties?.sheetId),dimension:"ROWS",length:neededRows}}]})});await apiError(insert,"NÃO FOI POSSÍVEL AMPLIAR A ABA DE DESTINO");}
    const importedHeaders=Array.from({length:columnCount},(_,i)=>destHeaders[i]??"");
    for(let i=0;i<destHeaders.length;i++){
      const destinationHeader=destHeaders[i]??"",key=Object.keys(map).find(k=>norm(k)===norm(destinationHeader)),sourceName=key?map[key]:"";
      if(!destinationHeader||protectedCols.has(norm(destinationHeader))||!sourceName)continue;
      const index=sourceIndex.get(norm(sourceName)) ?? (key==="RESOLUÇÃO" ? sourceIndex.get("RESOLUCAO") : undefined);if(index===undefined)continue;
      importedHeaders[i]=key==="RESOLUÇÃO" ? "resolucao_tipo" : sourceHeaders[index];
    }
    const data:any[]=[{range:`${quote}!A${headerRow}:${col(columnCount)}${headerRow}`,values:[importedHeaders]}];
    for(let i=0;i<destHeaders.length;i++){
      const destinationHeader=destHeaders[i]??"",key=Object.keys(map).find(k=>norm(k)===norm(destinationHeader)),sourceName=key?map[key]:"";
      if(!destinationHeader||protectedCols.has(norm(destinationHeader))||!sourceName)continue;
      const index=sourceIndex.get(norm(sourceName)) ?? (key==="RESOLUÇÃO" ? sourceIndex.get("RESOLUCAO") : undefined);if(index===undefined)continue;
      data.push({range:`${quote}!${col(i+1)}${firstDataRow}:${col(i+1)}${lastDataRow}`,values:(p.rows as any[][]).map(row=>[row?.[index] instanceof Date?(row[index] as Date).toISOString().slice(0,10):row?.[index]??""])});
    }
    const write=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data})});await apiError(write,"A GRAVAÇÃO DA IMPORTAÇÃO FALHOU");
    const result=await write.json();
    const metadataResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...headersAuth,"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:duplicateKey,metadataValue:JSON.stringify({hash,fileName:String(p.fileName??""),sheetTitle:title,importedAt:new Date().toISOString(),records:p.rows.length}),visibility:"DOCUMENT",location:{spreadsheet:true}}}}]})});
    let duplicateTrackingWarning="";
    if(!metadataResponse.ok){
      let detail="";
      try{const body=await metadataResponse.json();if(body?.error?.message)detail=body.error.message;}catch{}
      duplicateTrackingWarning="OS DADOS FORAM GRAVADOS, MAS O CONTROLE DE DUPLICIDADE NÃO FOI REGISTRADO"+(detail?": "+detail:"")+".";
    }
    return {success:true,fileName:String(p.fileName??""),sheetTitle:title,records:p.rows.length,columns:data.length-1,headerRow,firstDataRow,updatedCells:Number(result.totalUpdatedCells??0),warning:duplicateTrackingWarning};
   },
   importarCallback:async(p:any)=>{
    const id=String(p.spreadsheetId??"").trim(),title=String(p.sheetTitle??"").trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA CALLBACK NÃO É VÁLIDO.");
    if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
    if(!Array.isArray(p.headers)||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("O ARQUIVO PRECISA TER CABEÇALHO E PELO MENOS UMA LINHA DE DADOS.");
    const token=await auth.getAccessToken(),authHeaders={Authorization:`Bearer ${token}`};
    const apiError=async(response:Response,fallback:string)=>{if(response.ok)return;let message=`${fallback} (HTTP ${response.status}).`;try{const body=await response.json();if(body?.error?.message)message=body.error.message;}catch{}throw new Error(message);};
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
    const hash=String(p.hash??"").trim();if(!/^[a-f0-9]{64}$/i.test(hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");
    const duplicateKey=`CALLBACK_IMPORTADO_${day}`;
    const search=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:duplicateKey}}]})});await apiError(search,"NÃO FOI POSSÍVEL VERIFICAR IMPORTAÇÕES CALLBACK ANTERIORES");
    const sr=await search.json(),duplicate=(sr.matchedDeveloperMetadata??[]).some((m:any)=>{try{const v=JSON.parse(String(m.developerMetadata?.metadataValue??"{}"));return v.hash===hash&&v.sheetTitle===title;}catch{return false;}});
    if(duplicate&&!p.confirmarDuplicidade)return {duplicate:true,fileName:String(p.fileName??""),sheetTitle:title};
    const mr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))`,{headers:authHeaders});await apiError(mr,"NÃO FOI POSSÍVEL CONSULTAR A PLANILHA CALLBACK");const meta=await mr.json(),sheet=(meta.sheets??[]).find((s:any)=>s.properties?.title===title);
    if(!sheet)throw new Error("A ABA DE DESTINO NÃO FOI ENCONTRADA.");if(sheet.properties?.hidden)throw new Error("A ABA DE DESTINO ESTÁ OCULTA E NÃO PODE SER UTILIZADA.");
    const quote=`'${title.replace(/'/g,"''")}'`,col=(n:number)=>{let out="";for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
    const read=async(range:string)=>{const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{headers:authHeaders});await apiError(r,"NÃO FOI POSSÍVEL LER A ABA CALLBACK");return await r.json();};
    const dest=await read(`${quote}!1:1`),destHeaders=(dest.values?.[0]??[]).map((v:any)=>String(v??"").trim());if(!destHeaders.length)throw new Error("A ABA DE DESTINO NÃO POSSUI CABEÇALHOS.");
    const ticket=destHeaders.findIndex((h:string)=>h.toUpperCase()==="TICKET");if(ticket<0)throw new Error('A COLUNA "TICKET" NÃO FOI ENCONTRADA NA ABA DE DESTINO.');
    const tr=await read(`${quote}!${col(ticket+1)}2:${col(ticket+1)}`),tickets=tr.values??[];let lastTicket=1;for(let i=tickets.length-1;i>=0;i--){if(tickets[i]?.[0]!==""&&tickets[i]?.[0]!==null&&tickets[i]?.[0]!==undefined){lastTicket=i+2;break;}}
    const headerRow=lastTicket+2,firstDataRow=headerRow+1,lastDataRow=firstDataRow+p.rows.length-1,rowCount=Number(sheet.properties?.gridProperties?.rowCount??1000),needed=lastDataRow-rowCount;
    if(needed>0){const gr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:Number(sheet.properties?.sheetId),dimension:"ROWS",length:needed}}]})});await apiError(gr,"NÃO FOI POSSÍVEL AMPLIAR A ABA CALLBACK");}
    const sourceHeaders=(p.headers as any[]).map(v=>String(v??"").trim()),sourceMap:Record<string,number>={};sourceHeaders.forEach((h:string,i:number)=>{if(h!=="")sourceMap[h.toUpperCase()]=i;});
    const protectedCols=["DATA","TEMPO TRANSFERENCIA","TEMPO DESIGNADO"],missing:string[]=[],importHeaders=destHeaders.map((h:string)=>{if(!h)return "";if(protectedCols.includes(h))return h;const idx=sourceMap[h.toUpperCase()];return idx===undefined?h:sourceHeaders[idx];});
    const data:any[]=[{range:`${quote}!A${headerRow}:${col(destHeaders.length)}${headerRow}`,values:[importHeaders]}];let columns=0;
    for(let c=0;c<destHeaders.length;c++){const h=destHeaders[c];if(!h||protectedCols.includes(h))continue;const idx=sourceMap[h.toUpperCase()];if(idx===undefined){missing.push(h);continue;}data.push({range:`${quote}!${col(c+1)}${firstDataRow}:${col(c+1)}${lastDataRow}`,values:(p.rows as any[][]).map(row=>{const v=row?.[idx];return [v instanceof Date?v.toISOString():v??""];})});columns++;}
    const wr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data})});await apiError(wr,"A GRAVAÇÃO DA IMPORTAÇÃO CALLBACK FALHOU");const written=await wr.json();
    const mark=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:duplicateKey,metadataValue:JSON.stringify({hash,fileName:String(p.fileName??""),sheetTitle:title,importedAt:new Date().toISOString(),records:p.rows.length}),visibility:"DOCUMENT",location:{spreadsheet:true}}}}]})});
    return {success:true,fileName:String(p.fileName??""),sheetTitle:title,records:p.rows.length,columns,headerRow,firstDataRow,updatedCells:Number(written.totalUpdatedCells??0),missingColumns:missing,warning:mark.ok?"":"DADOS GRAVADOS, MAS NÃO FOI POSSÍVEL REGISTRAR A DUPLICIDADE."};
   }
  },
  dados:{
   carregar:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return data.load(id);},
   salvarEstado:async(estado:EstadoAtual|null)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCurrentState(id,estado);return true;},
   salvarCalendario:async(calendario:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCalendar(id,calendario);return true;}
  },
  tarefas:{
   iniciar:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(loaded.estado)throw new Error("JÁ EXISTE UM EXPEDIENTE EM PRODUÇÃO.");const calendar=loaded.calendario.datas.find(d=>d.data===p.data);if(calendar?.folga)throw new Error("ESTA DATA ESTÁ MARCADA COMO FOLGA.");const state=buildState(loaded,p.data,p.perfilId);if(!state.tarefas.length&&!state.emailsGlobais.length)throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.\nAdicione tarefas ou utilize outro perfil.");await data.saveCurrentState(id,state);return state;},
   trocarPerfil:async(profileId:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const next=buildState(loaded,loaded.estado.data,profileId);if(!next.tarefas.length&&!next.emailsGlobais.length)throw new Error("ESTE PERFIL NÃO POSSUI OBRIGAÇÕES.");const doneTasks=new Map(loaded.estado.tarefas.map(t=>[t.id,t.concluida]));const doneEmails=new Map<string,boolean>();for(const e of loaded.estado.emailsGlobais)doneEmails.set(e.id,e.concluido);for(const t of loaded.estado.tarefas)for(const e of t.emailsVinculados)doneEmails.set(e.id,e.concluido);for(const t of next.tarefas){if(doneTasks.has(t.id))t.concluida=Boolean(doneTasks.get(t.id));for(const e of t.emailsVinculados)if(doneEmails.has(e.id))e.concluido=Boolean(doneEmails.get(e.id));}for(const e of next.emailsGlobais)if(doneEmails.has(e.id))e.concluido=Boolean(doneEmails.get(e.id));next.observacao=loaded.estado.observacao;next.criadoEm=loaded.estado.criadoEm;next.ultimaAlteracao=new Date().toISOString();await data.saveCurrentState(id,next);return next;},
   marcar:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const state=p.tipo==="tarefa"?toggleTask(loaded.estado,p.id,p.concluido):toggleEmail(loaded.estado,p.id,p.concluido);await data.saveCurrentState(id,state);return {state,progress:obligationProgress(state)};},
   observacao:async(value:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const state=setObservation(loaded.estado,value);await data.saveCurrentState(id,state);return state;},
   concluir:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);if(!loaded.estado)throw new Error("NÃO HÁ EXPEDIENTE EM PRODUÇÃO.");const progress=data.progress(loaded.estado);if(progress.total===0||progress.done!==progress.total)throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");return data.completeState(id,loaded.estado,new Date().toISOString());},
   abandonar:async()=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveCurrentState(id,null);return true;}
  },
  config:{
   salvar:async(config:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);await data.saveConfigurationBundle(id,config);return data.load(id);},
   salvarTarefa:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const next=JSON.parse(JSON.stringify(loaded.configuracao));const task=next.tarefas.tarefas.find((x:any)=>x.id===p.id);if(!task)throw new Error("TAREFA NÃO ENCONTRADA.");if(p.hasOwnProperty("criacao"))task.criacao=String(p.criacao??"");if(p.hasOwnProperty("roteiro"))task.roteiro=JSON.parse(JSON.stringify(p.roteiro));await data.saveConfiguration(id,"tarefas",next.tarefas);const current=await data.load(id);if(current.estado){const updated=JSON.parse(JSON.stringify(current.estado));const activeTask=updated.tarefas.find((x:any)=>x.id===p.id);if(activeTask){if(p.hasOwnProperty("criacao"))activeTask.criacao=task.criacao;if(p.hasOwnProperty("roteiro"))activeTask.roteiro=JSON.parse(JSON.stringify(task.roteiro));updated.ultimaAlteracao=new Date().toISOString();await data.saveCurrentState(id,updated);}}return data.load(id);},
   novaTarefa:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const task=createTask(loaded.configuracao,input);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.tarefas.tarefas.push(task);await data.saveConfiguration(id,"tarefas",next.tarefas);return task;},
   novoPerfil:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const profile=createProfile(loaded.configuracao,input.nome,input.tarefas);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.perfis.perfis.push(profile);next.layout.ordemPerfis.push(profile.id);next.layout.ordemTarefas[profile.id]=profile.tarefas.slice();await data.saveConfigurationBundle(id,next);return profile;},
   novoEmail:async(input:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const email=createEmail(loaded.configuracao,input);const next=JSON.parse(JSON.stringify(loaded.configuracao));next.email.emails.push(email);if(input.global)next.email.emailsGlobais.push(email.id);await data.saveConfigurationBundle(id,next);return email;}
  },
  calendario:{
   mes:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.month(id,p.year,p.month);},
   salvarData:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);const loaded=await data.load(id);const next=loaded.calendario.datas.filter(d=>d.data!==p.data);if(p.folga||p.feriado)next.push({data:p.data,folga:p.folga,feriado:p.feriado});next.sort((a,b)=>a.data.localeCompare(b.data));const calendario={schemaVersion:1 as const,datas:next};await data.saveCalendar(id,calendario);return calendario;}
  },
  historico:{
   versoes:(date:string)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.versions(id,date);},
   ler:(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");return calendarHistory.readVersion(id,p.date,p.versao);},
   errata:async(p:any)=>{const id=boot().drive.pastaRaizId;if(!id)throw new Error("NENHUMA PASTA RAIZ FOI CONFIGURADA.");await session.assertOwner(id);return calendarHistory.saveErrata(id,p.source,p.edited);}
  },
  picker:{getConfig:async()=>{const clientId=((globalThis as any).__CONTROLE_DIARIO_CONFIG__?.googleClientId??"").trim();const developerKey=((globalThis as any).__CONTROLE_DIARIO_CONFIG__?.googlePickerApiKey??"").trim();return {clientId,developerKey,accessToken:await auth.getAccessToken()};},complete:()=>{},cancel:()=>{}}
 };
 (window as any).controleDiario=bridge;
}
