type Payload = { spreadsheetId:string; sheetTitle:string; fileName:string; headers:string[]; rows:unknown[][]; hash:string; confirmarDuplicidade?:boolean };
const TZ="America/Sao_Paulo";
const norm=(v:unknown)=>String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const quote=(v:string)=>"'"+v.replace(/'/g,"''")+"'";
const sheetValue=(v:unknown)=>v instanceof Date?v.getTime()/86400000+25569:v??"";
const col=(n:number)=>{let s="";for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;};
const FEITAS_MAP:Record<string,string>={"NOME":"nome_cli","CODIGO":"codcli","SUBTIPO":"subtipo","CIDADE":"cidade","BAIRRO":"bairro","TECH":"tecnologia","ATIVIDADE CRIADA POR":"atividade_criada_por","DATA ATIV. CRIADA":"atividade_criada_em","DATA DA VISITA/TICKET":"data_visita","RESOLUÇÃO DA VISITA":"motivo_visita","DESCONTO":"desconto","VISITAS CANCELADAS":"visitas_canceladas","PREF. START":"priorityStart","PREF. END":"priorityEnd","TICKET DA VISITA":"ticket"};
const PRAZO_MAP:Record<string,string>={"NOME":"nome_cli","CODIGO":"codcli","FILA ATUAL":"fila_atual","SUBTIPO":"subtipo","CIDADE":"cidade","BAIRRO":"bairro","TECH":"tecnologia","ATIVIDADE CRIADA POR":"atividade_criada_por","DATA ATIV. CRIADA":"atividade_criada_em","DATA DA VISITA/TICKET":"data_visita","ESTADO ATIVIDADE":"estado_atividade","RESOLUÇÃO DA VISITA":"motivo_visita","DESCONTO":"desconto","VISITAS CANCELADAS":"visitas_canceladas","PREF. START":"priorityStart","PREF. END":"priorityEnd","TICKET DA VISITA":"ticket"};
const FEITAS_PROTECTED=["MEIO DE CONTATO","SETOR","DIAS Ñ UTEIS","HORAS DIAS Ñ UTEIS","TEMPO REAL (ATÉ)","TEMPO TOTAL","SLA","STATUS","TENT. DE VISITA - 1º OS","TENT. DE VISITA - EM 3 OS","CONV. HORAS - REAIS","T. TOTAL - 1º OS","T. TOTAL - 2º OS","T. TOTAL - 3º OS","PREF. START/END"];
const PRAZO_PROTECTED=[...FEITAS_PROTECTED,"DATA DA VISITA/TICKET","RESOLUÇÃO DA VISITA","DESCONTO"];
const CANCEL=["MOTIVO DO CANCELAMENTO - 1º OS","DATA/HORA - 1º OS","MOTIVO DO CANCELAMENTO - 2º","DATA/HORA - 2º OS","MOTIVO DO CANCELAMENTO - 3º - ULTIMA OS","DATA/HORA - 3º OS"];
const formatCancelDate=(raw:string)=>{
 const br=raw.match(/(\d{2}\/\d{2}\/\d{4})(?:\s+|T)(\d{2}:\d{2}(?::\d{2})?)/);
 if(!br)return "";
 return br[1]+" "+(br[2].length===5?br[2]+":00":br[2]);
};
const cancelValues=(value:unknown)=>{
 const out=["","","","","",""];const text=String(value??"").trim();if(!text)return out;
 const events=text.split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
 const rx=/(\d{2}\/\d{2}\/\d{4})(?:\s+|T)(\d{2}:\d{2}(?::\d{2})?)/;
 if(!events.some(event=>rx.test(event))){out[0]=text;return out;}
 const selected=events.length<=3?events:[events[0],events[events.length-2],events[events.length-1]];
 selected.forEach((event,i)=>{const m=event.match(rx);if(m){out[i*2]=event.replace(m[0],"").trim();out[i*2+1]=formatCancelDate(m[0]);}else out[i*2]=event;});
 return out;
};

export function createMaintenanceService(getToken:()=>Promise<string>){
 async function api(url:string,init:RequestInit={},label="ERRO NA API GOOGLE"){const token=await getToken();const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...(init.headers||{})}});if(!r.ok){let msg=`${label} (HTTP ${r.status}).`;try{const b=await r.json();if(b?.error?.message)msg=b.error.message;}catch{}throw new Error(msg);}return r;}
 async function book(id:string){return (await (await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))`,{},"NÃO FOI POSSÍVEL ABRIR A PLANILHA DE DESTINO")).json());}
 async function values(id:string,range:string){return (await (await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{},"NÃO FOI POSSÍVEL LER A ABA DE DESTINO")).json()).values??[];}
 async function metadata(id:string,key:string){return (await (await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:key}}]})},"NÃO FOI POSSÍVEL VERIFICAR DUPLICIDADE")).json()).matchedDeveloperMetadata??[];}
 async function mark(id:string,key:string,p:Payload,title:string){return api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:key,metadataValue:JSON.stringify({hash:p.hash,fileName:p.fileName,sheetTitle:title,at:new Date().toISOString()}),visibility:"DOCUMENT",location:{spreadsheet:true}}}}]})},"NÃO FOI POSSÍVEL REGISTRAR A DUPLICIDADE");}
 async function validate(p:Payload){const id=p.spreadsheetId.trim(),title=p.sheetTitle.trim();if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");if(!p.fileName.toLowerCase().endsWith(".xlsx")||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("SELECIONE UM ARQUIVO XLSX COM DADOS.");if(!/^[a-f0-9]{32}$/i.test(p.hash))throw new Error("NÃO FOI POSSÍVEL VALIDAR O ARQUIVO SELECIONADO.");const b=await book(id),s=(b.sheets??[]).find((x:any)=>x.properties?.title===title);if(!s||s.properties?.hidden)throw new Error("A ABA DE DESTINO NÃO EXISTE OU ESTÁ OCULTA.");return {id,title,s};}
 async function importMaintenance(p:Payload,kind:"feitas"|"prazo"){
  const {id,title,s}=await validate(p),day=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
  const key=`MANUT${kind==="feitas"?"FEITAS":"PRAZO"}_PROCESSADO_${day}_${title.trim().toUpperCase()}_${p.hash}`;
  const previous=await metadata(id,key);if(previous.length&&!p.confirmarDuplicidade)return {duplicate:true,fileName:p.fileName,sheetTitle:title};
  const destRows=await values(id,`${quote(title)}!1:1`),destHeaders:string[]=(destRows[0]??[]).map((v:any)=>String(v??"").trim());if(!destHeaders.length)throw new Error("A ABA DE DESTINO NÃO POSSUI CABEÇALHOS.");
  const sourceHeaders=p.headers.map(v=>String(v??"").trim()),sourceMap:Record<string,number>={};sourceHeaders.forEach((h,i)=>{const k=norm(h);if(k)sourceMap[k]=i;});
  const map=kind==="feitas"?FEITAS_MAP:PRAZO_MAP,protectedNames=(kind==="feitas"?FEITAS_PROTECTED:PRAZO_PROTECTED).map(norm),statusColumn=kind==="feitas"?16:18;
  const ticketIndex=destHeaders.findIndex(h=>norm(h)==="TICKET DA VISITA");if(ticketIndex<0)throw new Error('A COLUNA "TICKET DA VISITA" NÃO FOI ENCONTRADA NA ABA DE DESTINO.');
  const rowCount=Math.max(2,Number(s.properties?.gridProperties?.rowCount??1000)),ticketValues=await values(id,`${quote(title)}!${col(ticketIndex+1)}2:${col(ticketIndex+1)}${rowCount}`);
  let lastTicketRow=1;for(let i=ticketValues.length-1;i>=0;i--)if(ticketValues[i]?.[0]!==""&&ticketValues[i]?.[0]!==null&&ticketValues[i]?.[0]!==undefined){lastTicketRow=i+2;break;}
  const headerRow=lastTicketRow+2,firstData=headerRow+1,lastData=firstData+p.rows.length-1,needed=lastData-rowCount;
  if(needed>0)await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests:[{appendDimension:{sheetId:Number(s.properties.sheetId),dimension:"ROWS",length:needed}}]})},"NÃO FOI POSSÍVEL AMPLIAR A ABA DE DESTINO");
  const mappedHeaders=destHeaders.map((h,i)=>{if(i+1===statusColumn||norm(h)==="STATUS"||protectedNames.includes(norm(h))||!h)return h;const source=map[h]??h;const idx=sourceMap[norm(source)];return idx===undefined?h:sourceHeaders[idx];});
  const outputHeaders=destHeaders.map((h,i)=>{if(i+1===statusColumn||norm(h)==="STATUS"||!h)return null;return protectedNames.includes(norm(h))?h:(mappedHeaders[i]??"");});
  const missing:string[]=[],requests:any[]=[];
  const add=(column:number,values:unknown[])=>{requests.push({range:`${quote(title)}!${col(column+1)}${firstData}:${col(column+1)}${lastData}`,majorDimension:"ROWS",values:values.map(v=>[sheetValue(v)])});};
  for(let c=0;c<destHeaders.length;c++){
   const h=destHeaders[c],n=norm(h);if(!h||c+1===statusColumn||n==="STATUS"||protectedNames.includes(n))continue;
   if(CANCEL.some(x=>norm(x)===n)){
    const mi=sourceMap[norm("motivo_cancel")];if(mi===undefined){missing.push(h);continue;}const idx=CANCEL.findIndex(x=>norm(x)===n);
    add(c,p.rows.map(row=>cancelValues(row[mi])[idx]));continue;
   }
   const source=map[h]??h,si=sourceMap[norm(source)];if(si===undefined){if(map[h])missing.push(h);continue;}add(c,p.rows.map(row=>{let value=row?.[si]??"";if(n===norm("BAIRRO")&&value!==""&&value!==null&&value!==undefined)value=kind==="prazo"?String(value).trim().toUpperCase():String(value).toUpperCase();return value;}));
  }
  const headerRequests:any[]=[];for(let c=0;c<destHeaders.length;c++)if(c+1!==statusColumn&&norm(destHeaders[c])!=="STATUS"){headerRequests.push({range:`${quote(title)}!${col(c+1)}${headerRow}`,values:[[outputHeaders[c]??""]]});}
  const all=[...headerRequests,...requests];if(all.length)await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data:all})},"A GRAVAÇÃO DO IMPORTADOR DE MANUTENÇÃO FALHOU");
  const dateCols=destHeaders.map((h,i)=>({h:norm(h),i})).filter(x=>["DATA ATIV. CRIADA","DATA DA VISITA/TICKET"].includes(x.h)&&x.i+1!==statusColumn&&!protectedNames.includes(x.h));
  if(dateCols.length)await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests:dateCols.map(x=>({repeatCell:{range:{sheetId:Number(s.properties.sheetId),startRowIndex:firstData-1,endRowIndex:lastData,startColumnIndex:x.i,endColumnIndex:x.i+1},cell:{userEnteredFormat:{numberFormat:{type:"DATE",pattern:"dd/MM/yyyy"}}},fields:"userEnteredFormat.numberFormat"}}))})},"NÃO FOI POSSÍVEL FORMATAR AS COLUNAS DE DATA");
  await mark(id,key,p,title);
  return {duplicate:false,fileName:p.fileName,sheetTitle:title,records:p.rows.length,columns:requests.length,headerRow,firstDataRow:firstData,missingColumns:missing};
 }
 async function updateAllOpen(p:Payload){
  const {id,title,s}=await validate(p),day=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
  const key=`MANUTTODASABERTAS_PROCESSADO_${day}_${title.trim().toUpperCase()}_${p.hash}`,previous=await metadata(id,key);if(previous.length&&!p.confirmarDuplicidade)return {duplicate:true,fileName:p.fileName,sheetTitle:title};
  const srcHeaders=p.headers.map(v=>String(v??"").trim()),srcMap:Record<string,number>={};srcHeaders.forEach((h,i)=>{if(norm(h))srcMap[norm(h)]=i;});
  const required=["ticket","fila_atual","estado_atividade","visitas_canceladas","priorityStart","priorityEnd","motivo_cancel"];const missingSrc=required.filter(h=>srcMap[norm(h)]===undefined);if(missingSrc.length)throw new Error("CABEÇALHOS AUSENTES NO ARQUIVO: "+missingSrc.join(", "));
  const countRows=Math.max(2,Number(s.properties?.gridProperties?.rowCount??1000)),width=Math.max(1,Number(s.properties?.gridProperties?.columnCount??26));
  const header=await values(id,`${quote(title)}!A1:${col(width)}1`),dh:string[]=(header[0]??[]).map((v:any)=>String(v??"").trim()),idx=(name:string)=>{let found=-1;dh.forEach((h:string,i:number)=>{if(norm(h)===norm(name))found=i;});return found;};
  const ticketCol=idx("TICKET DA VISITA"),statusCol=idx("STATUS");if(ticketCol<0||statusCol<0)throw new Error('A ABA PRECISA CONTER "TICKET DA VISITA" E "STATUS".');
  const targetNames=["FILA ATUAL","ESTADO ATIVIDADE","VISITAS CANCELADAS","PREF. START","PREF. END",...CANCEL];const targetCols=targetNames.map(n=>idx(n));const absent=targetNames.filter((n,i)=>targetCols[i]<0);if(absent.length)throw new Error("COLUNAS AUSENTES NA ABA DE DESTINO: "+absent.join(", "));
  const columnsToRead=Array.from(new Set([ticketCol,statusCol,...targetCols]));
  const columnData=await Promise.all(columnsToRead.map(c=>values(id,`${quote(title)}!${col(c+1)}2:${col(c+1)}${countRows}`)));
  const byColumn=new Map<number,any[][]>();columnsToRead.forEach((c,i)=>byColumn.set(c,columnData[i] as any[][]));
  const ticketValues=byColumn.get(ticketCol)??[],statusValues=byColumn.get(statusCol)??[];
  const destIndex=new Map<string,number>();for(let i=0;i<ticketValues.length;i++){const t=String(ticketValues[i]?.[0]??"").trim();if(t&&!destIndex.has(t))destIndex.set(t,i+2);}
  const updates:any[]=[],counts={updated:0,notFound:0,empty:0,skippedStatus:0};
  for(const row of p.rows){const raw=row?.[srcMap[norm("ticket")]],ticket=String(raw??"").trim();if(!ticket){counts.empty++;continue;}const sheetRow=destIndex.get(ticket);if(sheetRow===undefined){counts.notFound++;continue;}const offset=sheetRow-2;if(String(statusValues[offset]?.[0]??"").trim()!=="🕒"){counts.skippedStatus++;continue;}
   const vals=[row[srcMap[norm("fila_atual")]],row[srcMap[norm("estado_atividade")]],row[srcMap[norm("visitas_canceladas")]],row[srcMap[norm("priorityStart")]],row[srcMap[norm("priorityEnd")]],...cancelValues(row[srcMap[norm("motivo_cancel")]])];
   vals.forEach((v,i)=>updates.push({range:`${quote(title)}!${col(targetCols[i]+1)}${sheetRow}`,values:[[sheetValue(v)]]}));counts.updated++;
  }
  for(let i=0;i<updates.length;i+=500){await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data:updates.slice(i,i+500)})},"A ATUALIZAÇÃO MANUT TODAS ABERTAS FALHOU");}
  await mark(id,key,p,title);return {duplicate:false,fileName:p.fileName,sheetTitle:title,...counts};
 }
 return { importarManutFeitas:(p:Payload)=>importMaintenance(p,"feitas"), importarManutPrazo:(p:Payload)=>importMaintenance(p,"prazo"), atualizarManutTodasAbertas:updateAllOpen };
}
