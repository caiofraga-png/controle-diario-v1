import { useMemo, useState } from "react";

type Row = Record<string, any>;
type Overview = { expedientes: Row[]; atendimentos: Row[]; estrutura: { colaboradores: Row[]; setores: Row[]; contatos: Row[] }; totalColaboradores: number; updatedAt: string };

function unique(rows: Row[], key: string) {
  return [...new Set(rows.map(row => String(row[key] ?? "")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
}
function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return '"' + text.replace(/"/g, '""') + '"';
}
function exportCsv(name: string, headers: string[], rows: Row[], keys: string[]) {
  const content = "\uFEFF" + [headers, ...rows.map(row => keys.map(key => String(row[key] ?? "")))].map(line => line.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
const selectStyle: React.CSSProperties = { minWidth: 150, padding: "8px", border: "1px solid var(--border, #cbd8ce)", borderRadius: 7, background: "var(--surface, #fff)", color: "inherit" };
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 130 };

export default function SupervisaoPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<"expedientes" | "atendimentos" | "estrutura">("expedientes");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState("TODOS");
  const [expFilters, setExpFilters] = useState({ colaborador:"", setor:"", contato:"", agente:"", perfil:"", data:"" });
  const [attFilters, setAttFilters] = useState({ canal:"", codigo:"", nome:"", tipo:"", resolvido:"", subtipo:"", colaborador:"", setor:"", contato:"", data:"" });

  async function refresh() {
    setBusy(true); setMessage("");
    try {
      const result = await window.controleDiario.firebase.workflow.visaoGeral();
      setData(result);
      setMessage("DADOS ATUALIZADOS.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ATUALIZAR OS DADOS.");
    } finally { setBusy(false); }
  }

  const expedientes = useMemo(() => (data?.expedientes ?? []).filter(row =>
    (status === "TODOS" || row.status === status) &&
    (!expFilters.colaborador || row.colaborador === expFilters.colaborador) &&
    (!expFilters.setor || row.setor === expFilters.setor) &&
    (!expFilters.contato || row.contato === expFilters.contato) &&
    (!expFilters.agente || row.agente === expFilters.agente) &&
    (!expFilters.perfil || row.perfil === expFilters.perfil) &&
    (!expFilters.data || row.data === expFilters.data)
  ), [data, status, expFilters]);

  const atendimentos = useMemo(() => (data?.atendimentos ?? []).filter(row =>
    (!attFilters.canal || row.canal === attFilters.canal) &&
    (!attFilters.codigo || String(row.codigo ?? "").toLowerCase().includes(attFilters.codigo.toLowerCase())) &&
    (!attFilters.nome || String(row.nome ?? "").toLowerCase().includes(attFilters.nome.toLowerCase())) &&
    (!attFilters.tipo || row.tipo === attFilters.tipo) &&
    (!attFilters.resolvido || row.resolvido === attFilters.resolvido) &&
    (!attFilters.subtipo || row.subtipo === attFilters.subtipo) &&
    (!attFilters.colaborador || row.colaborador === attFilters.colaborador) &&
    (!attFilters.setor || row.setor === attFilters.setor) &&
    (!attFilters.contato || row.contato === attFilters.contato) &&
    (!attFilters.data || row.data === attFilters.data)
  ), [data, attFilters]);

  const setExp = (key: string, value: string) => setExpFilters(current => ({...current,[key]:value}));
  const setAtt = (key: string, value: string) => setAttFilters(current => ({...current,[key]:value}));
  const options = (key: string) => unique(data?.expedientes ?? [], key);
  const attOptions = (key: string) => unique(data?.atendimentos ?? [], key);
  const select = (label: string, value: string, values: string[], onChange: (value:string)=>void) => <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>{label}<select style={selectStyle} value={value} onChange={event=>onChange(event.target.value)}><option value="">Todos</option>{values.map(item=><option key={item} value={item}>{item}</option>)}</select></label>;

  return <section className="card" style={{display:"grid",gap:16}}>
    <div className="workspace-intro"><h2>Visão Geral</h2><p>Acompanhamento gerencial de expedientes e atendimentos de todos os colaboradores. A consulta ocorre somente quando você solicita a atualização.</p></div>
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <button type="button" className="primary-wide" style={{width:"auto"}} disabled={busy} onClick={()=>void refresh()}>{busy?"ATUALIZANDO…":"↻ ATUALIZAR DADOS"}</button>
      {data&&<span style={{fontSize:12,color:"var(--muted, #60746a)"}}>Atualizado em {new Date(data.updatedAt).toLocaleString("pt-BR")} · {data.totalColaboradores} colaboradores aprovados</span>}
    </div>
    {message&&<p className="system-message" role="status">{message}</p>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" className={section==="expedientes"?"primary-wide":""} style={{width:"auto"}} onClick={()=>setSection("expedientes")}>EXPEDIENTES</button>
      <button type="button" className={section==="atendimentos"?"primary-wide":""} style={{width:"auto"}} onClick={()=>setSection("atendimentos")}>ATENDIMENTOS</button>
      <button type="button" className={section==="estrutura"?"primary-wide":""} style={{width:"auto"}} onClick={()=>setSection("estrutura")}>ESTRUTURA</button>
      <button type="button" className={section==="estrutura"?"primary-wide":""} style={{width:"auto"}} onClick={()=>setSection("estrutura")}>ESTRUTURA</button>
    </div>
    {!data ? <p>Clique em ATUALIZAR DADOS para consultar os registros.</p> : section==="expedientes" ? <>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0}}>Expedientes ({expedientes.length})</h3><button type="button" disabled={!expedientes.length} onClick={()=>exportCsv("expedientes-controle-diario.csv",["Colaborador","Setor","Contato","Agente","Perfil","Data","Situação"],expedientes,["colaborador","setor","contato","agente","perfil","data","situacao"])}>EXPORTAR PARA EXCEL (CSV)</button></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Situação<select style={selectStyle} value={status} onChange={event=>setStatus(event.target.value)}><option value="TODOS">Ambos</option><option value="NAO_CONCLUIDO">Não concluídos</option><option value="CONCLUIDO">Concluídos</option></select></label>
        {select("Colaborador",expFilters.colaborador,options("colaborador"),v=>setExp("colaborador",v))}
        {select("Setor",expFilters.setor,options("setor"),v=>setExp("setor",v))}
        {select("Contato",expFilters.contato,options("contato"),v=>setExp("contato",v))}
        {select("Agente",expFilters.agente,options("agente"),v=>setExp("agente",v))}
        {select("Perfil",expFilters.perfil,options("perfil"),v=>setExp("perfil",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Data<input style={inputStyle} type="date" value={expFilters.data} onChange={e=>setExp("data",e.target.value)}/></label>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Colaborador","Setor","Contato","Agente","Perfil","Data","Situação"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{expedientes.map(row=><><tr key={row.id}>{[row.colaborador,row.setor,row.contato,row.agente,row.perfil,row.data,row.situacao].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}<td><button type="button" onClick={()=>setExpandedId(expandedId===row.id?null:row.id)}>{expandedId===row.id?"FECHAR":"DETALHES"}</button></td></tr>{expandedId===row.id&&<tr key={row.id+"-detail"}><td colSpan={8} style={{padding:12,background:"var(--surface-secondary, #f3f7f4)"}}><strong>Tarefas</strong><ul>{(row.tarefas??[]).map((task:Row)=><li key={task.id}>{task.nome} — {task.concluida?"Concluída":"Pendente"}</li>)}</ul><strong>Atendimentos registrados: {(row.atendimentos??[]).length}</strong>{(row.atendimentos??[]).length>0&&<ul>{(row.atendimentos??[]).map((item:Row)=><li key={item.id}>{item.ticket} · {item.canal} · {item.nome}</li>)}</ul>}<strong>Observação</strong><p>{row.observacao||"Sem observação."}</p>{row.concluidoEm&&<small>Concluído em: {new Date(row.concluidoEm).toLocaleString("pt-BR")}</small>}</td></tr>}</>)}</tbody></table></div>
    </> : section==="atendimentos" ? <>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0}}>Atendimentos ({atendimentos.length})</h3><button type="button" disabled={!atendimentos.length} onClick={()=>exportCsv("atendimentos-controle-diario.csv",["Ticket","Canal","Código","Nome","Tipo","Resolvido","Subtipo","Colaborador responsável","Setor","Contato","Data do expediente"],atendimentos,["ticket","canal","codigo","nome","tipo","resolvido","subtipo","colaborador","setor","contato","data"])}>EXPORTAR PARA EXCEL (CSV)</button></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        {select("Canal",attFilters.canal,attOptions("canal"),v=>setAtt("canal",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Código<input style={inputStyle} value={attFilters.codigo} onChange={e=>setAtt("codigo",e.target.value)} placeholder="Buscar código"/></label>
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Nome<input style={inputStyle} value={attFilters.nome} onChange={e=>setAtt("nome",e.target.value)} placeholder="Buscar nome"/></label>
        {select("Tipo",attFilters.tipo,attOptions("tipo"),v=>setAtt("tipo",v))}
        {select("Resolvido",attFilters.resolvido,attOptions("resolvido"),v=>setAtt("resolvido",v))}
        {select("Subtipo",attFilters.subtipo,attOptions("subtipo"),v=>setAtt("subtipo",v))}
        {select("Colaborador",attFilters.colaborador,attOptions("colaborador"),v=>setAtt("colaborador",v))}
        {select("Setor",attFilters.setor,attOptions("setor"),v=>setAtt("setor",v))}
        {select("Contato",attFilters.contato,attOptions("contato"),v=>setAtt("contato",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Data do expediente<input style={inputStyle} type="date" value={attFilters.data} onChange={e=>setAtt("data",e.target.value)}/></label>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Ticket","Canal","Código","Nome","Tipo","Resolvido","Subtipo","Colaborador","Setor","Contato","Data"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{atendimentos.map((row,index)=><tr key={row.id||index}>{[row.ticket,row.canal,row.codigo,row.nome,row.tipo,row.resolvido,row.subtipo,row.colaborador,row.setor,row.contato,row.data].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}</tr>)}</tbody></table></div>
    </> : <>
      <h3>Estrutura organizacional</h3>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><strong>Colaboradores ({data.estrutura.colaboradores.length})</strong><button type="button" onClick={()=>exportCsv("estrutura-colaboradores.csv",["Colaborador","E-mail","Agente","Setor","Contato","Perfis vinculados","Status"],data.estrutura.colaboradores,["colaborador","email","agente","setor","contato","perfis","status"])}>EXPORTAR PARA EXCEL (CSV)</button></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Colaborador","Agente","Setor","Contato","Perfis vinculados","Status"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{data.estrutura.colaboradores.map(row=><tr key={row.uid}>{[row.colaborador,row.agente,row.setor,row.contato,row.perfis,row.status].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}</tr>)}</tbody></table></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}><div><strong>Setores ({data.estrutura.setores.length})</strong><ul>{data.estrutura.setores.map(row=><li key={row.id}>{row.nome} · {row.ativo?"Ativo":"Inativo"}</li>)}</ul></div><div><strong>Contatos ({data.estrutura.contatos.length})</strong><ul>{data.estrutura.contatos.map(row=><li key={row.id}>{row.nome} — {row.setor} · {row.ativo?"Ativo":"Inativo"}</li>)}</ul></div></div>
    </>}
  </section>;
}
