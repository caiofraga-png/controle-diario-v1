import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import ConfigurationPanel from "./ConfigurationPanel";
import RoteiroEditor from "./RoteiroEditor";
function today() { return new Date().toISOString().slice(0, 10); }
function brDate(value) { const [y, m, d] = value.split("-"); return `${d}/${m}/${y}`; }
const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
function monthLabel(y, m) { return `${monthNames[m - 1]} DE ${y}`; }
function dateFromParts(y, m, d) { return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function resolveEmailVariables(value) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const hoje = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const ontemDate = new Date(now);
    ontemDate.setDate(ontemDate.getDate() - 1);
    const ontem = `${pad(ontemDate.getDate())}${pad(ontemDate.getMonth() + 1)}${ontemDate.getFullYear()}`;
    return value.replaceAll("{HOJE_YYYYMMDD}", hoje).replaceAll("{ONTEM_DDMMYYYY}", ontem);
}
function App() {
    const [tab, setTab] = useState("tarefas");
    const [systemOpen, setSystemOpen] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const [status, setStatus] = useState(null);
    const [folderId, setFolderId] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [data, setData] = useState(null);
    const [selectedDate, setSelectedDate] = useState(today());
    const [observation, setObservation] = useState("");
    const [emailPanel, setEmailPanel] = useState(null);
    const [taskPanel, setTaskPanel] = useState(null);
    const [roteiroPanel, setRoteiroPanel] = useState(null);
    const [profileSwitch, setProfileSwitch] = useState(false);
    const observationTimer = useRef(null);
    const now = new Date();
    const [calendarCursor, setCalendarCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const [calendarData, setCalendarData] = useState(null);
    const [dayPanel, setDayPanel] = useState(null);
    const [versions, setVersions] = useState([]);
    const [historyRecord, setHistoryRecord] = useState(null);
    const [historySource, setHistorySource] = useState(null);
    const [historyMode, setHistoryMode] = useState(null);
    async function refresh() { const result = await window.controleDiario.sistema.status(); setStatus(result); setFolderId(result.bootstrap?.drive?.pastaRaizId ?? ""); }
    async function loadData() { try {
        const result = await window.controleDiario.dados.carregar();
        setData(result);
        if (result.estado) {
            setObservation(result.estado.observacao ?? "");
            setSelectedDate(result.estado.data);
        }
    }
    catch (e) {
        setData({ erro: e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CARREGAR OS DADOS." });
    } }
    async function loadMonth() { if (!status?.auth?.authenticated || !status?.bootstrap?.drive?.pastaRaizId)
        return; try {
        setCalendarData(await window.controleDiario.calendario.mes(calendarCursor));
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CARREGAR O CALENDÁRIO.");
    } }
    useEffect(() => { void refresh(); }, []);
    useEffect(() => { if (status?.auth?.authenticated && status?.bootstrap?.drive?.pastaRaizId)
        void loadData();
    else
        setData(null); }, [status?.auth?.authenticated, status?.bootstrap?.drive?.pastaRaizId]);
    useEffect(() => { if (tab === "calendario")
        void loadMonth(); }, [tab, calendarCursor.year, calendarCursor.month, status?.auth?.authenticated, status?.bootstrap?.drive?.pastaRaizId]);
    useEffect(() => () => { if (observationTimer.current)
        clearTimeout(observationTimer.current); }, []);
    const config = data?.configuracao, state = data?.estado;
    const profiles = useMemo(() => config ? (config.layout?.ordemPerfis ?? []).map((id) => config.perfis.perfis.find((p) => p.id === id)).filter((p) => p?.ativo) : [], [config]);
    const geralHasTasks = Boolean(config?.tarefas?.tarefas?.some((t) => t.ativo) || config?.email?.emailsGlobais?.length);
    const expansionMode = config?.layout?.criacaoRoteiro?.modo ?? "POPUP";
    const expansionPosition = config?.layout?.expansaoLateral?.posicao ?? "direita";
    function progress(s) { if (!s)
        return { done: 0, total: 0, percentage: 0 }; const ids = new Set(); for (const e of s.emailsGlobais ?? [])
        ids.add(e.id); for (const t of s.tarefas ?? [])
        for (const e of t.emailsVinculados ?? [])
            ids.add(e.id); let done = (s.tarefas ?? []).filter((t) => t.concluida).length; for (const id of ids) {
        const e = (s.emailsGlobais ?? []).find((x) => x.id === id) ?? (s.tarefas ?? []).flatMap((t) => t.emailsVinculados ?? []).find((x) => x.id === id);
        if (e?.concluido)
            done++;
    } const total = (s.tarefas ?? []).length + ids.size; return { done, total, percentage: total ? Math.round(done / total * 100) : 0 }; }
    const prog = progress(state);
    async function start(profileId) { setBusy(true); setMessage(""); try {
        await window.controleDiario.tarefas.iniciar({ data: selectedDate, perfilId: profileId });
        await loadData();
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL INICIAR O EXPEDIENTE.");
    }
    finally {
        setBusy(false);
    } }
    async function mark(tipo, id, concluido) { setBusy(true); try {
        const r = await window.controleDiario.tarefas.marcar({ tipo, id, concluido });
        setData((o) => o ? ({ ...o, estado: r.state }) : o);
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR A MARCAÇÃO.");
    }
    finally {
        setBusy(false);
    } }
    function changeObservation(value) { setObservation(value); if (observationTimer.current)
        clearTimeout(observationTimer.current); observationTimer.current = setTimeout(async () => { try {
        const r = await window.controleDiario.tarefas.observacao(value);
        setData((o) => o ? ({ ...o, estado: r }) : o);
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR A OBSERVAÇÃO.");
    } }, 600); }
    async function conclude() { if (prog.percentage !== 100)
        return; setBusy(true); try {
        await window.controleDiario.tarefas.concluir();
        await loadData();
        await loadMonth();
        setMessage("EXPEDIENTE CONCLUÍDO.");
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CONCLUIR O EXPEDIENTE.");
    }
    finally {
        setBusy(false);
    } }
    async function switchProfile(profileId) {
        if (!state || profileId === state.perfil.id) {
            setProfileSwitch(false);
            return;
        }
        const pName = profileId === "GERAL" ? "GERAL" : profiles.find((p) => p.id === profileId)?.nome ?? profileId;
        if (!window.confirm(`TROCAR PARA O PERFIL ${pName}? As marcações das tarefas/e-mails que também existirem no novo perfil serão preservadas.`))
            return;
        setBusy(true);
        setMessage("");
        try {
            await window.controleDiario.tarefas.trocarPerfil(profileId);
            await loadData();
            setProfileSwitch(false);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL TROCAR O PERFIL.");
        }
        finally {
            setBusy(false);
        }
    }
    async function saveTaskCreation(task, value) {
        if (!config)
            return;
        const next = JSON.parse(JSON.stringify(config));
        const t = next.tarefas.tarefas.find((x) => x.id === task.id);
        if (!t)
            return;
        t.criacao = value;
        setBusy(true);
        try {
            await window.controleDiario.config.salvar(next);
            await loadData();
            setTaskPanel(null);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR A CRIAÇÃO.");
        }
        finally {
            setBusy(false);
        }
    }
    async function saveTaskRoteiro(task, value) {
        if (!config)
            return;
        const next = JSON.parse(JSON.stringify(config));
        const t = next.tarefas.tarefas.find((x) => x.id === task.id);
        if (!t)
            return;
        t.roteiro = JSON.parse(JSON.stringify(value));
        setBusy(true);
        try {
            await window.controleDiario.config.salvar(next);
            await loadData();
            setRoteiroPanel(null);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR O ROTEIRO.");
        }
        finally {
            setBusy(false);
        }
    }
    async function abandon() { if (!window.confirm(`ABANDONAR EXPEDIENTE? O registro em produção de ${brDate(state.data)} será descartado. Nenhum histórico será criado.`))
        return; setBusy(true); try {
        await window.controleDiario.tarefas.abandonar();
        await loadData();
        setObservation("");
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL ABANDONAR O EXPEDIENTE.");
    }
    finally {
        setBusy(false);
    } }
    async function saveConfig(nextConfig) { setBusy(true); setMessage(""); try {
        const result = await window.controleDiario.config.salvar(nextConfig);
        setData(result);
        setMessage("CONFIGURAÇÃO SALVA.");
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR A CONFIGURAÇÃO.");
        throw e;
    }
    finally {
        setBusy(false);
    } }
    async function systemAction(action, success) { setBusy(true); setMessage(""); try {
        await action();
        await refresh();
        if (success)
            setMessage(success);
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.");
    }
    finally {
        setBusy(false);
    } }
    const specialByDate = useMemo(() => new Map((calendarData?.special ?? []).map((x) => [x.data, x])), [calendarData]);
    const completed = new Set(calendarData?.completedDates ?? []);
    const first = new Date(calendarCursor.year, calendarCursor.month - 1, 1).getDay();
    const days = new Date(calendarCursor.year, calendarCursor.month, 0).getDate();
    const cells = Array.from({ length: first + days }, (_, i) => i < first ? null : i - first + 1);
    async function openDay(date) {
        setDayPanel(date);
        setHistoryRecord(null);
        setHistoryMode(null);
        const vs = await window.controleDiario.historico.versoes(date);
        setVersions(vs);
    }
    async function openVersion(v) { const rec = await window.controleDiario.historico.ler({ date: dayPanel, versao: v }); setHistoryRecord(rec); setHistorySource(rec); setHistoryMode("view"); }
    async function saveCalendarMark(date, field) {
        if (state?.data === date) {
            setMessage("A DATA DO EXPEDIENTE EM PRODUÇÃO DEVE SER ALTERADA EM TAREFAS.");
            return;
        }
        const current = specialByDate.get(date) ?? { data: date, folga: false, feriado: false };
        const payload = { data: date, folga: field === "folga" ? !current.folga : Boolean(current.folga), feriado: field === "feriado" ? !current.feriado : Boolean(current.feriado) };
        setBusy(true);
        try {
            await window.controleDiario.calendario.salvarData(payload);
            await loadMonth();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR O CALENDÁRIO.");
        }
        finally {
            setBusy(false);
        }
    }
    function editHistoryTask(taskId, checked) { setHistoryRecord((r) => ({ ...r, tarefas: r.tarefas.map((t) => t.id === taskId ? { ...t, concluida: checked, emailsVinculados: t.emailsVinculados.map((e) => ({ ...e, concluido: checked })) } : t), emailsGlobais: r.emailsGlobais.map((e) => { const t = r.tarefas.find((x) => x.id === taskId); return t?.emailsVinculados?.some((x) => x.id === e.id) ? { ...e, concluido: checked } : e; }) })); }
    function editHistoryEmail(emailId, checked) { setHistoryRecord((r) => ({ ...r, emailsGlobais: r.emailsGlobais.map((e) => e.id === emailId ? { ...e, concluido: checked } : e), tarefas: r.tarefas.map((t) => ({ ...t, emailsVinculados: t.emailsVinculados.map((e) => e.id === emailId ? { ...e, concluido: checked } : e) })) })); }
    async function saveErrata() { if (!historySource || !historyRecord)
        return; setBusy(true); try {
        const saved = await window.controleDiario.historico.errata({ source: historySource, edited: { tarefas: historyRecord.tarefas, emailsGlobais: historyRecord.emailsGlobais, observacao: historyRecord.observacao } });
        setHistoryRecord(saved);
        setHistorySource(saved);
        setHistoryMode("view");
        setVersions(await window.controleDiario.historico.versoes(dayPanel));
        await loadMonth();
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "NÃO FOI POSSÍVEL SALVAR A ERRATA.");
    }
    finally {
        setBusy(false);
    } }
    return _jsxs("div", { className: "app", children: [_jsxs("header", { className: "header", children: [_jsx("strong", { children: "CONTROLE DI\u00C1RIO" }), _jsxs("nav", { children: [_jsx("button", { className: `tab ${tab === "tarefas" ? "active" : ""}`, onClick: () => setTab("tarefas"), children: "TAREFAS" }), _jsx("button", { className: `tab ${tab === "calendario" ? "active" : ""}`, onClick: () => setTab("calendario"), children: "CALEND\u00C1RIO" })] }), _jsxs("div", { className: "header-actions", children: [_jsx("button", { className: "system-button", onClick: () => setConfigOpen(true), children: "\u2699 CONFIGURA\u00C7\u00C3O" }), _jsx("button", { className: "system-button", onClick: () => setSystemOpen(v => !v), children: "\u2699 SISTEMA" })] })] }), configOpen && data?.configuracao && _jsx(ConfigurationPanel, { initial: data.configuracao, onSave: saveConfig, onClose: () => setConfigOpen(false), busy: busy }), systemOpen && _jsxs("aside", { className: "system-panel", children: [_jsx("h2", { children: "SISTEMA" }), _jsxs("div", { className: "system-row", children: [_jsx("span", { children: "CONTA GOOGLE" }), _jsx("strong", { children: status?.auth?.email ?? "NÃO AUTORIZADA" })] }), _jsx("div", { className: "system-actions", children: _jsx("button", { disabled: busy, onClick: () => void systemAction(() => window.controleDiario.sistema.autorizarGoogle(), "CONTA GOOGLE AUTORIZADA."), children: "AUTORIZAR GOOGLE" }) }), _jsxs("div", { className: "system-row", children: [_jsx("span", { children: "PASTA RAIZ" }), _jsx("strong", { children: folderId || "NÃO CONFIGURADA" })] }), _jsx("div", { className: "system-actions", children: _jsx("button", { disabled: busy || !status?.auth?.authenticated, onClick: () => void systemAction(() => window.controleDiario.sistema.selecionarPasta(), "PASTA RAIZ CONFIGURADA."), children: "SELECIONAR PASTA" }) }), _jsxs("div", { className: "manual-folder", children: [_jsx("input", { value: folderId, onChange: e => setFolderId(e.target.value), placeholder: "ID da pasta do Google Drive" }), _jsx("button", { disabled: busy || !status?.auth?.authenticated, onClick: () => void systemAction(() => window.controleDiario.sistema.definirPastaRaiz(folderId), "PASTA RAIZ CONFIGURADA."), children: "USAR ID" })] }), _jsx("button", { className: "test-button", disabled: busy || !folderId, onClick: () => void systemAction(() => window.controleDiario.sistema.testarConexao(), "CONEXÃO CONFIRMADA."), children: "TESTAR CONEX\u00C3O" }), message && _jsx("p", { className: "system-message", children: message })] }), _jsx("main", { className: "content", children: tab === "calendario" && !status?.auth?.authenticated ? _jsx("section", { className: "card", children: _jsx("div", { className: "profile", children: "CONFIGURE O GOOGLE DRIVE PARA INICIAR." }) }) : tab === "calendario" ? _jsxs("section", { className: "calendar-card", children: [_jsxs("div", { className: "calendar-head", children: [_jsx("button", { onClick: () => setCalendarCursor(c => c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }), children: "\u2039" }), _jsx("strong", { children: monthLabel(calendarCursor.year, calendarCursor.month) }), _jsxs("div", { children: [_jsx("button", { onClick: () => { const d = new Date(); setCalendarCursor({ year: d.getFullYear(), month: d.getMonth() + 1 }); }, children: "HOJE" }), _jsx("button", { onClick: () => setCalendarCursor(c => c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }), children: "\u203A" })] })] }), _jsxs("div", { className: "legend", children: [_jsx("span", { children: "\u26AA SEM REGISTRO" }), _jsx("span", { children: "\uD83D\uDFE2 CONCLU\u00CDDO" }), _jsx("span", { children: "\uD83D\uDD35 FOLGA" }), _jsx("span", { children: "\uD83D\uDFE1 FERIADO" })] }), _jsx("div", { className: "weekdays", children: ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(x => _jsx("span", { children: x }, x)) }), _jsx("div", { className: "calendar-grid", children: cells.map((d, i) => { if (!d)
                                return _jsx("div", { className: "day empty" }, `e${i}`); const date = dateFromParts(calendarCursor.year, calendarCursor.month, d), sp = specialByDate.get(date), done = completed.has(date), isProd = state?.data === date; let symbol = done ? "🟢" : "⚪"; if (sp?.folga)
                                symbol = "🔵"; if (sp?.feriado)
                                symbol = `🟡${sp.folga ? "🔵" : done ? "🟢" : "⚪"}`; return _jsxs("button", { className: `day ${isProd ? "production-day" : ""}`, onClick: () => void openDay(date), children: [_jsx("strong", { children: d }), _jsx("span", { children: symbol })] }, date); }) })] }) : _jsx(_Fragment, { children: !status?.auth?.authenticated || !status?.bootstrap?.drive?.pastaRaizId ? _jsxs("section", { className: "card", children: [_jsx("div", { className: "profile", children: "CONFIGURE O GOOGLE DRIVE PARA INICIAR." }), _jsxs("p", { children: ["Abra ", _jsx("strong", { children: "SISTEMA" }), ", autorize a conta Google e selecione a pasta raiz do CONTROLE DI\u00C1RIO."] })] }) : data?.erro ? _jsx("section", { className: "card", children: _jsx("div", { className: "system-message", children: data.erro }) }) : state ? _jsxs("section", { className: "work-card", children: [_jsxs("div", { className: "work-top", children: [_jsxs("div", { children: [_jsx("div", { className: "date", children: brDate(state.data) }), _jsx("div", { className: "profile", children: state.perfil.nome })] }), _jsxs("div", { className: "work-actions", children: [_jsx("button", { className: "profile-switch", disabled: busy, onClick: () => setProfileSwitch(true), children: "TROCAR PERFIL" }), _jsx("button", { className: "abandon", disabled: busy, onClick: () => void abandon(), children: "\u2715" })] })] }), _jsxs("div", { className: "progress-head", children: [_jsx("span", { children: "PROGRESSO" }), _jsxs("strong", { children: [prog.done, "/", prog.total, " \u2014 ", prog.percentage, "%"] })] }), _jsx("div", { className: "progress", children: _jsx("div", { style: { width: `${prog.percentage}%` } }) }), _jsxs("div", { className: "obligations", children: [state.tarefas.map((task) => _jsxs("div", { className: "task-row", children: [_jsxs("label", { className: "check-row", children: [_jsx("input", { type: "checkbox", checked: task.concluida, disabled: busy, onChange: e => void mark("tarefa", task.id, e.target.checked) }), task.link ? _jsx("button", { className: `task-name-link ${task.concluida ? "done" : ""}`, onMouseDown: e => e.preventDefault(), onClick: e => { e.preventDefault(); e.stopPropagation(); window.open(task.link, "_blank"); }, children: task.nome }) : _jsx("span", { className: task.concluida ? "done" : "", children: task.nome }), _jsxs("span", { className: "task-tools", children: [_jsx("button", { onClick: () => setTaskPanel(task), children: "CRIA\u00C7\u00C3O" }), _jsx("button", { onClick: () => setRoteiroPanel(task), children: "ROTEIRO" })] })] }), task.emailsVinculados?.map((email) => _jsxs("label", { className: "email-row", children: [_jsx("input", { type: "checkbox", checked: Boolean(email.concluido), disabled: busy, onChange: e => void mark("email", email.id, e.target.checked) }), _jsx("button", { className: "email-name", onClick: () => setEmailPanel(email), children: email.nome })] }, `${task.id}-${email.id}`))] }, task.id)), state.emailsGlobais?.map((email) => _jsxs("label", { className: "email-row global-email", children: [_jsx("input", { type: "checkbox", checked: Boolean(email.concluido), disabled: busy, onChange: e => void mark("email", email.id, e.target.checked) }), _jsx("button", { className: "email-name", onClick: () => setEmailPanel(email), children: email.nome })] }, `global-${email.id}`))] }), _jsxs("label", { className: "observation", children: [_jsx("span", { children: "OBSERVA\u00C7\u00C3O" }), _jsx("textarea", { value: observation, onChange: e => changeObservation(e.target.value), placeholder: "Opcional" })] }), prog.percentage === 100 && _jsx("button", { className: "conclude", disabled: busy, onClick: () => void conclude(), children: "\u2713 CONCLU\u00CDDO" }), message && _jsx("p", { className: "system-message", children: message })] }) : _jsxs("section", { className: "card start-card", children: [_jsxs("label", { className: "date-select", children: [_jsx("span", { children: "DATA" }), _jsx("input", { type: "date", value: selectedDate, onChange: e => setSelectedDate(e.target.value) })] }), _jsx("div", { className: "profile", children: "SELECIONE O PERFIL" }), _jsxs("div", { className: "profile-list", children: [geralHasTasks && _jsx("button", { disabled: busy, onClick: () => void start("GERAL"), children: "GERAL" }), profiles.map((p) => _jsx("button", { disabled: busy, onClick: () => void start(p.id), children: p.nome }, p.id))] }), _jsx("button", { className: "day-off", disabled: busy, onClick: () => { setTab("calendario"); setDayPanel(selectedDate); void openDay(selectedDate); }, children: "FOLGA / FERIADO" }), message && _jsx("p", { className: "system-message", children: message })] }) }) }), emailPanel && _jsxs("aside", { className: "side-panel", children: [_jsx("button", { className: "close-panel", onClick: () => setEmailPanel(null), children: "\u2715" }), _jsx("h2", { children: emailPanel.nome }), _jsx("h3", { children: "T\u00CDTULO" }), _jsx("pre", { children: emailPanel.titulo }), _jsx("h3", { children: "TEXTO" }), _jsx("pre", { children: emailPanel.corpo }), _jsxs("div", { className: "panel-actions", children: [_jsx("button", { onClick: () => navigator.clipboard.writeText(resolveEmailVariables(emailPanel.titulo)), children: "COPIAR T\u00CDTULO" }), _jsx("button", { onClick: () => navigator.clipboard.writeText(resolveEmailVariables(emailPanel.corpo)), children: "COPIAR TEXTO" })] })] }), profileSwitch && _jsx("div", { className: "modal-backdrop", onClick: () => setProfileSwitch(false), children: _jsxs("div", { className: "day-modal profile-switch-modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "modal-head", children: [_jsx("strong", { children: "TROCAR PERFIL" }), _jsx("button", { onClick: () => setProfileSwitch(false), children: "\u2715" })] }), _jsx("p", { children: "O expediente continua na mesma data. Marca\u00E7\u00F5es comuns ser\u00E3o preservadas." }), _jsxs("div", { className: "profile-list", children: [geralHasTasks && _jsx("button", { disabled: busy || state?.perfil.id === "GERAL", onClick: () => void switchProfile("GERAL"), children: "GERAL" }), profiles.map((p) => _jsx("button", { disabled: busy || state?.perfil.id === p.id, onClick: () => void switchProfile(p.id), children: p.nome }, p.id))] })] }) }), taskPanel && (expansionMode === "EXPANSÃO" ? _jsxs("div", { className: `side-panel ${expansionPosition}`, children: [_jsx("button", { className: "close-panel", onClick: () => setTaskPanel(null), children: "\u2715" }), _jsxs("h2", { children: ["CRIA\u00C7\u00C3O \u2014 ", taskPanel.nome] }), _jsx("p", { children: "Consultas, filtros, datas e arquivos a baixar." }), _jsx("textarea", { className: "creation-editor", value: taskPanel.criacao ?? "", disabled: busy, onChange: e => setTaskPanel({ ...taskPanel, criacao: e.target.value }) }), _jsxs("div", { className: "panel-actions", children: [_jsx("button", { disabled: busy, onClick: () => void saveTaskCreation(taskPanel, taskPanel.criacao ?? ""), children: "SALVAR" }), _jsx("button", { onClick: () => setTaskPanel(null), children: "FECHAR" })] })] }) : _jsx("div", { className: "modal-backdrop", onClick: () => setTaskPanel(null), children: _jsxs("div", { className: "day-modal creation-popup", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "modal-head", children: [_jsxs("h2", { children: ["CRIA\u00C7\u00C3O \u2014 ", taskPanel.nome] }), _jsx("button", { onClick: () => setTaskPanel(null), children: "\u2715" })] }), _jsx("p", { children: "Consultas, filtros, datas e arquivos a baixar." }), _jsx("textarea", { className: "creation-editor", value: taskPanel.criacao ?? "", disabled: busy, onChange: e => setTaskPanel({ ...taskPanel, criacao: e.target.value }) }), _jsxs("div", { className: "panel-actions", children: [_jsx("button", { disabled: busy, onClick: () => void saveTaskCreation(taskPanel, taskPanel.criacao ?? ""), children: "SALVAR" }), _jsx("button", { onClick: () => setTaskPanel(null), children: "FECHAR" })] })] }) })), roteiroPanel && _jsx(RoteiroEditor, { initial: roteiroPanel.roteiro, presentation: expansionMode === "EXPANSÃO" ? "side" : "popup", sidePosition: expansionPosition, onCancel: () => setRoteiroPanel(null), onSave: (v) => void saveTaskRoteiro(roteiroPanel, v) }), dayPanel && _jsx("div", { className: "modal-backdrop", onClick: () => setDayPanel(null), children: _jsxs("div", { className: "day-modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "modal-head", children: [_jsxs("div", { children: [_jsx("div", { className: "date", children: brDate(dayPanel) }), _jsx("div", { className: "profile", children: state?.data === dayPanel ? "EXPEDIENTE EM PRODUÇÃO" : "DATA" })] }), _jsx("button", { onClick: () => setDayPanel(null), children: "\u2715" })] }), state?.data === dayPanel && _jsx("button", { className: "primary-wide", onClick: () => { setDayPanel(null); setTab("tarefas"); }, children: "IR PARA TAREFAS" }), _jsxs("div", { className: "calendar-actions", children: [_jsx("button", { disabled: busy || state?.data === dayPanel, onClick: () => void saveCalendarMark(dayPanel, "folga"), children: "\uD83D\uDD35 FOLGA" }), _jsx("button", { disabled: busy || state?.data === dayPanel, onClick: () => void saveCalendarMark(dayPanel, "feriado"), children: "\uD83D\uDFE1 FERIADO" })] }), _jsx("h3", { children: "HIST\u00D3RICO" }), versions.length === 0 ? _jsx("p", { children: "SEM REGISTRO HIST\u00D3RICO." }) : _jsx("div", { className: "version-list", children: versions.map(v => _jsxs("button", { onClick: () => void openVersion(v.versao), children: ["R", String(v.versao).padStart(3, "0")] }, v.versao)) }), historyRecord && _jsxs("div", { className: "history-view", children: [_jsxs("div", { className: "history-head", children: [_jsxs("strong", { children: ["REGISTRO HIST\u00D3RICO \u2014 R", String(historyRecord.versao).padStart(3, "0")] }), historyMode === "view" && _jsx("button", { onClick: () => setHistoryMode("edit"), children: "EDITAR" })] }), _jsx("div", { className: "profile", children: historyRecord.perfil.nome }), historyRecord.tarefas.map((t) => _jsxs("div", { className: "history-task", children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", disabled: historyMode !== "edit" || busy, checked: t.concluida, onChange: e => editHistoryTask(t.id, e.target.checked) }), _jsx("span", { className: t.concluida ? "done" : "", children: t.nome })] }), t.emailsVinculados.map((e) => _jsxs("label", { className: "email-row", children: [_jsx("input", { type: "checkbox", disabled: historyMode !== "edit" || busy, checked: e.concluido, onChange: ev => editHistoryEmail(e.id, ev.target.checked) }), _jsx("span", { children: e.nome })] }, e.id))] }, t.id)), historyRecord.emailsGlobais.map((e) => _jsxs("label", { className: "email-row", children: [_jsx("input", { type: "checkbox", disabled: historyMode !== "edit" || busy, checked: e.concluido, onChange: ev => editHistoryEmail(e.id, ev.target.checked) }), _jsx("span", { children: e.nome })] }, `g-${e.id}`)), _jsxs("label", { className: "observation", children: [_jsx("span", { children: "OBSERVA\u00C7\u00C3O" }), _jsx("textarea", { disabled: historyMode !== "edit" || busy, value: historyRecord.observacao, onChange: e => setHistoryRecord((r) => ({ ...r, observacao: e.target.value })) })] }), historyMode === "edit" && _jsxs("div", { className: "modal-actions", children: [_jsx("button", { onClick: () => { setHistoryRecord(historySource); setHistoryMode("view"); }, children: "CANCELAR" }), _jsx("button", { className: "conclude", disabled: busy, onClick: () => void saveErrata(), children: "SALVAR ERRATA" })] })] })] }) })] });
}
createRoot(document.getElementById("root")).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
