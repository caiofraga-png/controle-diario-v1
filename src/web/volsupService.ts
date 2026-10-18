type Payload = { spreadsheetId:string; sheetTitle:string; fileName:string; headers:string[]; rows:unknown[][]; hash:string; confirmarDuplicidade?:boolean };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const norm = (v:unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").toUpperCase();
const col = (n:number) => { let s=""; for(let x=n+1;x>0;x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s; };
const quote = (s:string) => "'" + s.replace(/'/g,"''") + "'";
function count(rows:unknown[][], headers:string[], includeFallback:boolean) {
 const map:Record<string,number>={}; headers.forEach((h,i)=>{const k=norm(h);if(k && map[k]===undefined)map[k]=i;});
 const state=map.ESTADO, subtype=map.SUBTIPO, title=map.TITLE, ticket=map.TICKET, typeState=map.TIPO_ESTADO;
 if(state===undefined||subtype===undefined||title===undefined) throw new Error('O arquivo precisa conter as colunas "estado", "subtipo" e "title".');
 if(!includeFallback&&(ticket===undefined||typeState===undefined)) throw new Error('O arquivo VOLUMETRIA SUPORTE precisa conter também as colunas "ticket" e "tipo_estado" para gerar a ANÁLISE ROUTETHIS.');
 const open:Record<string,{subtipo:string;quantidade:number}>={}, closed:Record<string,{subtipo:string;quantidade:number}>={};
 const osc:any[]=[], incon:any[]=[];
 for(const row of rows) {
  const estado=norm(row[state]); const group=estado==="ABERTO"?"open":(["ENCERRADO COM SUCESSO","ENCERRADO SEM SUCESSO"].includes(estado)?"closed":"");
  const raw=String(row[subtype]??"").trim(), st=raw || (includeFallback ? "(" + String(row[title]??"").trim() + ")" : "(" + String(row[title]??"").trim() + ")");
  if(group){const target=group==="open"?open:closed, key=norm(st);if(!target[key])target[key]={subtipo:st,quantidade:0};target[key].quantidade++;}
  if(!includeFallback) {
   const subtypeKey=norm(raw), ts=norm(row[typeState]);
   if(subtypeKey==="OSCILACAO/INTERMITENCIA")osc.push({ticket:row[ticket]??"",open:ts==="OPEN"});
   if(subtypeKey==="INCONFORMIDADE DE VELOCIDADE")incon.push({ticket:row[ticket]??"",open:ts==="OPEN"});
  }
 }
 const sort=(x:Record<string,{subtipo:string;quantidade:number}>)=>Object.values(x).sort((a,b)=>b.quantidade-a.quantidade||norm(a.subtipo).localeCompare(norm(b.subtipo)));
 return {open:sort(open),closed:sort(closed),osc,incon};
}
export function createVolSupService(getToken:()=>Promise<string>) {
 async function api(url:string, init:RequestInit={}, fallback="ERRO NA API GOOGLE") {
  const token=await getToken(); const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...(init.headers||{})}});
  if(!r.ok){let m=`${fallback} (HTTP ${r.status}).`;try{const b=await r.json();if(b?.error?.message)m=b.error.message;}catch{}throw new Error(m);}
  return r;
 }
 async function read(id:string, range:string) {
  const r=await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,{},"NÃO FOI POSSÍVEL LER A PLANILHA");
  return (await r.json()).values??[];
 }
 async function metadata(id:string, key:string) {
  const r=await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/developerMetadata:search`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:key}}]})},"NÃO FOI POSSÍVEL VERIFICAR DUPLICIDADE");
  return (await r.json()).matchedDeveloperMetadata??[];
 }
 async function importData(p:Payload, media:boolean) {
  const id=p.spreadsheetId.trim(), title=p.sheetTitle.trim();
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("O ID DA PLANILHA NÃO É VÁLIDO.");
  if(!title)throw new Error("SELECIONE A ABA DE DESTINO.");
  if(!p.fileName.toLowerCase().endsWith(".xlsx")||!Array.isArray(p.rows)||p.rows.length<1)throw new Error("SELECIONE UM ARQUIVO XLSX COM DADOS.");
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"");
  const key=media?`VOLSUPMID_PROCESSADO_${norm(title)}`:`VOLSUP_PROCESSADO_${day}_${norm(title)}`;
  const previous=await metadata(id,key);
  const duplicate=previous.some((m:any)=>{try{return JSON.parse(String(m.developerMetadata?.metadataValue??"{}")).hash===p.hash;}catch{return false;}});
  if(duplicate&&!p.confirmarDuplicidade)return {duplicate:true,fileName:p.fileName,sheetTitle:title};
  const bookR=await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))`,{},"NÃO FOI POSSÍVEL ABRIR A PLANILHA DE DESTINO");
  const book=await bookR.json(), sheet=(book.sheets??[]).find((s:any)=>s.properties?.title===title);
  if(!sheet||sheet.properties?.hidden)throw new Error("A ABA DE DESTINO NÃO EXISTE OU ESTÁ OCULTA.");
  const values=await read(id,`${quote(title)}!A1:${col(Math.max(1,Number(sheet.properties?.gridProperties?.columnCount??26))-1)}${Math.max(1,Number(sheet.properties?.gridProperties?.rowCount??1000))}`);
  if(!values.length)throw new Error("A aba de destino está vazia.");
  const data=count(p.rows,p.headers,media);
  const normalized=values.map((r:any[])=>r.map(norm));
  const find=(text:string)=>{for(let r=0;r<normalized.length;r++)for(let c=0;c<normalized[r].length;c++)if(normalized[r][c]===norm(text))return {r,c};return null;};
  const writes:any[]=[];
  const addCol=(column:number,start:number,vals:unknown[])=>{if(vals.length)writes.push({range:`${quote(title)}!${col(column)}${start}:${col(column)}${start+vals.length-1}`,majorDimension:"ROWS",values:vals.map(v=>[v??""])});};
  const addPair=(block:any,list:any[])=>{if(list.length>block.capacity)throw new Error(`A lista possui ${list.length} subtipos, mas há somente ${block.capacity} linhas disponíveis.`);addCol(block.subtypeCol-1,block.start,list.map(x=>x.subtipo));addCol(block.qtyCol-1,block.start,list.map(x=>x.quantidade));};
  if(media) {
   let headerRow=-1;
   for(let r=0;r<normalized.length;r++) {
    const hasMidias=normalized[r].some((v:string)=>v.includes("MIDIAS"));
    if(!hasMidias)continue;
    for(let h=r+1;h<=Math.min(normalized.length-1,r+10);h++) {
     const row=normalized[h]??[];
     if(row[0]?.startsWith("SUBTIPO")&&row[1]?.startsWith("QTD")&&row[5]?.startsWith("SUBTIPO")&&row[6]?.startsWith("QTD")){headerRow=h;break;}
    }
    if(headerRow>=0)break;
   }
   if(headerRow<0)throw new Error("Não foi possível localizar o título MIDIAS e os cabeçalhos SUBTIPO/QTD nas colunas A/B e F/G.");
   const start=headerRow+2, totalA=normalized.findIndex((r:any[],i:number)=>i>=start-1&&r[0]?.startsWith("TOTAL")), totalC=normalized.findIndex((r:any[],i:number)=>i>=start-1&&r[5]?.startsWith("TOTAL"));
   if(totalA<0||totalC<0)throw new Error("O bloco MIDIAS não possui os dois marcadores TOTAL abaixo dos cabeçalhos.");
   addPair({subtypeCol:1,qtyCol:2,start,capacity:totalA+1-start},data.open);
   addPair({subtypeCol:6,qtyCol:7,start,capacity:totalC+1-start},data.closed);
  } else {
   const geral=find("GERAL");if(!geral)throw new Error('Não foi possível localizar "GERAL".');
   const opened=normalized.flatMap((r:any[],ri:number)=>r.map((v:string,ci:number)=>v==="ATENDIMENTOS ABERTOS"&&ri>=geral.r?{r:ri,c:ci}:null).filter(Boolean))[0] as any;
   const closed=normalized.flatMap((r:any[],ri:number)=>r.map((v:string,ci:number)=>v==="ATENDIMENTOS ENCERRADOS"&&ri>=geral.r?{r:ri,c:ci}:null).filter(Boolean))[0] as any;
   if(!opened||!closed)throw new Error("Não foi possível localizar os blocos ATENDIMENTOS ABERTOS e ENCERRADOS.");
   const locate=(b:any,left:number,right:number,label:string)=>{let sub:any=null,q:any=null;for(let r=b.r;r<=Math.min(normalized.length-1,b.r+12);r++){for(let c=0;c<normalized[r].length;c++){if(normalized[r]?.[c]?.startsWith("SUBTIPO")&&(sub===null||Math.abs(c-b.c)<Math.abs(sub.c-b.c)))sub={r,c};if(normalized[r]?.[c]?.startsWith("QTD")&&(q===null||Math.abs(c-b.c)<Math.abs(q.c-b.c)))q={r,c};}if(sub&&q&&sub.r===r&&q.r===r)break;}if(!sub||!q)throw new Error("Não foi possível localizar SUBTIPO/QTD no bloco "+label+".");let total=-1;for(let r=sub.r+1;r<normalized.length;r++){const row=normalized[r]??[];const maxCol=Math.max(row.length-1,right);if(row.slice(Math.max(0,left),maxCol+1).some((v:string)=>v?.startsWith("TOTAL"))){total=r;break;}}if(total<0)throw new Error("Não foi possível localizar TOTAL no bloco "+label+".");return {subtypeCol:sub.c+1,qtyCol:q.c+1,start:sub.r+2,capacity:total-sub.r-1};};
   addPair(locate(opened,opened.c,closed.c-1,"ABERTOS"),data.open);
   addPair(locate(closed,closed.c,normalized[0].length-1,"ENCERRADOS"),data.closed);
   const route=find("ANALISE ROUTETHIS");if(!route)throw new Error('Não foi possível localizar "ANÁLISE ROUTETHIS".');
   let header=-1,oscFound=false,incFound=false;
   for(let r=route.r;r<=Math.min(normalized.length-1,route.r+10);r++){if(normalized[r].includes("OSCILACAO")){oscFound=true;header=r;}if(normalized[r].includes("INCONFORMIDADE"))incFound=true;if(oscFound&&incFound)break;}
   if(!oscFound||!incFound)throw new Error("Não foi possível localizar os cabeçalhos OSCILAÇÃO e INCONFORMIDADE em ANÁLISE ROUTETHIS.");
   const maxRows=Number(sheet.properties?.gridProperties?.rowCount??1000);
   if(header+3+Math.max(data.osc.length,data.incon.length)>maxRows)throw new Error("Não há linhas suficientes para os tickets RouteThis.");
   addCol(1,header+3,data.osc.map(x=>x.ticket));addCol(0,header+3,data.osc.map(x=>x.open?"open":""));
   addCol(6,header+3,data.incon.map(x=>x.ticket));addCol(11,header+3,data.incon.map(x=>x.open?"open":""));
  }
  if(writes.length)await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"USER_ENTERED",data:writes})},"A GRAVAÇÃO DA IMPORTAÇÃO FALHOU");
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:key,metadataValue:JSON.stringify({hash:p.hash,fileName:p.fileName,sheetTitle:title,importedAt:new Date().toISOString()}),visibility:"DOCUMENT",location:{spreadsheet:true}}}}]})},"DADOS GRAVADOS, MAS NÃO FOI POSSÍVEL REGISTRAR A DUPLICIDADE");
  return {duplicate:false,records:p.rows.length,openSubtypes:data.open.length,closedSubtypes:data.closed.length,openRecords:data.open.reduce((n,x)=>n+x.quantidade,0),closedRecords:data.closed.reduce((n,x)=>n+x.quantidade,0),sheetTitle:title};
 }
 async function generateFiltered(file:File,type:"OSCILACAO"|"INCONFORMIDADE") {
  if(!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("O arquivo selecionado precisa estar no formato XLSX.");
  const boundary="volsup_"+crypto.randomUUID().replace(/-/g,"");
  const bytes=await file.arrayBuffer();
  const multipart=new Blob([
   `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:`TEMP_VOLSUP_FILTER_${Date.now()}`,mimeType:XLSX_MIME})}\r\n--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
   bytes,
   `\r\n--${boundary}--`
  ]);
  let xlsxId="",sheetId="";
  const call=(url:string,init:RequestInit={})=>api(url,init,"NÃO FOI POSSÍVEL GERAR O XLSX FILTRADO");
  try {
   const uploaded=await call("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:multipart});
   xlsxId=String((await uploaded.json()).id??"");
   if(!xlsxId) throw new Error("O Drive não retornou o ID do arquivo temporário.");
   const converted=await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(xlsxId)}/copy?supportsAllDrives=true&fields=id`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:`TEMP_VOLSUP_SHEET_${Date.now()}`,mimeType:"application/vnd.google-apps.spreadsheet"})});
   sheetId=String((await converted.json()).id??"");
   if(!sheetId) throw new Error("Não foi possível converter o arquivo para Google Sheets.");
   let lastError:unknown=null;
   for(let attempt=1;attempt<=10;attempt++) {
    try {
     const metaResponse=await call(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
     const book=await metaResponse.json(),sh=book.sheets?.[0];
     if(!sh) throw new Error("A planilha temporária ainda não possui abas.");
     const title=String(sh.properties.title),rowCount=Number(sh.properties.gridProperties?.rowCount??1),colCount=Number(sh.properties.gridProperties?.columnCount??1);
     const vals=await read(sheetId,`${quote(title)}!A1:${col(colCount-1)}${rowCount}`);
     const headers=(vals[0]??[]).map((x:any)=>String(x??"").trim());
     const idx=headers.findIndex((x:string)=>norm(x)==="SUBTIPO");
     if(idx<0) throw new Error('A coluna "subtipo" não foi encontrada no arquivo.');
     const criterion=type==="OSCILACAO"?"OSCILAÇÃO/INTERMITÊNCIA":"INCONFORMIDADE DE VELOCIDADE";
     const requestBody={requests:[{setBasicFilter:{filter:{
      range:{sheetId:Number(sh.properties.sheetId),startRowIndex:0,endRowIndex:Math.max(2,vals.length),startColumnIndex:0,endColumnIndex:colCount},
      criteria:{[idx]:{condition:{type:"TEXT_EQ",values:[{userEnteredValue:criterion}]}}}
     }}}]};
     await call(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(requestBody)});
     const token=await getToken();
     const exported=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,{headers:{Authorization:`Bearer ${token}`}});
     if(!exported.ok) throw new Error(`Não foi possível exportar o XLSX filtrado (HTTP ${exported.status}).`);
     const blob=await exported.blob();
     const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]??"");reader.onerror=()=>reject(new Error("Não foi possível preparar o download."));reader.readAsDataURL(blob);});
     return {success:true,fileName:file.name.replace(/\\.xlsx$/i,"")+(type==="OSCILACAO"?" - OSCILACAO.xlsx":" - INCONFORMIDADE.xlsx"),base64};
    } catch(e) {lastError=e;if(attempt===10)throw e;await new Promise(resolve=>setTimeout(resolve,1000));}
   }
   throw lastError instanceof Error?lastError:new Error("A planilha temporária não ficou disponível para leitura.");
  } finally {
   for(const id of [sheetId,xlsxId]) if(id) try {await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,{method:"DELETE"});} catch {}
  }
 }
 return { importarVolSup:(p:Payload)=>importData(p,false), importarVolSupMid:(p:Payload)=>importData(p,true), gerarVolSupArquivoFiltrado:generateFiltered };
}
