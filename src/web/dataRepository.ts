import type { CalendarioData, Email, Perfil, Tarefa } from "../shared/types/domain";
import type { EstadoAtual, RegistroHistorico } from "../shared/types/state";
import { DriveService, STRUCTURE, type DriveMeta } from "./webDriveService";

export interface LayoutConfig {
  schemaVersion: 1;
  blocos: string[];
  ordemPerfis: string[];
  ordemTarefas: Record<string, string[]>;
  abas: string[];
  painelLateral: { largura: number };
  expansaoLateral?: { posicao: "esquerda" | "direita" };
  criacaoRoteiro?: { modo: "POPUP" | "EXPANSÃO" };
}

export interface Configuracao {
  tarefas: { schemaVersion: 1; tarefas: Tarefa[] };
  perfis: { schemaVersion: 1; perfis: Perfil[] };
  email: { schemaVersion: 1; emails: Email[]; emailsGlobais: string[] };
  layout: LayoutConfig;
}

export interface LoadedData {
  configuracao: Configuracao;
  calendario: { schemaVersion: 1; datas: CalendarioData[] };
  estado: EstadoAtual | null;
}

const EMPTY_CALENDAR = (): LoadedData["calendario"] => ({ schemaVersion: 1, datas: [] });
const EMPTY_STATE = { schemaVersion: 1 as const, estado: null };

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}

function assertSchema(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertObject(value, message);
  if (value.schemaVersion !== 1) throw new Error(message);
}

function assertString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string") throw new Error(message);
}

export function validateTarefas(value: unknown): Configuracao["tarefas"] {
  assertSchema(value, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.tarefas)) throw new Error("O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const tarefa of value.tarefas) {
    assertObject(tarefa, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    assertString(tarefa.id, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    assertString(tarefa.nome, "O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
    if (ids.has(tarefa.id)) throw new Error("HÁ IDs DE TAREFA DUPLICADOS.");
    ids.add(tarefa.id);
    if (typeof tarefa.ativo !== "boolean" || !Array.isArray(tarefa.emailsVinculados)) throw new Error("O ARQUIVO DE TAREFAS ESTÁ INVÁLIDO.");
  }
  return value as Configuracao["tarefas"];
}

export function validatePerfis(value: unknown): Configuracao["perfis"] {
  assertSchema(value, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.perfis)) throw new Error("O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const perfil of value.perfis) {
    assertObject(perfil, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    assertString(perfil.id, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    assertString(perfil.nome, "O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    if (ids.has(perfil.id) || typeof perfil.ativo !== "boolean" || !Array.isArray(perfil.tarefas)) throw new Error("O ARQUIVO DE PERFIS ESTÁ INVÁLIDO.");
    ids.add(perfil.id);
  }
  return value as Configuracao["perfis"];
}

export function validateEmails(value: unknown): Configuracao["email"] {
  assertSchema(value, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.emails) || !Array.isArray(value.emailsGlobais)) throw new Error("O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
  const ids = new Set<string>();
  for (const email of value.emails) {
    assertObject(email, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.id, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.nome, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.titulo, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    assertString(email.corpo, "O ARQUIVO DE E-MAIL ESTÁ INVÁLIDO.");
    if (ids.has(email.id) || typeof email.ativo !== "boolean") throw new Error("HÁ IDs DE E-MAIL DUPLICADOS OU INVÁLIDOS.");
    ids.add(email.id);
  }
  return value as Configuracao["email"];
}

export function validateLayout(value: unknown): LayoutConfig {
  assertSchema(value, "O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.blocos) || !Array.isArray(value.ordemPerfis) || !value.ordemTarefas || !Array.isArray(value.abas)) throw new Error("O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  assertObject(value.painelLateral, "O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  if (typeof value.painelLateral.largura !== "number") throw new Error("O ARQUIVO DE LAYOUT ESTÁ INVÁLIDO.");
  return value as unknown as LayoutConfig;
}

function validateCalendar(value: unknown): LoadedData["calendario"] {
  assertSchema(value, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.datas)) throw new Error("O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  for (const item of value.datas) {
    assertObject(item, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
    assertString(item.data, "O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
    if (typeof item.folga !== "boolean" || typeof item.feriado !== "boolean" || (!item.folga && !item.feriado)) throw new Error("O ARQUIVO DE CALENDÁRIO ESTÁ INVÁLIDO.");
  }
  return value as LoadedData["calendario"];
}

function validateState(value: unknown): EstadoAtual | null {
  assertSchema(value, "O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (value.estado === null) return null;
  assertObject(value.estado, "O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (typeof value.estado.id !== "string" || typeof value.estado.data !== "string" || typeof value.estado.observacao !== "string") throw new Error("O ESTADO ATUAL ESTÁ INVÁLIDO.");
  if (!Array.isArray(value.estado.tarefas) || !Array.isArray(value.estado.emailsGlobais)) throw new Error("O ESTADO ATUAL ESTÁ INVÁLIDO.");
  return value.estado as unknown as EstadoAtual;
}


function validateConfigurationConsistency(config: Configuracao) {
  const taskIds = new Set(config.tarefas.tarefas.map(t => t.id));
  const emailIds = new Set(config.email.emails.map(e => e.id));
  const profileIds = new Set(config.perfis.perfis.map(p => p.id));
  for (const task of config.tarefas.tarefas) {
    for (const emailId of task.emailsVinculados) {
      const taskOwnedEmail = emailId === `${task.id}_EMAIL`;
      if (typeof emailId !== "string" || (!emailIds.has(emailId) && !taskOwnedEmail)) {
        throw new Error(`A TAREFA ${task.id} POSSUI E-MAIL VINCULADO INEXISTENTE.`);
      }
    }
  }
  for (const profile of config.perfis.perfis) {
    for (const taskId of profile.tarefas) {
      if (typeof taskId !== "string" || !taskIds.has(taskId)) throw new Error(`O PERFIL ${profile.id} POSSUI TAREFA INEXISTENTE.`);
    }
  }
  for (const emailId of config.email.emailsGlobais) {
    if (typeof emailId !== "string" || !emailIds.has(emailId)) throw new Error("A COMPILAÇÃO GLOBAL POSSUI E-MAIL INEXISTENTE.");
  }
  if (config.layout.expansaoLateral && !["esquerda", "direita"].includes(config.layout.expansaoLateral.posicao)) {
    throw new Error("A POSIÇÃO DA EXPANSÃO LATERAL ESTÁ INVÁLIDA.");
  }
  if (config.layout.criacaoRoteiro && !["POPUP", "EXPANSÃO"].includes(config.layout.criacaoRoteiro.modo)) {
    throw new Error("O MODO DE CRIAÇÃO/ROTEIRO ESTÁ INVÁLIDO.");
  }
  for (const id of config.layout.ordemPerfis) if (!profileIds.has(id)) throw new Error("O LAYOUT POSSUI PERFIL INEXISTENTE.");
  for (const [profileId, order] of Object.entries(config.layout.ordemTarefas)) {
    if (profileId !== "GERAL" && !profileIds.has(profileId)) throw new Error("O LAYOUT POSSUI ORDEM DE PERFIL INEXISTENTE.");
    for (const taskId of order) if (!taskIds.has(taskId)) throw new Error("O LAYOUT POSSUI TAREFA INEXISTENTE.");
  }
}

const KNOWN_TASK_CREATION: Record<string, string> = {
  T001: `Pesquisa de Tickets
Tipo: Tecnico
Tipo de data: Abertura de Ticket
Data do dia analisado
Estados: Todos
Baixar e Salvar arquivo ESTATISTICAS - SUPORTE`,
  T002: `Pesquisar ticket
Fila : SAC::SUPORTE::RETORNO
Tipo de data: Encerramento do Ticket
Data do dia analisado
Estados: Encerrados
Baixar e Salvar arquivo CALLBACK`,
  T003: `Pesquisar ticket
Tipo: Técnico, Financeiro, Comercial
Tipo de data: Encerramento do Ticket
Data do dia analisado
Estados: Encerrados
Criador por (login): root@localhost
Filtrar em Filas e retirar SAC: Mambo (se houver)
Baixar e Salvar arquivo PRODUTIVIDADE SAC - SEM MAMBO - GERAL

Pesquisar ticket
Tipo: Técnico, Financeiro, Comercial
Tipo de data: Abertura do Ticket
Data do dia analisado
Estados: Todos
Criador por (login): root@localhost
Filtrar em Filas e retirar SAC: Mambo (se houver)
Baixar e Salvar arquivo PRODUTIVIDADE SAC - SEM MAMBO - ABERTAS`,
  T004: `Pesquisa de Tickets
Tipo: Técnico
Tipo de data: Abertura de Ticket
Data do dia analisado
Marcar CHAT e SAC (Receptivo)
Baixar e Salvar arquivo CHAT MIDIAS - SUPORTE`,
  T005: `Pesquisa de Tickets
Tipo: Tecnico
Data: Abertura de Ticket
Data do dia anterior
Estados: Todos e pesquisar
Baixar e Salvar arquivo VOLUMETRIA SUPORTE`,
  T006: `NÃO HÁ`,
  T007: `Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Atividade criada em
Data do dia anterior
Estados: Abertas
Baixar e Salvar arquivo MANUTENÇÃO ABERTAS DO DIA

Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Demanda do dia
Data do dia anterior
Estados: Feitas
Baixar e Salvar arquivo MANUTENÇÃO DEMANDA DO DIA

Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Atividade criada em
De: 03 meses atrás Até: Dia anterior
Estados: Abertas
Baixar e Salvar arquivo MANUTENÇÃO TODAS ABERTAS`
};

const KNOWN_TASK_ROTEIRO: Record<string, string> = {
  T001: `Pesquisa de Tickets
Tipo: Tecnico
Tipo de data: Abertura de Ticket
Data do dia analisado
Estados: Todos
Baixar e Salvar arquivo ESTATISTICAS - SUPORTE

Utilizar separador BD ESTAT SUP
Copiar dados da aba ESTAT SUP

Colar dados na planilha, aba RESOLUÇÃO SUPORTE

Arrastar fórmula da coluna ABERTO E FECHADO NO MESMO DIA
Arrastar fórmula das colunas: SETOR, RESOLVIDO?, ALL e DATA

Ajustar dados e aguardar planilha atualizar tudo antes de encerrar`,
  T002: `Pesquisar ticket
Fila : SAC::SUPORTE::RETORNO
Tipo de data: Encerramento do Ticket
Data do dia analisado
Estados: Encerrados
Baixar e Salvar arquivo CALLBACK
Alimentar planilha e bater colunas

ATENÇÃO: Na aba Dinâmica
Na tabela CLOSED CALLBACK / DIA, deixar somente os callbacks atuais.
Na tabela CLOSED SEM SER CALLBACK, deixar todos exceto os callbacks atuais.

(Se der erro na coluna "tempo de transferência", necessário formatar hora)
(Se der erro na dinâmica, necessário excluir os assistentes "Call Back" da lista "CLOSED SEM SER CALLBACK"`,
  T003: `SEM MAMBO - GERAL
Pesquisar ticket
Tipo: Técnico, Financeiro, Comercial
Tipo de data: Encerramento do Ticket
Data do dia analisado
Estados: Encerrados
Criador por (login): root@localhost
Filtrar em Filas e retirar SAC: Mambo (se houver)
Baixar e Salvar arquivo PRODUTIVIDADE SAC - SEM MAMBO - GERAL

SEM MAMBO - ABERTAS
Pesquisar ticket
Tipo: Técnico, Financeiro, Comercial
Tipo de data: Abertura do Ticket
Data do dia analisado
Estados: Todos
Criador por (login): root@localhost
Filtrar em Filas e retirar SAC: Mambo (se houver)
Baixar e Salvar arquivo PRODUTIVIDADE SAC - SEM MAMBO - ABERTAS

Checagem: Acessar a aba dinâmica e checar se a data do dia consta na tabela.`,
  T004: `Pesquisa de Tickets
Tipo: Técnico
Tipo de data: Abertura de Ticket
Data do dia analisado
Marcar CHAT e SAC (Receptivo)
Baixar e Salvar arquivo CHAT MIDIAS - SUPORTE

Utilizar separador BD VOL MIDIAS
Copiar dados da aba VOL MIDIAS
Colar na aba BD da planilha SUPORTE - AUTO MIDIAS

Bater colunas e eliminar N/A (se houver)
Conferir script nas colunas:
DATA ABERTURA, DATA ENCERRAMENTO, HORA ABERTURA, HORA ENCERRAMENTO e BH.
Apagar linhas vazias

Filtrar planilha:
Coluna "chat encerrado" > Classificar Z a A
Ajustar qualquer formato incorreto, copiando "chat aberto" aumentando o tempo no mínimo até final 9

Coluna "chat aberto" > Classificar A a Z
Bater coluna "chat encerrado" até o fim para ver se há alguma célula vazia.
Se houver, entrar no ticket e encerrar chat de acordo com cada situação.
DESATIVAR FILTRO

Retornar ao gráfico do Beta, selecionar CANAL
Inserir dados correspondentes na aba MODELO MENSAL

REPETIR TODO O PROCEDIMENTO PARA FINANCEIRO E COMERCIAL`,
  T005: `Na planilha, selecionar a aba oculta do dia
Pesquisa de Tickets
Tipo: Tecnico
Data: Abertura de Ticket
Data do dia anterior
Estados: Todos e pesquisar
Baixar e Salvar arquivo VOLUMETRIA SUPORTE
No arquivo, filtrar subtipo Oscilacao, levar tickets para a planilha e salvar arquivo OSCILACAO
No arquivo, filtrar subtipo Inconformidade, levar tickets para a planilha e salvar arquivo INCONFORMIDADE

No gráfico do Beta, selecionar Status>Aberto
Em Subtipos, copiar a lista e alimentar planilha GERAL - ATENDIMENTOS ABERTOS
No gráfico do Beta, selecionar Status>Encerrados (os dois tipos)
Em Subtipos, copiar a lista e alimentar planilha GERAL - ATENDIMENTOS ENCERRADOS

Pesquisar ticket no beta novamente sendo agora Chat e SAC (Receptivo)
Baixar e Salvar arquivo VOLUMETRIA SUPORTE MIDIAS
No gráfico do Beta, selecionar Status>Aberto
Em Subtipos, copiar a lista e alimentar planilha MIDIAS - ATENDIMENTOS ABERTOS
No gráfico do Beta, selecionar Status>Encerrados
Em Subtipos, copiar a lista e alimentar planilha MIDIAS - ATENDIMENTOS ENCERRADOS

ANÁLISE DE DADOS:
1- AUTO CONFIG não pode estar no top3 das estatísticas
(Caso esteja no top3, copiar ela na célula correspondente na base de mídias e depois deletar a informação dela acima)
2- Tratar os subtipos rosa (substituir sem tipo por abandono, renomear, etc)
3 - Bater os resultados totais e conferir

ANALISAR OSCILACAO E INCONFORMIDADE
Colocar nome de quem fechou e classificar
ATENÇÃO Conferir na planilha se bate fechados e gerados

ENVIAR EMAIL para liderança e backoffice anexando os 4 arquivos
Não esquecer de copiar as duas tabelas no email`,
  T006: `SOS > MENU > CALLCENTER > TELEFONIA > FILAS
Selecionar uma fileira por vez
Pesquisar a data do dia
Contar ATENDIDAS e RETORNO
Copiar campo TEMPO MÉDIO ATENDIDO e colar na célula correspondente na aba TMA/ABANDONO GERAL`,
  T007: `Coletar arquivos
Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Atividade criada em
Data do dia anterior
Estados: Abertas
Baixar e Salvar arquivo MANUTENÇÃO ABERTAS DO DIA

Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Demanda do dia
Data do dia anterior
Estados: Feitas
Baixar e Salvar arquivo MANUTENÇÃO DEMANDA DO DIA

Pesquisar Atividades
Tipo: Manutenção
Tipo Data: Atividade criada em
De: 03 meses atrás Até: Dia anterior
Estados: Abertas
Baixar e Salvar arquivo MANUTENÇÃO TODAS ABERTAS

Abrir arquivo DEMANDA DO DIA

Colar no separador BD MANUT FEITAS
Copiar conteúdo da aba MANUT FEITAS e lançar na planilha, na aba de mesmo nome

1- Arrastar script das colunas MEIO DE CONTATO e SETOR
2- Ajustar FORMATAR>NÚMERO>DATA na coluna DATA ATIV. CRIADA
3- Arrastar script das colunas:
DIAS Ñ UTEIS, HORAS DIAS Ñ UTEIS, TEMPO REAL (ATÉ), TEMPO TOTAL, SLA e STATUS
4- Ajustar FORMATAR>NÚMERO>DATA na coluna DATA DA VISITA/TICKET
5- Arrastar script das colunas TENT. DE VISITA - 1º OS E TENT. DE VISITA - EM 3 OS
6- Verificar a linha preenchida na coluna MOTIVO DO CANCELAMENTO - 1º OS
7- Inserir a linha no botão da planilha, aba MODELO EMAIL AUTO
8- Arrastar script das colunas:
CONV. HORAS - REAIS, T. TOTAL - 1º OS, T. TOTAL - 2º OS, T. TOTAL - 3º OS e PREF. START/END

Corrigir os bairros. Eliminar linhas vazias.
Na aba MANUT PRAZO, abrir filtro:
1- Filtrar ✅ na coluna STATUS e eliminar todas as linhas.
2- Ordenar em ordem alfabética a coluna TICKET DA VISITA
3- Fechar filtro
Abrir arquivo ABERTAS DO DIA

Abrir arquivo ABERTAS DO DIA
Conferir se não há TESTE, DESENVOLVIMENTO e LIXEIRA

Colar no separador BD MANUT PRAZO
Copiar conteúdo da aba MANUT PRAZO e lançar na planilha, na aba de mesmo nome

1- Arrastar script das colunas MEIO DE CONTATO e SETOR
2- Ajustar FORMATAR>NÚMERO>DATA HORA na coluna DATA ATIV. CRIADA
3- Arrastar script das colunas DIAS Ñ UTEIS, HORAS DIAS Ñ UTEIS, TEMPO REAL (ATÉ), TEMPO TOTAL, SLA e STATUS
4- Arrastar script das colunas TENT. DE VISITA - 1º OS E TENT. DE VISITA - EM 3 OS
5- Arrastar script das colunas CONV. HORAS - REAIS, T. TOTAL - 1º OS, T. TOTAL - 2º OS, T. TOTAL - 3º OS e PREF. START/END

Eliminar linhas vazias.
Criar filtro SELECIONANDO DA ÚLTIMA LINHA ATÉ O TOPO.
Filtrar ordem alfabética na coluna TICKET DA VISITA

Abrir arquivo TODAS ABERTAS

Filtrar coluna ticket em ordem crescente
Eliminar linhas contendo: TESTE, DESENVOLVIMENTO e LIXEIRA
Filtrar coluna subtipo: LOS e LOS AUTO
Filtrar coluna estado atividade: Pendente Tarefa
Filtrar coluna conectado: SIM
Analisar cada ticket e verificar se podemos encerrar atividade.
Eliminar do arquivo os tickets que forem encerrados após análise.

Selecionar a lista de ticket e colar na planilha MANUT PRAZO abaixo do filtro
A lista colada deverá ficar totalmente verde
Na lista de tickets filtrados acima, selecionar Filtro> Filtrar por cor> Cor de preenchimento > Branco
Na coluna STATUS, filtrar apenas 🕒
Ocultar colunas, de DESCONTO até PREF. END.

Analisar cada ticket, identificar motivo do cancelamento na coluna RESOLUÇÃO DA VISITA e mudar o 🕒 para 📞
Ao final, mostrar colunas ocultas, desfazer filtros do Status e Cor de preenchimento.
Apagar lista de tickets abaixo do filtro.

Filtrar novamente coluna STATUS> 🕒
Filtrar TICKET DA VISITA em ordem crescente
Colar novamente a lista de tickets TODAS ABERTAS ao lado da coluna TICKET DA VISITA
Conferir se as listas são idênticas.

Copiar o arquivo TODAS ABERTAS e colar no separador BD MANUT PRAZO
Na aba TODAS ABERTAS:
1- Copiar a coluna "fila atual" e substituir na coluna homônima em MANUT PRAZO
2- Copiar a coluna "estado_atividade" e substituir na coluna homônima em MANUT PRAZO
3- Copiar colunas "motivo_cancel", "visitas canceladas", "priorityStart" e "priorityEnd"
e lançar nas colunas homônimas em MANUT PRAZO.

Verifica a linha do primeiro "MOTIVO DO CANCELAMENTO - 1º OS" substituído e
insira no botão "SEPARAR MOTIVO CANCELAMENTO - ABERTAS" na aba MODELO EMAIL AUTO. Aperte o botão.

Após isso, verificar na coluna "VISITAS CANCELADAS":
Todo ticket que tiver o valor 3 ou mais (e a célula vermelha), devemos copiar o motivo da primeira visita no ticket e
atualizar na planilha.

Desfaça o filtro na coluna STATUS, ordene BAIRRO e CIDADE em ordem crescente e corrija.
Após correção, filtre de forma crescente a coluna TICKET DA VISITA e remova o filtro.

NUNCA ESQUECER DE ARRASTAR E CONFERIR TODAS AS COLUNAS DE FÓRMULAS
IMPORTANTE: VERIFICAR SUBTIPO (A-Z) E CORRIGIR SUBTIPOS ESTRANHOS (AMBAS ABAS)

BATER CONTAGEM:
1- "Total de manutenções", bater com as linhas do arquivo TODAS ABERTAS
2 - Fechar e Salvar arquivo TODAS ABERTAS
3 - "Total de visitas feitas", bater com as linhas do arquivo DEMANDA DO DIA
4 - Fechar e Salvar arquivo DEMANDA DO DIA
5 - Mandar email para liderança e backoffice. NAO ESQUECER ANEXOS`
};

function hydrateKnownTaskCreation(config: Configuracao): { config: Configuracao; changed: boolean } {
  const next = JSON.parse(JSON.stringify(config)) as Configuracao;
  let changed = false;
  for (const task of next.tarefas.tarefas) {
    const creation = KNOWN_TASK_CREATION[task.id];
    if (creation && !task.criacao?.trim()) {
      task.criacao = creation;
      changed = true;
    }
  }
  return { config: next, changed };
}

function hydrateKnownTaskRoteiro(config: Configuracao): { config: Configuracao; changed: boolean } {
  const next = JSON.parse(JSON.stringify(config)) as Configuracao;
  let changed = false;
  for (const task of next.tarefas.tarefas) {
    const roteiro = KNOWN_TASK_ROTEIRO[task.id];
    if (roteiro && (!task.roteiro || Object.keys(task.roteiro.celulas ?? {}).length === 0)) {
      const linhas = roteiro.split("\n").length;
      task.roteiro = {
        ...task.roteiro,
        linhas: Math.max(task.roteiro?.linhas ?? 50, linhas),
        colunas: task.roteiro?.colunas ?? 5,
        celulas: Object.fromEntries(roteiro.split("\n").map((linha, index) => [`A${index + 1}`, { valor: linha }]))
      };
      changed = true;
    }
  }
  return { config: next, changed };
}

const KNOWN_TASK_LINKS: Record<string, string> = {
  T001: "https://docs.google.com/spreadsheets/d/10iFhG9pdTM2awgknPvZSsa3GhWWHs3ot8WmpeKJf250/edit?gid=0#gid=0",
  T002: "https://docs.google.com/spreadsheets/d/1rsHfwSQnzl-44xzzZqXs1K2l1HnbrJ0KOJDBYg3F9tw/edit?gid=1933790308#gid=1933790308",
  T003: "https://docs.google.com/spreadsheets/d/1a6uNsOn1cmj5-oQfC17fX8ASnHVNovd2hPwPWrTc35k/edit?gid=1854971753#gid=1854971753",
  T004: "https://drive.google.com/drive/u/0/folders/1g1dXDPvlZht7StOO8qBTxK0dJUn7Wgps",
  T005: "https://docs.google.com/spreadsheets/d/1SbuL_4ZuAIbneVovYD8DErGxGjx3wSUZRegbdMXbTAM/edit?gid=1465443564#gid=1465443564",
  T006: "https://docs.google.com/spreadsheets/d/11PA6LjBotLbD5-yBczgt1l_w1OLN_adqeVRKJ5yyjJI/edit?gid=1100969615#gid=1100969615",
  T007: "https://docs.google.com/spreadsheets/d/1TvtlVb-nRYYoPafwGuBM90H4AuyYZtDPABS3poLRh0E/edit?gid=1299604657#gid=1299604657"
};

function hydrateKnownTaskLinks(config: Configuracao): { config: Configuracao; changed: boolean } {
  const next = JSON.parse(JSON.stringify(config)) as Configuracao;
  let changed = false;
  for (const task of next.tarefas.tarefas) {
    const link = KNOWN_TASK_LINKS[task.id];
    if (link && !task.link) { task.link = link; changed = true; }
    if ((task.id === "T005" || task.id === "T007") && !task.emailsVinculados.includes(`${task.id}_EMAIL`)) {
      task.emailsVinculados.push(`${task.id}_EMAIL`);
      changed = true;
    }
  }
  return { config: next, changed };
}

function defaultConfiguration(): Configuracao {
  const tarefas = [
    ["T001","DADOS ESTATÍSTICOS - SUPORTE"],
    ["T002","ATENDIMENTOS - CALL BACK"],
    ["T003","PRODUTIVIDADE SAC - SEM MAMBO"],
    ["T004","VOLUMETRIA - MÍDIAS"],
    ["T005","VOLUMETRIA - SUPORTE"],
    ["T006","LIGAÇÕES"],
    ["T007","ESTATÍSTICA - MANUTENÇÃO"]
  ].map(([id,nome]) => ({
    id, nome, link: "", criacao: "",
    roteiro: { linhas: 50, colunas: 5, largurasColunas: [120,120,120,120,120], celulas: {}, mesclas: [], filtro: null },
    emailsVinculados: id === "T005" || id === "T007" ? [`${id}_EMAIL`] : [], ativo: true
  }));
  const perfis = [
    { id: "P001", nome: "MÍDIAS", tarefas: ["T001","T002","T003","T004","T005"], ativo: true },
    { id: "P002", nome: "LIGAÇÕES", tarefas: ["T006","T007"], ativo: true }
  ];
  const email = {
    schemaVersion: 1 as const,
    emails: [{
      id: "M001",
      nome: "COMPILAÇÃO DE DADOS",
      titulo: "MID{HOJE_YYYYMMDD} - COMPILAÇÃO DE DADOS - {ONTEM_DDMMYYYY}",
      corpo: "Prezados,\\n\\nSeguem em anexo os arquivos utilizados na análise de dados de hoje.",
      ativo: true
    }],
    emailsGlobais: ["M001"]
  };
  return {
    tarefas: { schemaVersion: 1, tarefas },
    perfis: { schemaVersion: 1, perfis },
    email,
    layout: {
      schemaVersion: 1,
      blocos: ["data","perfil","tarefas","emails","observacao","progresso"],
      ordemPerfis: ["P001","P002"],
      ordemTarefas: {
        GERAL: tarefas.map(t => t.id),
        P001: ["T001","T002","T003","T004","T005"],
        P002: ["T006","T007"]
      },
      abas: ["tarefas","calendario"],
      painelLateral: { largura: 420 },
      expansaoLateral: { posicao: "direita" },
      criacaoRoteiro: { modo: "POPUP" }
    }
  };
}

export class DataRepository {
  private readonly meta = new Map<string, DriveMeta>();
  private structureCache: { rootId: string; configId: string; historyId: string; systemId: string } | null = null;

  constructor(private readonly drive: DriveService) {}

  private async structure(rootId: string) {
    if (this.structureCache?.rootId === rootId) return this.structureCache;
    const folders = await this.drive.ensureStructure(rootId);
    const structure = { rootId, configId: folders[STRUCTURE.config], historyId: folders[STRUCTURE.history], systemId: folders[STRUCTURE.system] };
    this.structureCache = structure;
    return structure;
  }

  private async findSingle(parentId: string, name: string) {
    const matches = (await this.drive.listChildren(parentId, name));
    if (matches.length > 1) throw new Error(`HÁ MAIS DE UM ARQUIVO "${name}" NO LOCAL DO CONTROLE DIÁRIO.`);
    return matches[0] ?? null;
  }

  private async readNamed<T>(parentId: string, name: string) {
    const file = await this.findSingle(parentId, name);
    if (!file?.id) return null;
    const result = await this.drive.readJson<T>(file.id);
    this.meta.set(file.id, result.meta);
    return result.data;
  }

  private async writeNamed<T>(parentId: string, name: string, data: T) {
    const file = await this.findSingle(parentId, name);
    if (!file?.id) {
      const id = await this.drive.createJson(parentId, name, data);
      const result = await this.drive.readJson<T>(id);
      this.meta.set(id, result.meta);
      return;
    }
    const expected = this.meta.get(file.id);
    if (!expected) {
      const current = await this.drive.readJson<T>(file.id);
      this.meta.set(file.id, current.meta);
      throw new Error(`O ARQUIVO ${name.toUpperCase()} PRECISA SER RECARREGADO ANTES DA GRAVAÇÃO.`);
    }
    await this.drive.writeJson(file.id, data, expected);
    const refreshed = await this.drive.readJson<T>(file.id);
    this.meta.set(file.id, refreshed.meta);
  }

  async load(rootId: string): Promise<LoadedData> {
    const s = await this.structure(rootId);
    const [tarefas, perfis, email, layout, calendario, estado] = await Promise.all([
      this.readNamed(s.configId, "tarefas.json"),
      this.readNamed(s.configId, "perfis.json"),
      this.readNamed(s.configId, "email.json"),
      this.readNamed(s.configId, "layout.json"),
      this.readNamed(s.systemId, "calendario.json"),
      this.readNamed<{ schemaVersion: 1; estado: EstadoAtual | null }>(s.systemId, "estado_atual.json")
    ]);

    const allMissing = !tarefas && !perfis && !email && !layout;
    if (allMissing) {
      const initial = defaultConfiguration();
      await Promise.all([
        this.writeNamed(s.configId, "tarefas.json", initial.tarefas),
        this.writeNamed(s.configId, "perfis.json", initial.perfis),
        this.writeNamed(s.configId, "email.json", initial.email),
        this.writeNamed(s.configId, "layout.json", initial.layout)
      ]);
      return {
        configuracao: initial,
        calendario: calendario ? validateCalendar(calendario) : EMPTY_CALENDAR(),
        estado: estado ? validateState(estado) : null
      };
    }
    if (!tarefas || !perfis || !email || !layout) throw new Error("A CONFIGURAÇÃO DO CONTROLE DIÁRIO ESTÁ INCOMPLETA NO GOOGLE DRIVE.");
    const configuracao: Configuracao = {
      tarefas: validateTarefas(tarefas),
      perfis: validatePerfis(perfis),
      email: validateEmails(email),
      layout: validateLayout(layout)
    };
    const linkedHydrated = hydrateKnownTaskLinks(configuracao);
    const creationHydrated = hydrateKnownTaskCreation(linkedHydrated.config);
    const roteiroHydrated = hydrateKnownTaskRoteiro(creationHydrated.config);
    const hydrated = roteiroHydrated;
    if (linkedHydrated.changed || creationHydrated.changed || roteiroHydrated.changed) {
      validateConfigurationConsistency(hydrated.config);
      await this.writeNamed(s.configId, "tarefas.json", hydrated.config.tarefas);
      return { configuracao: hydrated.config, calendario: calendario ? validateCalendar(calendario) : EMPTY_CALENDAR(), estado: estado ? validateState(estado) : null };
    }
    validateConfigurationConsistency(configuracao);
    return {
      configuracao,
      calendario: calendario ? validateCalendar(calendario) : EMPTY_CALENDAR(),
      estado: estado ? validateState(estado) : null
    };
  }

  async saveConfiguration(rootId: string, kind: "tarefas" | "perfis" | "email" | "layout", value: unknown) {
    const s = await this.structure(rootId);
    const validators = { tarefas: validateTarefas, perfis: validatePerfis, email: validateEmails, layout: validateLayout } as const;
    const validated = validators[kind](value);
    const fileName = `${kind}.json`;
    await this.writeNamed(s.configId, fileName, validated);
    return validated;
  }


  async saveConfigurationBundle(rootId: string, config: Configuracao) {
    const previous = await this.load(rootId);
    const writes: Array<["tarefas"|"perfis"|"email"|"layout", unknown]> = [
      ["tarefas", config.tarefas], ["perfis", config.perfis], ["email", config.email], ["layout", config.layout]
    ];
    const originals: Array<["tarefas"|"perfis"|"email"|"layout", unknown]> = [
      ["tarefas", previous.configuracao.tarefas], ["perfis", previous.configuracao.perfis], ["email", previous.configuracao.email], ["layout", previous.configuracao.layout]
    ];
    const changed = writes.filter(([k,v]) => JSON.stringify(v) !== JSON.stringify((previous.configuracao as any)[k]));
    const done: typeof changed = [];
    try {
      for (const item of changed) { await this.saveConfiguration(rootId, item[0], item[1]); done.push(item); }
    } catch (error) {
      for (const [kind] of done.reverse()) {
        const original = originals.find(x=>x[0]===kind)!;
        try { await this.saveConfiguration(rootId, kind, original[1]); } catch { /* preserve primary error */ }
      }
      throw error;
    }
    return config;
  }

  async saveCurrentState(rootId: string, estado: EstadoAtual | null) {
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado });
  }

  async saveCalendar(rootId: string, calendario: LoadedData["calendario"]) {
    validateCalendar(calendario);
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "calendario.json", calendario);
  }

  async completeState(rootId: string, state: EstadoAtual, concluidoEm: string): Promise<RegistroHistorico> {
    const progress = this.progress(state);
    if (progress.total === 0 || progress.done !== progress.total) throw new Error("O EXPEDIENTE AINDA NÃO ESTÁ 100% CONCLUÍDO.");
    const s = await this.structure(rootId);
    await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: state });
    const year = state.data.slice(0, 4);
    const monthNumber = state.data.slice(5, 7);
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = `${monthNumber} - ${monthNames[Math.max(0, Number(monthNumber) - 1)] ?? monthNumber}`;
    const yearId = await this.drive.findOrCreateFolder(s.historyId, year);
    const monthId = await this.drive.findOrCreateFolder(yearId, month);
    const dateId = await this.drive.findOrCreateFolder(monthId, state.data);
    const existing = await this.drive.listChildren(dateId);
    const existingRecords: RegistroHistorico[] = [];
    for (const file of existing) {
      if (!/^R\d{3}\.json$/.test(file.name ?? "") || !file.id) continue;
      try { existingRecords.push((await this.drive.readJson<RegistroHistorico>(file.id)).data); } catch { /* ignore malformed unrelated files */ }
    }
    const recovered = existingRecords.find(r => r.data === state.data && r.perfil.id === state.perfil.id && r.criadoEm === state.criadoEm);
    if (recovered) {
      await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado: null });
      await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: null });
      return recovered;
    }
    const versions = existingRecords.map(r => r.versao);
    const versao = (versions.length ? Math.max(...versions) : 0) + 1;
    const registro: RegistroHistorico = {
      schemaVersion: 1, id: `${state.data}-R${String(versao).padStart(3, "0")}`, versao, data: state.data,
      perfil: state.perfil, tarefas: state.tarefas, emailsGlobais: state.emailsGlobais, observacao: state.observacao,
      status: "CONCLUIDO", criadoEm: state.criadoEm, concluidoEm, ultimaAlteracao: state.ultimaAlteracao, origemVersao: null
    };
    await this.drive.createJson(dateId, `R${String(versao).padStart(3, "0")}.json`, registro);
    const verified = await this.findSingle(dateId, `R${String(versao).padStart(3, "0")}.json`);
    if (!verified?.id) throw new Error("NÃO FOI POSSÍVEL CONFIRMAR O REGISTRO DO HISTÓRICO.");
    await this.drive.readJson<RegistroHistorico>(verified.id);
    await this.writeNamed(s.systemId, "estado_atual.json", { schemaVersion: 1, estado: null });
    await this.writeNamed(s.systemId, "estado_anterior.json", { schemaVersion: 1, estado: null });
    return registro;
  }

  progress(state: EstadoAtual) {
    const emailIds = new Set<string>();
    for (const e of state.emailsGlobais) emailIds.add(e.id);
    for (const t of state.tarefas) for (const e of t.emailsVinculados) emailIds.add(e.id);
    let done = state.tarefas.filter(t => t.concluida).length;
    for (const id of emailIds) {
      const e = state.emailsGlobais.find(x => x.id === id) ?? state.tarefas.flatMap(t => t.emailsVinculados).find(x => x.id === id);
      if (e?.concluido) done++;
    }
    const total = state.tarefas.length + emailIds.size;
    return { done, total, percentage: total ? Math.round(done / total * 100) : 0 };
  }

  async createHistory(rootId: string, registro: RegistroHistorico) {
    const s = await this.structure(rootId);
    const year = registro.data.slice(0, 4);
    const monthNumber = registro.data.slice(5, 7);
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = `${monthNumber} - ${monthNames[Math.max(0, Number(monthNumber) - 1)] ?? monthNumber}`;
    const yearId = await this.drive.findOrCreateFolder(s.historyId, year);
    const monthId = await this.drive.findOrCreateFolder(yearId, month);
    const dateId = await this.drive.findOrCreateFolder(monthId, registro.data);
    const name = `R${String(registro.versao).padStart(3, "0")}.json`;
    const existing = await this.findSingle(dateId, name);
    if (existing) throw new Error("A VERSÃO DO HISTÓRICO JÁ EXISTE. A GRAVAÇÃO FOI BLOQUEADA.");
    return this.drive.createJson(dateId, name, registro);
  }
}
