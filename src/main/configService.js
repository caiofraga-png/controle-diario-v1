function clone(v) { return JSON.parse(JSON.stringify(v)); }
function nextId(prefix, ids) {
    const max = ids.map(id => { const m = new RegExp(`^${prefix}(\\d+)$`).exec(id); return m ? Number(m[1]) : 0; }).reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
function uniqueName(items, name, exceptId) {
    const n = name.trim().toLocaleLowerCase();
    return !items.some(x => x.nome.trim().toLocaleLowerCase() === n && (exceptId ? x.id !== exceptId : true));
}
export function blankRoteiro() { return { linhas: 50, colunas: 5, largurasColunas: [120, 120, 120, 120, 120], celulas: {}, mesclas: [], filtro: null }; }
export function createTask(config, input) {
    const nome = input.nome.trim();
    if (!nome)
        throw new Error("INFORME O NOME DA TAREFA.");
    if (!uniqueName(config.tarefas.tarefas, nome))
        throw new Error("JÁ EXISTE UMA TAREFA COM ESSE NOME.");
    if (input.link && !/^https?:\/\//i.test(input.link))
        throw new Error("O LINK DA TAREFA DEVE COMEÇAR COM HTTP:// OU HTTPS://.");
    return { id: nextId("T", config.tarefas.tarefas.map(x => x.id)), nome, link: input.link.trim(), criacao: input.criacao, roteiro: blankRoteiro(), emailsVinculados: [], ativo: false };
}
export function createProfile(config, nome, tarefas) {
    const n = nome.trim();
    if (!n)
        throw new Error("INFORME O NOME DO PERFIL.");
    if (!uniqueName(config.perfis.perfis, n))
        throw new Error("JÁ EXISTE UM PERFIL COM ESSE NOME.");
    return { id: nextId("P", config.perfis.perfis.map(x => x.id)), nome: n, tarefas: [...new Set(tarefas)], ativo: false };
}
export function createEmail(config, input) {
    const nome = input.nome.trim();
    if (!nome)
        throw new Error("INFORME O NOME DO E-MAIL.");
    if (!uniqueName(config.email.emails, nome))
        throw new Error("JÁ EXISTE UM E-MAIL COM ESSE NOME.");
    return { id: nextId("M", config.email.emails.map(x => x.id)), nome, titulo: input.titulo, corpo: input.corpo, ativo: false };
}
export function deactivateTaskBundle(config, taskId) {
    const next = clone(config);
    const task = next.tarefas.tarefas.find(x => x.id === taskId);
    if (!task)
        throw new Error("TAREFA NÃO ENCONTRADA.");
    task.ativo = false;
    for (const p of next.perfis.perfis)
        p.tarefas = p.tarefas.filter(id => id !== taskId);
    next.layout.ordemTarefas.GERAL = (next.layout.ordemTarefas.GERAL ?? []).filter(id => id !== taskId);
    for (const key of Object.keys(next.layout.ordemTarefas))
        next.layout.ordemTarefas[key] = next.layout.ordemTarefas[key].filter(id => id !== taskId);
    return next;
}
export function reactivateTaskBundle(config, taskId) {
    const next = clone(config);
    const task = next.tarefas.tarefas.find(x => x.id === taskId);
    if (!task)
        throw new Error("TAREFA NÃO ENCONTRADA.");
    task.ativo = true;
    const geral = next.layout.ordemTarefas.GERAL ?? [];
    if (!geral.includes(taskId))
        geral.push(taskId);
    next.layout.ordemTarefas.GERAL = geral;
    return next;
}
export function setProfileTaskAssociations(config, profileId, tarefas) {
    const next = clone(config);
    const p = next.perfis.perfis.find(x => x.id === profileId);
    if (!p)
        throw new Error("PERFIL NÃO ENCONTRADO.");
    const active = new Set(next.tarefas.tarefas.filter(t => t.ativo).map(t => t.id));
    p.tarefas = [...new Set(tarefas)].filter(id => active.has(id));
    const current = next.layout.ordemTarefas[profileId] ?? [];
    const selected = new Set(p.tarefas);
    const ordered = current.filter(id => selected.has(id));
    for (const id of p.tarefas)
        if (!ordered.includes(id))
            ordered.push(id);
    next.layout.ordemTarefas[profileId] = ordered;
    return next;
}
export function updateLayout(config, layout) { const next = clone(config); next.layout = clone(layout); return next; }
