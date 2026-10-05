import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("controleDiario", {
    ready: true,
    sistema: {
        status: () => ipcRenderer.invoke("sistema:status"),
        autorizarGoogle: () => ipcRenderer.invoke("sistema:autorizar-google"),
        definirPastaRaiz: (folderId) => ipcRenderer.invoke("sistema:definir-pasta-raiz", folderId),
        selecionarPasta: () => ipcRenderer.invoke("sistema:selecionar-pasta"),
        testarConexao: () => ipcRenderer.invoke("sistema:testar-conexao")
    },
    tarefas: {
        iniciar: (payload) => ipcRenderer.invoke("tarefas:iniciar", payload),
        trocarPerfil: (perfilId) => ipcRenderer.invoke("tarefas:trocar-perfil", perfilId),
        marcar: (payload) => ipcRenderer.invoke("tarefas:marcar", payload),
        observacao: (value) => ipcRenderer.invoke("tarefas:observacao", value),
        concluir: () => ipcRenderer.invoke("tarefas:concluir"),
        abandonar: () => ipcRenderer.invoke("tarefas:abandonar")
    },
    config: {
        salvar: (config) => ipcRenderer.invoke("config:salvar", config),
        novaTarefa: (input) => ipcRenderer.invoke("config:nova-tarefa", input),
        novoPerfil: (input) => ipcRenderer.invoke("config:novo-perfil", input),
        novoEmail: (input) => ipcRenderer.invoke("config:novo-email", input)
    },
    dados: {
        carregar: () => ipcRenderer.invoke("dados:carregar"),
        salvarEstado: (estado) => ipcRenderer.invoke("dados:salvar-estado", estado),
        salvarCalendario: (calendario) => ipcRenderer.invoke("dados:salvar-calendario", calendario)
    },
    calendario: {
        mes: (payload) => ipcRenderer.invoke("calendario:mes", payload),
        salvarData: (payload) => ipcRenderer.invoke("calendario:salvar-data", payload)
    },
    historico: {
        versoes: (date) => ipcRenderer.invoke("historico:versoes", date),
        ler: (payload) => ipcRenderer.invoke("historico:ler", payload),
        errata: (payload) => ipcRenderer.invoke("historico:errata", payload)
    },
    picker: {
        getConfig: () => ipcRenderer.invoke("drive-picker:config"),
        complete: (result) => ipcRenderer.send("drive-picker:complete", result),
        cancel: () => ipcRenderer.send("drive-picker:cancel")
    }
});
