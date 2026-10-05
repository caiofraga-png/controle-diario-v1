import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import RoteiroEditor from "./RoteiroEditor";
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function move(arr, from, to) { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; }
export default function ConfigurationPanel({ initial, onSave, onClose, busy }) {
    const [tab, setTab] = useState("perfis");
    const [draft, setDraft] = useState(() => clone(initial));
    const [selectedId, setSelectedId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({});
    const [route, setRoute] = useState("lista");
    const [localMessage, setLocalMessage] = useState("");
    const [roteiroOpen, setRoteiroOpen] = useState(false);
    const [roteiro, setRoteiro] = useState(null);
    const activeTasks = useMemo(() => draft.tarefas.tarefas.filter((t) => t.ativo), [draft]);
    const selectedProfile = draft.perfis.perfis.find((p) => p.id === selectedId);
    const selectedTask = draft.tarefas.tarefas.find((t) => t.id === selectedId);
    const selectedEmail = draft.email.emails.find((e) => e.id === selectedId);
    function startNew() { setCreating(true); setSelectedId(null); setRoute("editar"); setForm(tab === "perfis" ? { nome: "", tarefas: [] } : tab === "tarefas" ? { nome: "", link: "", criacao: "", ativo: false, emailsVinculados: [] } : { nome: "", titulo: "", corpo: "", ativo: false, global: false }); }
    function edit(id) { setCreating(false); setSelectedId(id); setRoute("editar"); const obj = tab === "perfis" ? draft.perfis.perfis.find((x) => x.id === id) : tab === "tarefas" ? draft.tarefas.tarefas.find((x) => x.id === id) : draft.email.emails.find((x) => x.id === id); setForm(clone(obj)); if (tab === "email")
        setForm((f) => ({ ...clone(obj), global: draft.email.emailsGlobais.includes(id) })); }
    function switchTab(t) { setTab(t); setRoute("lista"); setSelectedId(null); setLocalMessage(""); }
    async function saveItem() {
        setLocalMessage("");
        try {
            const next = clone(draft);
            if (tab === "perfis") {
                if (!form.nome?.trim())
                    throw new Error("INFORME O NOME DO PERFIL.");
                if (next.perfis.perfis.some((x) => x.nome.trim().toLocaleLowerCase() === form.nome.trim().toLocaleLowerCase() && x.id !== form.id))
                    throw new Error("JÁ EXISTE UM PERFIL COM ESSE NOME.");
                if (creating) {
                    const created = await window.controleDiario.config.novoPerfil({ nome: form.nome, tarefas: form.tarefas ?? [] });
                    next.perfis.perfis.push(created);
                    next.layout.ordemPerfis.push(created.id);
                    next.layout.ordemTarefas[created.id] = created.tarefas.slice();
                }
                else {
                    const p = next.perfis.perfis.find((x) => x.id === form.id);
                    if (p.ativo && !form.ativo && !window.confirm("DESATIVAR ESTE PERFIL? As associações de tarefas serão preservadas."))
                        return;
                    Object.assign(p, { nome: form.nome.trim(), tarefas: [...(form.tarefas ?? [])], ativo: Boolean(form.ativo) });
                    const selected = new Set(p.tarefas);
                    const current = next.layout.ordemTarefas[p.id] ?? [];
                    next.layout.ordemTarefas[p.id] = [...current.filter((id) => selected.has(id)), ...p.tarefas.filter((id) => !current.includes(id))];
                }
            }
            else if (tab === "tarefas") {
                if (!form.nome?.trim())
                    throw new Error("INFORME O NOME DA TAREFA.");
                if (form.link && !/^https?:\/\//i.test(form.link))
                    throw new Error("O LINK DA TAREFA DEVE COMEÇAR COM HTTP:// OU HTTPS://.");
                if (next.tarefas.tarefas.some((x) => x.nome.trim().toLocaleLowerCase() === form.nome.trim().toLocaleLowerCase() && x.id !== form.id))
                    throw new Error("JÁ EXISTE UMA TAREFA COM ESSE NOME.");
                if (creating) {
                    const created = await window.controleDiario.config.novaTarefa({ nome: form.nome, link: form.link ?? "", criacao: form.criacao ?? "" });
                    next.tarefas.tarefas.push(created);
                }
                else {
                    const t = next.tarefas.tarefas.find((x) => x.id === form.id);
                    const was = t.ativo;
                    if (was && !form.ativo && !window.confirm("DESATIVAR ESTA TAREFA? Ela será removida das associações dos perfis."))
                        return;
                    Object.assign(t, { nome: form.nome.trim(), link: form.link ?? "", criacao: form.criacao ?? "", ativo: Boolean(form.ativo), emailsVinculados: [...(form.emailsVinculados ?? [])] });
                    if (was && !t.ativo) {
                        for (const p of next.perfis.perfis)
                            p.tarefas = p.tarefas.filter((id) => id !== t.id);
                        for (const key of Object.keys(next.layout.ordemTarefas))
                            next.layout.ordemTarefas[key] = next.layout.ordemTarefas[key].filter((id) => id !== t.id);
                    }
                    if (!was && t.ativo && !next.layout.ordemTarefas.GERAL.includes(t.id))
                        next.layout.ordemTarefas.GERAL.push(t.id);
                }
            }
            else if (tab === "email") {
                if (!form.nome?.trim())
                    throw new Error("INFORME O NOME DO E-MAIL.");
                if (next.email.emails.some((x) => x.nome.trim().toLocaleLowerCase() === form.nome.trim().toLocaleLowerCase() && x.id !== form.id))
                    throw new Error("JÁ EXISTE UM E-MAIL COM ESSE NOME.");
                if (!creating && form.ativo === false) {
                    const linked = next.tarefas.tarefas.some((t) => t.emailsVinculados.includes(form.id)) || next.email.emailsGlobais.includes(form.id);
                    if (linked)
                        throw new Error("NÃO É POSSÍVEL DESATIVAR ESTE E-MAIL ENQUANTO ELE ESTIVER VINCULADO A UMA TAREFA OU À COMPILAÇÃO GLOBAL.");
                }
                if (creating) {
                    const created = await window.controleDiario.config.novoEmail({ nome: form.nome, titulo: form.titulo ?? "", corpo: form.corpo ?? "", global: Boolean(form.global) });
                    next.email.emails.push(created);
                    if (form.global)
                        next.email.emailsGlobais = Array.from(new Set([...next.email.emailsGlobais, created.id]));
                }
                else {
                    const e = next.email.emails.find((x) => x.id === form.id);
                    if (e.ativo && !form.ativo && !window.confirm("DESATIVAR ESTE E-MAIL?"))
                        return;
                    Object.assign(e, { nome: form.nome.trim(), titulo: form.titulo ?? "", corpo: form.corpo ?? "", ativo: Boolean(form.ativo) });
                }
                if (form.id) {
                    next.email.emailsGlobais = form.global ? Array.from(new Set([...next.email.emailsGlobais, form.id])) : next.email.emailsGlobais.filter((id) => id !== form.id);
                }
            }
            await onSave(next);
            setDraft(next);
            setRoute("lista");
            setSelectedId(null);
            setCreating(false);
        }
        catch (e) {
            setLocalMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR.");
        }
    }
    async function saveLayout() { try {
        await onSave(draft);
        setLocalMessage("LAYOUT SALVO.");
    }
    catch (e) {
        setLocalMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR O LAYOUT.");
    } }
    function toggleTaskEmail(id) { setForm((f) => ({ ...f, emailsVinculados: (f.emailsVinculados ?? []).includes(id) ? (f.emailsVinculados ?? []).filter((x) => x !== id) : [...(f.emailsVinculados ?? []), id] })); }
    function toggleProfileTask(id) { setForm((f) => ({ ...f, tarefas: (f.tarefas ?? []).includes(id) ? (f.tarefas ?? []).filter((x) => x !== id) : [...(f.tarefas ?? []), id] })); }
    function renderList() {
        if (tab === "perfis")
            return _jsxs(_Fragment, { children: [_jsx("div", { className: "config-toolbar", children: _jsx("button", { onClick: startNew, children: "NOVO PERFIL" }) }), _jsxs("table", { className: "config-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "PERFIL" }), _jsx("th", { children: "STATUS" }), _jsx("th", { children: "A\u00C7\u00D5ES" })] }) }), _jsx("tbody", { children: draft.perfis.perfis.map((p) => _jsxs("tr", { children: [_jsx("td", { children: p.nome }), _jsx("td", { children: p.ativo ? "ATIVO" : "INATIVO" }), _jsx("td", { children: _jsx("button", { onClick: () => edit(p.id), children: "EDITAR" }) })] }, p.id)) })] })] });
        if (tab === "tarefas")
            return _jsxs(_Fragment, { children: [_jsx("div", { className: "config-toolbar", children: _jsx("button", { onClick: startNew, children: "NOVA TAREFA" }) }), _jsxs("table", { className: "config-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "TAREFA" }), _jsx("th", { children: "STATUS" }), _jsx("th", { children: "A\u00C7\u00D5ES" })] }) }), _jsx("tbody", { children: draft.tarefas.tarefas.map((t) => _jsxs("tr", { children: [_jsx("td", { children: t.nome }), _jsx("td", { children: t.ativo ? "ATIVO" : "INATIVO" }), _jsx("td", { children: _jsx("button", { onClick: () => edit(t.id), children: "EDITAR" }) })] }, t.id)) })] })] });
        if (tab === "email")
            return _jsxs(_Fragment, { children: [_jsx("div", { className: "config-toolbar", children: _jsx("button", { onClick: startNew, children: "NOVO E-MAIL" }) }), _jsxs("table", { className: "config-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "E-MAIL" }), _jsx("th", { children: "STATUS" }), _jsx("th", { children: "A\u00C7\u00D5ES" })] }) }), _jsx("tbody", { children: draft.email.emails.map((e) => _jsxs("tr", { children: [_jsx("td", { children: e.nome }), _jsx("td", { children: e.ativo ? "ATIVO" : "INATIVO" }), _jsx("td", { children: _jsx("button", { onClick: () => edit(e.id), children: "EDITAR" }) })] }, e.id)) })] })] });
        const blockNames = { data: "DATA", perfil: "PERFIL", tarefas: "TAREFAS", emails: "E-MAIL", observacao: "OBSERVAÇÃO", progresso: "PROGRESSO" };
        const lateral = draft.layout.expansaoLateral ?? { posicao: "direita" };
        const cr = draft.layout.criacaoRoteiro ?? { modo: "POPUP" };
        return _jsxs("div", { className: "layout-editor", children: [_jsx("h3", { children: "ORDEM DOS BLOCOS" }), _jsx("button", { onClick: () => { if (window.confirm("RESTAURAR O LAYOUT PADRÃO? A alteração só será salva após SALVAR.")) {
                        const a = clone(draft);
                        a.layout.blocos = ["data", "perfil", "tarefas", "emails", "observacao", "progresso"];
                        a.layout.ordemPerfis = a.perfis.perfis.map((p) => p.id);
                        a.layout.ordemTarefas.GERAL = a.tarefas.tarefas.filter((t) => t.ativo).map((t) => t.id);
                        for (const p of a.perfis.perfis)
                            a.layout.ordemTarefas[p.id] = p.tarefas.filter((id) => a.tarefas.tarefas.some((t) => t.id === id && t.ativo));
                        a.layout.abas = ["tarefas", "calendario"];
                        a.layout.painelLateral = { largura: 420 };
                        setDraft(a);
                    } }, children: "RESTAURAR PADR\u00C3O" }), draft.layout.blocos.map((b, i) => _jsxs("div", { className: "drag-row", draggable: true, onDragStart: e => e.dataTransfer.setData("text/plain", String(i)), onDragOver: e => e.preventDefault(), onDrop: e => { const from = Number(e.dataTransfer.getData("text/plain")); const a = clone(draft); a.layout.blocos = move(a.layout.blocos, from, i); setDraft(a); }, children: [_jsx("span", { children: "\u2630" }), blockNames[b] ?? b, _jsxs("div", { children: [_jsx("button", { disabled: i === 0, onClick: () => { const a = clone(draft); a.layout.blocos = move(a.layout.blocos, i, i - 1); setDraft(a); }, children: "\u2191" }), _jsx("button", { disabled: i === draft.layout.blocos.length - 1, onClick: () => { const a = clone(draft); a.layout.blocos = move(a.layout.blocos, i, i + 1); setDraft(a); }, children: "\u2193" })] })] }, b)), _jsx("h3", { children: "ORDEM DOS PERFIS" }), draft.layout.ordemPerfis.map((id, i) => { const p = draft.perfis.perfis.find((x) => x.id === id); return _jsxs("div", { className: "drag-row", children: [_jsx("span", { children: "\u2630" }), p?.nome ?? id, _jsxs("div", { children: [_jsx("button", { disabled: i === 0, onClick: () => { const a = clone(draft); a.layout.ordemPerfis = move(a.layout.ordemPerfis, i, i - 1); setDraft(a); }, children: "\u2191" }), _jsx("button", { disabled: i === draft.layout.ordemPerfis.length - 1, onClick: () => { const a = clone(draft); a.layout.ordemPerfis = move(a.layout.ordemPerfis, i, i + 1); setDraft(a); }, children: "\u2193" })] })] }, id); }), _jsx("h3", { children: "ORDEM DAS TAREFAS" }), _jsxs("select", { value: selectedId ?? "GERAL", onChange: e => setSelectedId(e.target.value), children: [_jsx("option", { value: "GERAL", children: "GERAL" }), draft.perfis.perfis.map((p) => _jsx("option", { value: p.id, children: p.nome }, p.id))] }), (draft.layout.ordemTarefas[selectedId ?? "GERAL"] ?? []).map((id, i) => { const t = draft.tarefas.tarefas.find((x) => x.id === id); return _jsxs("div", { className: "drag-row", children: [_jsx("span", { children: "\u2630" }), t?.nome ?? id, _jsxs("div", { children: [_jsx("button", { disabled: i === 0, onClick: () => { const a = clone(draft); a.layout.ordemTarefas[selectedId ?? "GERAL"] = move(a.layout.ordemTarefas[selectedId ?? "GERAL"], i, i - 1); setDraft(a); }, children: "\u2191" }), _jsx("button", { disabled: i === (draft.layout.ordemTarefas[selectedId ?? "GERAL"] ?? []).length - 1, onClick: () => { const a = clone(draft); a.layout.ordemTarefas[selectedId ?? "GERAL"] = move(a.layout.ordemTarefas[selectedId ?? "GERAL"], i, i + 1); setDraft(a); }, children: "\u2193" })] })] }, id); }), _jsx("h3", { children: "ABAS" }), _jsx("div", { className: "inline-checks", children: ["tarefas", "calendario"].map((id) => _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: draft.layout.abas.includes(id), onChange: () => setDraft((d) => ({ ...d, layout: { ...d.layout, abas: d.layout.abas.includes(id) ? d.layout.abas.filter((x) => x !== id) : [...d.layout.abas, id] } })) }), id.toUpperCase()] }, id)) }), _jsx("h3", { children: "PAINEL LATERAL" }), _jsx("input", { type: "number", min: "320", max: "900", value: draft.layout.painelLateral.largura, onChange: e => setDraft((d) => ({ ...d, layout: { ...d.layout, painelLateral: { ...d.layout.painelLateral, largura: Number(e.target.value) } } })) }), _jsxs("label", { children: ["POSI\u00C7\u00C3O DA EXPANS\u00C3O", _jsxs("select", { value: lateral.posicao, onChange: e => setDraft((d) => ({ ...d, layout: { ...d.layout, expansaoLateral: { posicao: e.target.value } } })), children: [_jsx("option", { value: "direita", children: "DIREITA" }), _jsx("option", { value: "esquerda", children: "ESQUERDA" })] })] }), _jsxs("label", { children: ["MODO DE CRIA\u00C7\u00C3O / ROTEIRO", _jsxs("select", { value: cr.modo, onChange: e => setDraft((d) => ({ ...d, layout: { ...d.layout, criacaoRoteiro: { modo: e.target.value } } })), children: [_jsx("option", { value: "POPUP", children: "POPUP" }), _jsx("option", { value: "EXPANS\u00C3O", children: "EXPANS\u00C3O LATERAL" })] })] }), _jsxs("div", { className: "config-actions", children: [_jsx("button", { onClick: () => setDraft(clone(initial)), children: "CANCELAR" }), _jsx("button", { className: "primary", disabled: busy, onClick: () => void saveLayout(), children: "SALVAR" })] })] });
    }
    function renderEdit() {
        if (tab === "perfis")
            return _jsxs("div", { className: "config-form", children: [_jsx("h3", { children: creating ? "NOVO PERFIL" : "EDITAR PERFIL" }), !creating && _jsxs("p", { className: "id-note", children: ["ID: ", form.id] }), _jsxs("label", { children: ["NOME", _jsx("input", { value: form.nome ?? "", onChange: e => setForm({ ...form, nome: e.target.value }) })] }), !creating && _jsxs("label", { children: ["STATUS", _jsxs("select", { value: form.ativo ? "ativo" : "inativo", onChange: e => setForm({ ...form, ativo: e.target.value === "ativo" }), children: [_jsx("option", { value: "ativo", children: "ATIVO" }), _jsx("option", { value: "inativo", children: "INATIVO" })] })] }), _jsx("h4", { children: "TAREFAS" }), activeTasks.map((t) => _jsxs("label", { className: "check-line", children: [_jsx("input", { type: "checkbox", checked: (form.tarefas ?? []).includes(t.id), onChange: () => toggleProfileTask(t.id) }), t.nome] }, t.id)), _jsxs("div", { className: "config-actions", children: [_jsx("button", { onClick: () => setRoute("lista"), children: "CANCELAR" }), _jsx("button", { className: "primary", disabled: busy, onClick: () => void saveItem(), children: "SALVAR" })] })] });
        if (tab === "tarefas")
            return _jsxs("div", { className: "config-form", children: [_jsx("h3", { children: creating ? "NOVA TAREFA" : "EDITAR TAREFA" }), !creating && _jsxs("p", { className: "id-note", children: ["ID: ", form.id] }), _jsxs("label", { children: ["NOME", _jsx("input", { value: form.nome ?? "", onChange: e => setForm({ ...form, nome: e.target.value }) })] }), _jsxs("label", { children: ["LINK", _jsx("input", { value: form.link ?? "", onChange: e => setForm({ ...form, link: e.target.value }) })] }), _jsxs("label", { children: ["CRIA\u00C7\u00C3O", _jsx("input", { value: form.criacao ?? "", onChange: e => setForm({ ...form, criacao: e.target.value }) })] }), !creating && _jsxs("label", { children: ["STATUS", _jsxs("select", { value: form.ativo ? "ativo" : "inativo", onChange: e => { if (form.ativo && !e.target.value) { } setForm({ ...form, ativo: e.target.value === "ativo" }); }, children: [_jsx("option", { value: "ativo", children: "ATIVO" }), _jsx("option", { value: "inativo", children: "INATIVO" })] })] }), _jsx("h4", { children: "E-MAILS VINCULADOS" }), draft.email.emails.map((e) => _jsxs("label", { className: "check-line", children: [_jsx("input", { type: "checkbox", disabled: !e.ativo, checked: (form.emailsVinculados ?? []).includes(e.id), onChange: () => toggleTaskEmail(e.id) }), e.nome, !e.ativo ? " (INATIVO)" : ""] }, e.id)), !creating && _jsx("button", { type: "button", onClick: () => { setRoteiro(clone(form.roteiro)); setRoteiroOpen(true); }, children: "EDITAR ROTEIRO" }), _jsxs("div", { className: "config-actions", children: [_jsx("button", { onClick: () => setRoute("lista"), children: "CANCELAR" }), _jsx("button", { className: "primary", disabled: busy, onClick: () => void saveItem(), children: "SALVAR" })] })] });
        return _jsxs("div", { className: "config-form", children: [_jsx("h3", { children: creating ? "NOVO E-MAIL" : "EDITAR E-MAIL" }), !creating && _jsxs("p", { className: "id-note", children: ["ID: ", form.id] }), _jsxs("label", { children: ["NOME", _jsx("input", { value: form.nome ?? "", onChange: e => setForm({ ...form, nome: e.target.value }) })] }), _jsxs("label", { children: ["T\u00CDTULO", _jsx("input", { value: form.titulo ?? "", onChange: e => setForm({ ...form, titulo: e.target.value }) })] }), _jsxs("label", { children: ["TEXTO", _jsx("textarea", { rows: 9, value: form.corpo ?? "", onChange: e => setForm({ ...form, corpo: e.target.value }) })] }), _jsxs("label", { className: "check-line", children: [_jsx("input", { type: "checkbox", checked: Boolean(form.global), onChange: e => setForm({ ...form, global: e.target.checked }) }), "COMPILA\u00C7\u00C3O GLOBAL"] }), !creating && _jsxs("label", { children: ["STATUS", _jsxs("select", { value: form.ativo ? "ativo" : "inativo", onChange: e => setForm({ ...form, ativo: e.target.value === "ativo" }), children: [_jsx("option", { value: "ativo", children: "ATIVO" }), _jsx("option", { value: "inativo", children: "INATIVO" })] })] }), _jsxs("div", { className: "config-actions", children: [_jsx("button", { onClick: () => setRoute("lista"), children: "CANCELAR" }), _jsx("button", { className: "primary", disabled: busy, onClick: () => void saveItem(), children: "SALVAR" })] })] });
    }
    function saveRoteiroValue(value) { if (!selectedId)
        return; const next = clone(draft); const t = next.tarefas.tarefas.find((x) => x.id === selectedId); if (!t)
        return; t.roteiro = clone(value); setDraft(next); setForm((f) => ({ ...f, roteiro: clone(value) })); setRoteiroOpen(false); }
    const roteiroInitial = roteiro ?? { linhas: 50, colunas: 5, largurasColunas: [120, 120, 120, 120, 120], celulas: {}, mesclas: [], filtro: null };
    return _jsxs("div", { className: "config-overlay", children: [_jsxs("div", { className: "config-window", children: [_jsxs("header", { className: "config-head", children: [_jsxs("div", { children: [_jsx("h2", { children: "CONFIGURA\u00C7\u00C3O" }), _jsx("span", { children: "Administra\u00E7\u00E3o do CONTROLE DI\u00C1RIO" })] }), _jsx("button", { onClick: onClose, children: "\u2715" })] }), _jsx("nav", { className: "config-tabs", children: [['perfis', '👤 PERFIS'], ['tarefas', '✅ TAREFAS'], ['email', '✉️ E-MAIL'], ['layout', '📐 LAYOUT']].map(([id, label]) => _jsx("button", { className: tab === id ? "active" : "", onClick: () => switchTab(id), children: label }, id)) }), localMessage && _jsx("div", { className: "system-message", children: localMessage }), route === "lista" && tab !== "layout" ? renderList() : route === "editar" && tab !== "layout" ? renderEdit() : renderList()] }), roteiroOpen && _jsx(RoteiroEditor, { initial: roteiroInitial, onCancel: () => setRoteiroOpen(false), onSave: saveRoteiroValue })] });
}
