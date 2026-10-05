function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function buildTaskOrder(profile, config) {
    const active = new Set(config.tarefas.tarefas.filter(t => t.ativo).map(t => t.id));
    if (!profile)
        return config.layout.ordemTarefas.GERAL?.filter(id => active.has(id)) ?? [];
    const configured = config.layout.ordemTarefas[profile.id] ?? [];
    const associated = new Set(profile.tarefas.filter(id => active.has(id)));
    return configured.filter(id => associated.has(id));
}
export function availableProfiles(config) {
    return config.layout.ordemPerfis
        .map(id => config.perfis.perfis.find(p => p.id === id))
        .filter((p) => Boolean(p?.ativo));
}
export function findProfile(config, profileId) {
    if (profileId === "GERAL")
        return null;
    return config.perfis.perfis.find(p => p.id === profileId && p.ativo) ?? null;
}
function emailSnapshot(email, concluido = false) {
    return { ...clone(email), concluido };
}
export function buildState(data, date, profileId) {
    const profile = findProfile(data.configuracao, profileId);
    const order = buildTaskOrder(profile, data.configuracao);
    const byId = new Map(data.configuracao.tarefas.tarefas.map(t => [t.id, t]));
    const emailById = new Map(data.configuracao.email.emails.map(e => [e.id, e]));
    const tasks = [];
    const linkedEmailIds = new Set();
    for (const id of order) {
        const task = byId.get(id);
        if (!task || !task.ativo)
            continue;
        const emails = [];
        for (const emailId of task.emailsVinculados) {
            const email = emailById.get(emailId);
            if (!email || !email.ativo || linkedEmailIds.has(email.id))
                continue;
            linkedEmailIds.add(email.id);
            emails.push(emailSnapshot(email, false));
        }
        tasks.push({ ...clone(task), concluida: false, emailsVinculados: emails });
    }
    const globalIds = [...new Set(data.configuracao.email.emailsGlobais)].filter(id => {
        const email = emailById.get(id);
        return Boolean(email?.ativo);
    });
    const globalEmails = globalIds.map(id => emailSnapshot(emailById.get(id), false));
    return {
        id: `${date}-${profileId}`,
        data: date,
        perfil: profile ? { id: profile.id, nome: profile.nome } : { id: "GERAL", nome: "GERAL" },
        tarefas: tasks,
        emailsGlobais: globalEmails,
        observacao: "",
        criadoEm: new Date().toISOString(),
        ultimaAlteracao: new Date().toISOString()
    };
}
export function uniqueEmailSnapshots(state) {
    const map = new Map();
    for (const email of state.emailsGlobais)
        map.set(email.id, email);
    for (const task of state.tarefas)
        for (const email of task.emailsVinculados)
            if (!map.has(email.id))
                map.set(email.id, email);
    return [...map.values()];
}
export function obligationProgress(state) {
    const emailIds = new Set();
    for (const email of state.emailsGlobais)
        emailIds.add(email.id);
    for (const task of state.tarefas)
        for (const email of task.emailsVinculados)
            emailIds.add(email.id);
    const tasksDone = state.tarefas.filter(t => t.concluida).length;
    let emailsDone = 0;
    for (const id of emailIds) {
        const global = state.emailsGlobais.find(e => e.id === id);
        const linked = state.tarefas.flatMap(t => t.emailsVinculados).find(e => e.id === id);
        if (global?.concluido || linked?.concluido)
            emailsDone++;
    }
    const total = state.tarefas.length + emailIds.size;
    const done = tasksDone + emailsDone;
    return { done, total, percentage: total ? Math.round((done / total) * 100) : 0 };
}
export function toggleTask(state, taskId, checked) {
    const next = clone(state);
    const task = next.tarefas.find(t => t.id === taskId);
    if (!task)
        throw new Error("TAREFA NÃO ENCONTRADA.");
    task.concluida = checked;
    const linkedIds = new Set(task.emailsVinculados.map(e => e.id));
    for (const t of next.tarefas)
        for (const email of t.emailsVinculados)
            if (linkedIds.has(email.id))
                email.concluido = checked;
    for (const email of next.emailsGlobais)
        if (linkedIds.has(email.id))
            email.concluido = checked;
    next.ultimaAlteracao = new Date().toISOString();
    return next;
}
export function toggleEmail(state, emailId, checked) {
    const next = clone(state);
    for (const email of next.emailsGlobais)
        if (email.id === emailId)
            email.concluido = checked;
    for (const task of next.tarefas)
        for (const email of task.emailsVinculados)
            if (email.id === emailId)
                email.concluido = checked;
    next.ultimaAlteracao = new Date().toISOString();
    return next;
}
export function setObservation(state, value) {
    const next = clone(state);
    next.observacao = value;
    next.ultimaAlteracao = new Date().toISOString();
    return next;
}
export function hasObligations(state) {
    return obligationProgress(state).total > 0;
}
