import { useMemo, useState } from "react";

type Cell = { valor?: string; formatacao?: any };
type Roteiro = { linhas:number; colunas:number; largurasColunas:number[]; celulas:Record<string,Cell>; mesclas:Array<{inicio:string;fim:string}>; filtro:{linhaInicial:number;linhaFinal:number}|null };

type Props = { initial:Roteiro; onCancel:()=>void; onSave:(value:Roteiro)=>void; presentation?:"popup"|"side"; sidePosition?:"esquerda"|"direita" };

function clone<T>(v:T):T { return JSON.parse(JSON.stringify(v)); }
function colName(n:number){ let s=""; let x=n+1; while(x>0){ const r=(x-1)%26; s=String.fromCharCode(65+r)+s; x=Math.floor((x-1)/26); } return s; }
function addr(r:number,c:number){ return `${colName(c)}${r+1}`; }
function parse(a:string){ const m=a.match(/^([A-Z]+)(\d+)$/); if(!m)return {r:0,c:0}; let c=0; for(const ch of m[1]) c=c*26+(ch.charCodeAt(0)-64); return {r:Number(m[2])-1,c:c-1}; }
function rectangle(a:string,b:string){ const p=parse(a),q=parse(b); const r1=Math.min(p.r,q.r),r2=Math.max(p.r,q.r),c1=Math.min(p.c,q.c),c2=Math.max(p.c,q.c); const out:string[]=[]; for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)out.push(addr(r,c)); return out; }
function emptyRoteiro():Roteiro { return {linhas:50,colunas:5,largurasColunas:[120,120,120,120,120],celulas:{},mesclas:[],filtro:null}; }

export default function RoteiroEditor({initial,onCancel,onSave,presentation="popup",sidePosition="direita"}:Props){
  const [r,setR]=useState<Roteiro>(()=>{ const x=clone(initial||emptyRoteiro()); x.linhas=Math.max(1,x.linhas||50); x.colunas=Math.max(1,x.colunas||5); x.largurasColunas=Array.from({length:x.colunas},(_,i)=>x.largurasColunas?.[i]??120); x.celulas=x.celulas||{}; x.mesclas=x.mesclas||[]; return x; });
  const [anchor,setAnchor]=useState("A1");
  const [focus,setFocus]=useState("A1");
  const [dragging,setDragging]=useState(false);
  const [fontSize,setFontSize]=useState(11);
  const [textColor,setTextColor]=useState("#000000");
  const [bgColor,setBgColor]=useState("#ffffff");
  const [align,setAlign]=useState("esquerda");
  const selected=useMemo(()=>rectangle(anchor,focus),[anchor,focus]);
  const selectedSet=useMemo(()=>new Set(selected),[selected]);

  function patch(fn:(n:Roteiro)=>void){ setR(prev=>{const n=clone(prev);fn(n);return n;}); }
  function formatSelected(patchFormat:any){ patch(n=>{for(const a of selected){const c=n.celulas[a]??{};const f={...(c.formatacao??{}),...patchFormat};if(!c.valor && Object.keys(f).every(k=>f[k]===undefined||f[k]===false||f[k]===null||f[k]==="#ffffff"||f[k]==="#000000"||f[k]===11||f[k]==="esquerda"||f[k]==="normal")){ if(Object.keys(c).length===0) delete n.celulas[a]; else n.celulas[a]={...c,formatacao:f}; } else n.celulas[a]={...c,formatacao:f}; }}); }
  function cellValue(a:string){return r.celulas[a]?.valor??"";}
  function updateCell(a:string,value:string){ patch(n=>{if(!value && !n.celulas[a]?.formatacao) delete n.celulas[a]; else n.celulas[a]={...(n.celulas[a]??{}),valor:value};}); }
  function onCellKey(e:React.KeyboardEvent<HTMLInputElement>,a:string){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="c"){e.preventDefault();void navigator.clipboard.writeText(selected.map(x=>cellValue(x)).join("\t"));}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="v"){e.preventDefault();void navigator.clipboard.readText().then(text=>{const rows=text.replace(/\r/g,"").split("\n").filter((_,i,arr)=>!(i===arr.length-1&&arr[i]===""));patch(n=>{const p=parse(a);rows.forEach((row,ri)=>row.split("\t").forEach((v,ci)=>{const rr=p.r+ri,cc=p.c+ci;if(rr<n.linhas&&cc<n.colunas){const ad=addr(rr,cc);n.celulas[ad]={...(n.celulas[ad]??{}),valor:v};}}));});});}
    if(e.key==="Tab"){e.preventDefault();const p=parse(a);const next=Math.min(r.colunas-1,p.c+(e.shiftKey?-1:1));setAnchor(addr(p.r,next));setFocus(addr(p.r,next));}
    if(e.key==="Enter"){e.preventDefault();const p=parse(a);const next=Math.min(r.linhas-1,p.r+(e.shiftKey?-1:1));setAnchor(addr(next,p.c));setFocus(addr(next,p.c));}
  }
  function resizeColumn(i:number,w:number){patch(n=>{n.largurasColunas[i]=Math.max(60,Math.min(500,w));});}
  function addRow(){patch(n=>{n.linhas++;});}
  function addCol(){patch(n=>{n.colunas++;n.largurasColunas.push(120);});}
  function removeRow(){
    const row=parse(focus).r; const has=Object.entries(r.celulas).some(([a,c])=>parse(a).r===row&&(c.valor||c.formatacao)); if(has&&!window.confirm("A linha contém conteúdo ou formatação. Remover mesmo assim?"))return;
    patch(n=>{for(const a of Object.keys(n.celulas))if(parse(a).r===row)delete n.celulas[a]; const shifted:Record<string,Cell>={};for(const [a,c] of Object.entries(n.celulas)){const p=parse(a);if(p.r>row)shifted[addr(p.r-1,p.c)]=c;else shifted[a]=c;}n.celulas=shifted;n.linhas=Math.max(1,n.linhas-1);n.mesclas=[];});
  }
  function removeCol(){
    const col=parse(focus).c; const has=Object.entries(r.celulas).some(([a,c])=>parse(a).c===col&&(c.valor||c.formatacao)); if(has&&!window.confirm("A coluna contém conteúdo ou formatação. Remover mesmo assim?"))return;
    patch(n=>{for(const a of Object.keys(n.celulas))if(parse(a).c===col)delete n.celulas[a];const shifted:Record<string,Cell>={};for(const [a,c] of Object.entries(n.celulas)){const p=parse(a);if(p.c>col)shifted[addr(p.r,p.c-1)]=c;else shifted[a]=c;}n.celulas=shifted;n.colunas=Math.max(1,n.colunas-1);n.largurasColunas.splice(col,1);n.mesclas=[];});
  }
  function merge(){
    if(selected.length<2)return;
    const vals=selected.filter(a=>cellValue(a)); if(vals.length>1&&!window.confirm("A mesclagem pode descartar conteúdo de mais de uma célula. Continuar?"))return;
    const p1=parse(anchor),p2=parse(focus); const start=addr(Math.min(p1.r,p2.r),Math.min(p1.c,p2.c)),end=addr(Math.max(p1.r,p2.r),Math.max(p1.c,p2.c)); patch(n=>{for(const a of selected.slice(1))delete n.celulas[a];n.mesclas=[...n.mesclas.filter(m=>!(selected.includes(m.inicio)&&selected.includes(m.fim))),{inicio:start,fim:end}];});
  }
  function applyList(kind:"marcadores"|"numerada"){formatSelected({lista:kind});}
  function applyBorder(){formatSelected({bordas:{top:true,right:true,bottom:true,left:true}});}
  function unmerge(){
    const targets=new Set(selected);
    patch(n=>{n.mesclas=n.mesclas.filter(m=>!targets.has(m.inicio)&&!targets.has(m.fim));});
  }
  function mergeInfo(a:string){ return r.mesclas.find(m=>m.inicio===a); }
  function isCoveredByMerge(a:string){ return r.mesclas.some(m=>m.inicio!==a && rectangle(m.inicio,m.fim).includes(a)); }
  function toggle(key:string){const current=r.celulas[focus]?.formatacao?.[key]??false;formatSelected({[key]:!current});}
  function filterValid(){return !r.filtro|| (r.filtro.linhaInicial>=1&&r.filtro.linhaFinal>=r.filtro.linhaInicial&&r.filtro.linhaFinal<=r.linhas);}
  function setFilter(which:"linhaInicial"|"linhaFinal",value:number){patch(n=>{const f=n.filtro??{linhaInicial:1,linhaFinal:n.linhas};f[which]=Math.max(1,Math.min(n.linhas,value));n.filtro=f;});}

  return <div className={`roteiro-overlay ${presentation==="side"?`roteiro-side ${sidePosition}`:""}`}><div className="roteiro-window advanced">
    <header><div><strong>ROTEIRO</strong><span className="id-note"> — EDITOR DE PLANILHA</span></div><button onClick={onCancel}>✕</button></header>
    <div className="roteiro-toolbar">
      <div className="tool-group"><button onClick={()=>toggle("negrito")}><b>B</b></button><button onClick={()=>toggle("italico")}><i>I</i></button><button onClick={()=>toggle("sublinhado")}><u>U</u></button><label>FONTE <input type="number" min="6" max="72" value={fontSize} onChange={e=>setFontSize(Number(e.target.value)||11)} onBlur={()=>formatSelected({tamanhoFonte:fontSize})}/></label></div>
      <div className="tool-group"><select value={align} onChange={e=>{setAlign(e.target.value);formatSelected({alinhamento:e.target.value});}}><option value="esquerda">Esquerda</option><option value="centro">Centro</option><option value="direita">Direita</option></select><label>TEXTO <input type="color" value={textColor} onChange={e=>{setTextColor(e.target.value);formatSelected({corTexto:e.target.value});}}/></label><label>FUNDO <input type="color" value={bgColor} onChange={e=>{setBgColor(e.target.value);formatSelected({corFundo:e.target.value});}}/></label><button onClick={applyBorder}>BORDAS</button></div>
      <div className="tool-group"><button onClick={()=>applyList("marcadores")}>• LISTA</button><button onClick={()=>applyList("numerada")}>1. LISTA</button><button onClick={()=>formatSelected({quebraTexto:true})}>QUEBRA DE TEXTO</button><button onClick={merge}>MESCLAR</button><button onClick={unmerge}>DESMESCLAR</button></div>
      <div className="tool-group"><button onClick={addRow}>+ LINHA</button><button onClick={removeRow}>− LINHA</button><button onClick={addCol}>+ COLUNA</button><button onClick={removeCol}>− COLUNA</button></div>
    </div>
    <div className="roteiro-filter"><strong>FILTRO DE LINHAS</strong><label>INICIAL <input type="number" min="1" max={r.linhas} value={r.filtro?.linhaInicial??1} onChange={e=>setFilter("linhaInicial",Number(e.target.value))}/></label><label>FINAL <input type="number" min="1" max={r.linhas} value={r.filtro?.linhaFinal??r.linhas} onChange={e=>setFilter("linhaFinal",Number(e.target.value))}/></label>{!filterValid()&&<span className="filter-error">INTERVALO INVÁLIDO</span>}</div>
    <div className="sheet-scroll" onMouseUp={()=>setDragging(false)}><table className="sheet advanced-sheet"><colgroup>{Array.from({length:r.colunas},(_,i)=><col key={i} style={{width:r.largurasColunas[i]}}/>)}</colgroup><thead><tr><th className="corner">#</th>{Array.from({length:r.colunas},(_,c)=><th key={c}>{colName(c)}<input aria-label={`Largura ${colName(c)}`} type="range" min="60" max="500" value={r.largurasColunas[c]} onChange={e=>resizeColumn(c,Number(e.target.value))}/></th>)}</tr></thead><tbody>{Array.from({length:r.linhas},(_,ri)=>{const rowVisible=!r.filtro || (ri+1>=r.filtro.linhaInicial && ri+1<=r.filtro.linhaFinal); return <tr key={ri} style={{display:rowVisible?undefined:"none"}}><th>{ri+1}</th>{Array.from({length:r.colunas},(_,ci)=>{const a=addr(ri,ci); if(isCoveredByMerge(a)) return null; const f=r.celulas[a]?.formatacao??{}; const mi=mergeInfo(a); const mp=mi?parse(mi.fim):null; const ap=mi?parse(a):null; const sel=selectedSet.has(a); const b=f.bordas??{}; const prefix=f.lista==="marcadores"?"• ":f.lista==="numerada"?"1. ":""; const style:any={fontSize:f.tamanhoFonte?`${f.tamanhoFonte}px`:undefined,fontWeight:f.negrito?700:undefined,fontStyle:f.italico?"italic":undefined,textDecoration:f.sublinhado?"underline":undefined,textAlign:f.alinhamento||undefined,color:f.corTexto||undefined,background:f.corFundo||undefined,whiteSpace:f.quebraTexto===false?"nowrap":"normal",borderTop:b.top?"2px solid #333":undefined,borderRight:b.right?"2px solid #333":undefined,borderBottom:b.bottom?"2px solid #333":undefined,borderLeft:b.left?"2px solid #333":undefined}; return <td key={a} className={sel?"selected-cell":""} style={style} colSpan={mp&&ap?mp.c-ap.c+1:undefined} rowSpan={mp&&ap?mp.r-ap.r+1:undefined} onMouseDown={e=>{e.preventDefault();setAnchor(e.shiftKey?anchor:a);setFocus(a);setDragging(true);}} onMouseEnter={()=>{if(dragging)setFocus(a);}}><input value={prefix+cellValue(a)} onChange={e=>updateCell(a,e.target.value.replace(/^(?:• |1\. )/,""))} onKeyDown={e=>onCellKey(e,a)} onFocus={()=>setFocus(a)} /></td>})}</tr>})}</tbody></table></div>
    <div className="config-actions"><button onClick={onCancel}>CANCELAR</button><button className="primary" disabled={!filterValid()} onClick={()=>onSave(r)}>SALVAR ROTEIRO</button></div>
  </div></div>;
}
