import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("controleDiario", {
  ready: true,
  sistema: {
    status: () => ipcRenderer.invoke("sistema:status"),
    autorizarGoogle: () => ipcRenderer.invoke("sistema:autorizar-google"),
    definirPastaRaiz: (folderId: string) => ipcRenderer.invoke("sistema:definir-pasta-raiz", folderId),
    selecionarPasta: () => ipcRenderer.invoke("sistema:selecionar-pasta"),
    testarConexao: () => ipcRenderer.invoke("sistema:testar-conexao")
  },
  tarefas: {
    iniciar: (payload: { data: string; perfilId: string }) => ipcRenderer.invoke("tarefas:iniciar", payload),
    trocarPerfil: (perfilId: string) => ipcRenderer.invoke("tarefas:trocar-perfil", perfilId),
    marcar: (payload: { tipo: "tarefa" | "email"; id: string; concluido: boolean }) => ipcRenderer.invoke("tarefas:marcar", payload),
    observacao: (value: string) => ipcRenderer.invoke("tarefas:observacao", value),
    concluir: () => ipcRenderer.invoke("tarefas:concluir"),
    abandonar: () => ipcRenderer.invoke("tarefas:abandonar")
  },
  config: {
    salvar: (config: unknown) => ipcRenderer.invoke("config:salvar", config),
    novaTarefa: (input: { nome:string; link:string; criacao:string }) => ipcRenderer.invoke("config:nova-tarefa", input),
    novoPerfil: (input: { nome:string; tarefas:string[] }) => ipcRenderer.invoke("config:novo-perfil", input),
    novoEmail: (input: { nome:string; titulo:string; corpo:string; global?:boolean }) => ipcRenderer.invoke("config:novo-email", input)
  },
  dados: {
    carregar: () => ipcRenderer.invoke("dados:carregar"),
    salvarEstado: (estado: unknown) => ipcRenderer.invoke("dados:salvar-estado", estado),
    salvarCalendario: (calendario: unknown) => ipcRenderer.invoke("dados:salvar-calendario", calendario)
  },
  calendario: {
    mes: (payload: { year: number; month: number }) => ipcRenderer.invoke("calendario:mes", payload),
    salvarData: (payload: { data: string; folga: boolean; feriado: boolean }) => ipcRenderer.invoke("calendario:salvar-data", payload)
  },
  historico: {
    versoes: (date: string) => ipcRenderer.invoke("historico:versoes", date),
    ler: (payload: { date: string; versao: number }) => ipcRenderer.invoke("historico:ler", payload),
    errata: (payload: { source: unknown; edited: unknown }) => ipcRenderer.invoke("historico:errata", payload)
  },
  picker: {
    getConfig: () => ipcRenderer.invoke("drive-picker:config"),
    complete: (result: { id: string; name: string }) => ipcRenderer.send("drive-picker:complete", result),
    cancel: () => ipcRenderer.send("drive-picker:cancel")
  }
});
