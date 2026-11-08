import { Fragment, useMemo, useState, type CSSProperties } from "react";
import ExcelJS from "exceljs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

type Row = Record<string, any>;
type Overview = { expedientes: Row[]; atendimentos: Row[]; estrutura: { colaboradores: Row[]; setores: Row[]; contatos: Row[]; agentes: Row[]; perfis: Row[] }; totalColaboradores: number; updatedAt: string };

function unique(rows: Row[], key: string) {
  return [...new Set(rows.map(row => String(row[key] ?? "")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
}
async function exportXlsx(name: string, headers: string[], rows: Row[], keys: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Diário";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Dados");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(keys.map(key => row[key] ?? ""));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: headers.length } };
  sheet.getRow(1).font = { bold: true };
  sheet.columns = headers.map((header, index) => ({
    header, key: String(index), width: Math.min(42, Math.max(14, header.length + 3,
      ...rows.slice(0, 100).map(row => String(row[keys[index]] ?? "").length + 2))),
  }));
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/\\.csv$/i, ".xlsx");
  anchor.click();
  URL.revokeObjectURL(url);
}
async function exportExpedientesDocx(rows: Row[]) {
  const children: Paragraph[] = [
    new Paragraph({ text: "RELATÓRIO DETALHADO DE EXPEDIENTES", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Gerado em ${new Date().toLocaleString("pt-BR")}` }),
    new Paragraph({ text: `Total de expedientes: ${rows.length}` }),
    new Paragraph({ text: "Os registros abaixo respeitam os filtros aplicados na Visão Geral." }),
  ];
  for (const row of rows) {
    children.push(new Paragraph({ text: `Login: ${row.colaborador || "—"}`, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun({text:"Setor: ",bold:true}), new TextRun(String(row.setor||"—")), new TextRun({text:"   Contato: ",bold:true}), new TextRun(String(row.contato||"—"))] }));
    children.push(new Paragraph({ children: [new TextRun({text:"Agente: ",bold:true}), new TextRun(String(row.agente||"—")), new TextRun({text:"   Perfil: ",bold:true}), new TextRun(String(row.perfil||"—"))] }));
    children.push(new Paragraph({ children: [new TextRun({text:"Data: ",bold:true}), new TextRun(String(row.data||"—")), new TextRun({text:"   Situação: ",bold:true}), new TextRun(String(row.situacao||"—"))] }));
    children.push(new Paragraph({ text: "Tarefas", heading: HeadingLevel.HEADING_2 }));
    if ((row.tarefas??[]).length) for (const task of row.tarefas) children.push(new Paragraph({ text: `• ${task.nome || "Tarefa"} — ${task.concluida ? "Concluída" : "Pendente"}` }));
    else children.push(new Paragraph({ text: "Nenhuma tarefa registrada." }));
    children.push(new Paragraph({ text: "Atendimentos", heading: HeadingLevel.HEADING_2 }));
    if ((row.atendimentos??[]).length) for (const item of row.atendimentos) children.push(new Paragraph({ text: `Ticket: ${item.ticket||"—"} | Código: ${item.codigo||"—"} | Nome: ${item.nome||"—"} | Tipo: ${item.tipo||"—"} | Subtipo: ${item.subtipo||"—"} | Canal: ${item.canal||"—"} | Resolvido: ${item.resolvido||"—"}` }));
    else children.push(new Paragraph({ text: "Nenhum atendimento registrado." }));
    children.push(new Paragraph({ text: "Observações", heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: String(row.observacao||"Sem observações.") }));
    if (row.concluidoEm) children.push(new Paragraph({ text: `Concluído em: ${new Date(row.concluidoEm).toLocaleString("pt-BR")}` }));
    children.push(new Paragraph({ text: " " }));
  }
  const wordDocument = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(wordDocument);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "relatorio-detalhado-expedientes.docx";
  anchor.click();
  URL.revokeObjectURL(url);
}
function cascadeOptions(rows: Row[], filters: Record<string, string>, key: string) {
  const matching = rows.filter(row => Object.entries(filters).every(([filterKey, value]) =>
    filterKey === key || !value || String(row[filterKey] ?? "").toLocaleLowerCase("pt-BR").includes(value.toLocaleLowerCase("pt-BR"))
  ));
  return unique(matching, key);
}
const selectStyle: CSSProperties = { minWidth: 150, padding: "8px", border: "1px solid var(--border, #cbd8ce)", borderRadius: 7, background: "var(--surface, #fff)", color: "inherit" };
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 130 };

export default function SupervisaoPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<"expedientes" | "atendimentos" | "estrutura" | "historico">("expedientes");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState("TODOS");
  const [expFilters, setExpFilters] = useState({ colaborador:"", setor:"", contato:"", agente:"", perfil:"", data:"" });
  const [attFilters, setAttFilters] = useState({ ticket:"", canal:"", codigo:"", nome:"", tipo:"", resolvido:"", subtipo:"", colaborador:"", setor:"", contato:"", data:"" });
  const [historyFilters, setHistoryFilters] = useState({ colaborador:"", setor:"", contato:"", agente:"", perfil:"", data:"" });
  const [structureFilters, setStructureFilters] = useState({ colaborador:"", agente:"", setor:"", contato:"", perfis:"", status:"" });\n  const [attendancePage, setAttendancePage] = useState(1);\n  const attendancePageSize = 30;

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

  const historico = useMemo(() => (data?.expedientes ?? []).filter(row =>
    row.status === "CONCLUIDO" &&
    (!historyFilters.colaborador || row.colaborador === historyFilters.colaborador) &&
    (!historyFilters.setor || row.setor === historyFilters.setor) &&
    (!historyFilters.contato || row.contato === historyFilters.contato) &&
    (!historyFilters.agente || row.agente === historyFilters.agente) &&
    (!historyFilters.perfil || row.perfil === historyFilters.perfil) &&
    (!historyFilters.data || row.data === historyFilters.data)
  ), [data, historyFilters]);

  const atendimentos = useMemo(() => (data?.atendimentos ?? []).filter(row =>
    (!attFilters.ticket || String(row.ticket ?? "").toLowerCase().includes(attFilters.ticket.toLowerCase())) &&
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

  const attendancePageCount = Math.max(1, Math.ceil(atendimentos.length / attendancePageSize));\n  const visibleAttendances = atendimentos.slice((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize);\n  const setExp = (key: string, value: string) => setExpFilters(current => ({...current,[key]:value}));
  const setAtt = (key: string, value: string) => { setAttendancePage(1); setAttFilters(current => ({...current,[key]:value})); };
  const setHistory = (key: string, value: string) => setHistoryFilters(current => ({...current,[key]:value}));
  const setStructure = (key: string, value: string) => setStructureFilters(current => ({...current,[key]:value}));
  const estruturaColaboradores = useMemo(() => (data?.estrutura.colaboradores ?? []).filter(row =>
    Object.entries(structureFilters).every(([key,value]) => !value || String(row[key] ?? "").toLocaleLowerCase("pt-BR").includes(value.toLocaleLowerCase("pt-BR")))
  ), [data, structureFilters]);
  const structureOptions = (key: string) => [...new Set((data?.estrutura.colaboradores ?? [])
    .filter(row => Object.entries(structureFilters).every(([filterKey,value]) => filterKey === key || !value || String(row[filterKey] ?? "").toLocaleLowerCase("pt-BR").includes(value.toLocaleLowerCase("pt-BR"))))
    .map(row => String(row[key] ?? "")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const options = (key: string) => unique(data?.expedientes ?? [], key);
  const attOptions = (key: string) => cascadeOptions(data?.atendimentos ?? [], attFilters, key);
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
      <button type="button" className={section==="historico"?"primary-wide":""} style={{width:"auto"}} onClick={()=>setSection("historico")}>HISTÓRICO</button>
    </div>
    {!data ? <p>Clique em ATUALIZAR DADOS para consultar os registros.</p> : section==="expedientes" ? <>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0}}>Expedientes ({expedientes.length})</h3><button type="button" disabled={!expedientes.length} onClick={()=>exportXlsx("expedientes-controle-diario.xlsx",["Login","Setor","Contato","Agente","Perfil","Data","Situação"],expedientes,["colaborador","setor","contato","agente","perfil","data","situacao"])}>EXPORTAR PARA EXCEL (.XLSX)</button><button type="button" disabled={!expedientes.length} onClick={()=>void exportExpedientesDocx(expedientes)}>EXPORTAR RELATÓRIO DETALHADO (.DOCX)</button></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Situação<select style={selectStyle} value={status} onChange={event=>setStatus(event.target.value)}><option value="TODOS">Ambos</option><option value="NAO_CONCLUIDO">Não concluídos</option><option value="CONCLUIDO">Concluídos</option></select></label>
        {<label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Login<input style={inputStyle} list="visao-logins" value={expFilters.colaborador} onChange={e=>setExp("colaborador",e.target.value)} placeholder="Pesquisar login"/><datalist id="visao-logins">{options("colaborador").map(item=><option key={item} value={item}/>)}</datalist></label>}
        {select("Setor",expFilters.setor,options("setor"),v=>setExp("setor",v))}
        {select("Contato",expFilters.contato,options("contato"),v=>setExp("contato",v))}
        {<label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Agente<input style={inputStyle} list="visao-agentes" value={expFilters.agente} onChange={e=>setExp("agente",e.target.value)} placeholder="Pesquisar agente"/><datalist id="visao-agentes">{options("agente").map(item=><option key={item} value={item}/>)}</datalist></label>}
        {select("Perfil",expFilters.perfil,options("perfil"),v=>setExp("perfil",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Data<input style={inputStyle} type="date" value={expFilters.data} onChange={e=>setExp("data",e.target.value)}/></label>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Colaborador","Setor","Contato","Agente","Perfil","Data","Situação"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{expedientes.map(row=><Fragment key={row.id}><tr>{[row.colaborador,row.setor,row.contato,row.agente,row.perfil,row.data,row.situacao].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}<td><button type="button" onClick={()=>setExpandedId(expandedId===row.id?null:row.id)}>{expandedId===row.id?"FECHAR":"DETALHES"}</button></td></tr>{expandedId===row.id&&<tr key={row.id+"-detail"}><td colSpan={8} style={{padding:12,background:"var(--surface-secondary, #f3f7f4)"}}><strong>Tarefas</strong><ul>{(row.tarefas??[]).map((task:Row)=><li key={task.id}>{task.nome} — {task.concluida?"Concluída":"Pendente"}</li>)}</ul><strong>Atendimentos registrados: {(row.atendimentos??[]).length}</strong>{(row.atendimentos??[]).length>0&&<ul>{(row.atendimentos??[]).map((item:Row)=><li key={item.id}>{item.ticket} · {item.canal} · {item.nome}</li>)}</ul>}<strong>Observação</strong><p>{row.observacao||"Sem observação."}</p>{row.concluidoEm&&<small>Concluído em: {new Date(row.concluidoEm).toLocaleString("pt-BR")}</small>}</td></tr>}</Fragment>)}</tbody></table></div>
    </> : section==="atendimentos" ? <>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0}}>Atendimentos ({atendimentos.length})</h3><button type="button" disabled={!atendimentos.length} onClick={()=>exportXlsx("atendimentos-controle-diario.xlsx",["Ticket","Canal","Código","Nome","Tipo","Resolvido","Subtipo","Login responsável","Setor","Contato","Data do expediente"],atendimentos,["ticket","canal","codigo","nome","tipo","resolvido","subtipo","colaborador","setor","contato","data"])}>EXPORTAR PARA EXCEL (.XLSX)</button></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        {select("Canal",attFilters.canal,attOptions("canal"),v=>setAtt("canal",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Código<input style={inputStyle} value={attFilters.codigo} onChange={e=>setAtt("codigo",e.target.value)} placeholder="Buscar código"/></label>
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Nome<input style={inputStyle} value={attFilters.nome} onChange={e=>setAtt("nome",e.target.value)} placeholder="Buscar nome"/></label>
        {select("Tipo",attFilters.tipo,attOptions("tipo"),v=>setAtt("tipo",v))}
        {select("Resolvido",attFilters.resolvido,attOptions("resolvido"),v=>setAtt("resolvido",v))}
        {select("Subtipo",attFilters.subtipo,attOptions("subtipo"),v=>setAtt("subtipo",v))}
        {<label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Login<input style={inputStyle} list="atendimento-logins" value={attFilters.colaborador} onChange={e=>setAtt("colaborador",e.target.value)} placeholder="Pesquisar login"/><datalist id="atendimento-logins">{attOptions("colaborador").map(item=><option key={item} value={item}/>)}</datalist></label>}
        {select("Setor",attFilters.setor,attOptions("setor"),v=>setAtt("setor",v))}
        {select("Contato",attFilters.contato,attOptions("contato"),v=>setAtt("contato",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Data do expediente<input style={inputStyle} type="date" value={attFilters.data} onChange={e=>setAtt("data",e.target.value)}/></label>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Ticket","Canal","Código","Nome","Tipo","Resolvido","Subtipo","Colaborador","Setor","Contato","Data"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{visibleAttendances.map((row,index)=><tr key={row.id||index}>{[row.ticket,row.canal,row.codigo,row.nome,row.tipo,row.resolvido,row.subtipo,row.colaborador,row.setor,row.contato,row.data].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}</tr>)}</tbody></table></div>
    </> : section==="estrutura" ? <>
      <h3>Estrutura organizacional</h3>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        {select("Login",structureFilters.colaborador,structureOptions("colaborador"),v=>setStructure("colaborador",v))}
        {select("Agente",structureFilters.agente,structureOptions("agente"),v=>setStructure("agente",v))}
        {select("Setor",structureFilters.setor,structureOptions("setor"),v=>setStructure("setor",v))}
        {select("Contato",structureFilters.contato,structureOptions("contato"),v=>setStructure("contato",v))}
        {select("Perfil",structureFilters.perfis,[...new Set(estruturaColaboradores.flatMap(row=>String(row.perfis??"").split(", ").filter(Boolean)))].sort((a,b)=>a.localeCompare(b,"pt-BR")),v=>setStructure("perfis",v))}
        {select("Status",structureFilters.status,structureOptions("status"),v=>setStructure("status",v))}
      </div><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><strong>Colaboradores ({estruturaColaboradores.length})</strong><button type="button" disabled={!data.estrutura.colaboradores.length} onClick={()=>exportXlsx("estrutura-colaboradores.xlsx",["Colaborador","E-mail","Agente","Setor","Contato","Perfis vinculados","Status"],estruturaColaboradores,["colaborador","email","agente","setor","contato","perfis","status"])}>EXPORTAR PARA EXCEL (CSV)</button></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Colaborador","Agente","Setor","Contato","Perfis vinculados","Status"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{estruturaColaboradores.map(row=><tr key={row.uid}>{[row.colaborador,row.agente,row.setor,row.contato,row.perfis,row.status].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}</tr>)}</tbody></table></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" disabled={!data.estrutura.setores.length} onClick={()=>exportXlsx("estrutura-setores.xlsx",["Setor","Status"],data.estrutura.setores,["nome","ativo"])}>EXPORTAR SETORES (.XLSX)</button><button type="button" disabled={!data.estrutura.contatos.length} onClick={()=>exportXlsx("estrutura-contatos.xlsx",["Contato","Setor","Status"],data.estrutura.contatos,["nome","setor","ativo"])}>EXPORTAR CONTATOS (.XLSX)</button><button type="button" disabled={!data.estrutura.agentes.length} onClick={()=>exportXlsx("estrutura-agentes.xlsx",["Agente","Colaboradores vinculados"],data.estrutura.agentes,["nome","colaboradores"])}>EXPORTAR AGENTES (.XLSX)</button><button type="button" disabled={!data.estrutura.perfis.length} onClick={()=>exportXlsx("estrutura-perfis.xlsx",["Perfil","Colaboradores vinculados"],data.estrutura.perfis,["nome","colaboradores"])}>EXPORTAR PERFIS (.XLSX)</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
        <div><strong>Setores ({data.estrutura.setores.length})</strong><ul>{data.estrutura.setores.map(row=><li key={row.id}>{row.nome} · {row.ativo?"Ativo":"Inativo"}</li>)}</ul></div>
        <div><strong>Contatos ({data.estrutura.contatos.length})</strong><ul>{data.estrutura.contatos.map(row=><li key={row.id}>{row.nome} — {row.setor} · {row.ativo?"Ativo":"Inativo"}</li>)}</ul></div>
        <div><strong>Agentes ({data.estrutura.agentes.length})</strong><ul>{data.estrutura.agentes.map(row=><li key={row.nome}><strong>{row.nome}</strong><small> — {(row.colaboradores??[]).join(", ") || "Sem colaboradores vinculados"}</small></li>)}</ul></div>
        <div><strong>Perfis ({data.estrutura.perfis.length})</strong><ul>{data.estrutura.perfis.map(row=><li key={row.id}><strong>{row.nome}</strong><small> — {(row.colaboradores??[]).join(", ") || "Sem colaboradores vinculados"}</small></li>)}</ul></div>
      </div>
    </> : <>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0}}>Histórico completo ({historico.length})</h3><button type="button" disabled={!historico.length} onClick={()=>exportXlsx("historico-expedientes-controle-diario.xlsx",["Colaborador","Setor","Contato","Agente","Perfil","Data","Situação do encerramento","Concluído em"],historico,["colaborador","setor","contato","agente","perfil","data","situacao","concluidoEm"])}>EXPORTAR PARA EXCEL (CSV)</button></div>
      <p>Consulta dos expedientes concluídos. Os registros são apresentados sem alterar o histórico original.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
        {<label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Login<input style={inputStyle} list="historico-logins" value={historyFilters.colaborador} onChange={e=>setHistory("colaborador",e.target.value)} placeholder="Pesquisar login"/><datalist id="historico-logins">{cascadeOptions(data?.expedientes ?? [],historyFilters,"colaborador").map(item=><option key={item} value={item}/>)}</datalist></label>}
        {select("Setor",historyFilters.setor,cascadeOptions(data?.expedientes ?? [],historyFilters,"setor"),v=>setHistory("setor",v))}
        {select("Contato",historyFilters.contato,cascadeOptions(data?.expedientes ?? [],historyFilters,"contato"),v=>setHistory("contato",v))}
        {<label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Agente<input style={inputStyle} list="historico-agentes" value={historyFilters.agente} onChange={e=>setHistory("agente",e.target.value)} placeholder="Pesquisar agente"/><datalist id="historico-agentes">{cascadeOptions(data?.expedientes ?? [],historyFilters,"agente").map(item=><option key={item} value={item}/>)}</datalist></label>}
        {select("Perfil",historyFilters.perfil,cascadeOptions(data?.expedientes ?? [],historyFilters,"perfil"),v=>setHistory("perfil",v))}
        <label style={{display:"grid",gap:4,fontSize:12,fontWeight:600}}>Data<input style={inputStyle} type="date" value={historyFilters.data} onChange={e=>setHistory("data",e.target.value)}/></label>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Colaborador","Setor","Contato","Agente","Perfil","Data","Encerramento","Concluído em","Detalhes"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--border, #ccd8d0)"}}>{x}</th>)}</tr></thead><tbody>{historico.map(row=><Fragment key={row.id}><tr>{[row.colaborador,row.setor,row.contato,row.agente,row.perfil,row.data,row.situacao,row.concluidoEm?new Date(row.concluidoEm).toLocaleString("pt-BR"):"—"].map((value,i)=><td key={i} style={{padding:9,borderBottom:"1px solid var(--border, #e1e8e3)"}}>{String(value||"—")}</td>)}<td><button type="button" onClick={()=>setExpandedId(expandedId===row.id?null:row.id)}>{expandedId===row.id?"FECHAR":"DETALHES"}</button></td></tr>{expandedId===row.id&&<tr><td colSpan={9} style={{padding:12,background:"var(--surface-secondary, #f3f7f4)"}}><strong>Tarefas concluídas</strong><ul>{(row.tarefas??[]).map((task:Row)=><li key={task.id}>{task.nome} — {task.concluida?"Concluída":"Pendente"}</li>)}</ul><strong>Atendimentos registrados: {(row.atendimentos??[]).length}</strong>{(row.atendimentos??[]).length>0&&<ul>{(row.atendimentos??[]).map((item:Row)=><li key={item.id}>{item.ticket} · {item.canal} · {item.nome}</li>)}</ul>}<strong>Observações</strong><p>{row.observacao||"Sem observações."}</p></td></tr>}</Fragment>)}</tbody></table></div>
    </>}
  </section>;
}
