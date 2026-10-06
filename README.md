# CONTROLE DIÁRIO — V1

Base inicial do aplicativo desktop.

## Stack
- Electron
- React
- TypeScript
- Vite
- electron-builder

## Arquitetura
- `src/main`: processo principal e serviços sensíveis
- `src/preload`: ponte segura IPC
- `src/renderer`: interface
- `src/shared`: tipos compartilhados

A especificação funcional aprovada da V1 é a referência do projeto.

## Camada Google OAuth + Drive — V1

Esta etapa adiciona a base de autenticação e persistência remota do CONTROLE DIÁRIO.

- OAuth Google com autorização persistente por computador.
- Escopo Drive restrito a `drive.file` (não concede Gmail nem Calendar).
- Token OAuth armazenado localmente usando a proteção do sistema operacional (`safeStorage`).
- Dados operacionais continuam no Google Drive; não há cópia local das configurações/histórico.
- A pasta raiz é validada antes de ser aceita.
- O aplicativo testa leitura e gravação reais na pasta antes de confirmar a configuração.
- As pastas `CONFIGURAÇÃO`, `HISTÓRICO` e `SISTEMA` são criadas automaticamente quando ausentes.
- Gravações de JSON usam verificação prévia de alteração externa para bloquear sobrescrita silenciosa.

### Credencial do aplicativo

Crie um cliente OAuth do tipo **Desktop app** no Google Cloud e copie o JSON para `google-oauth-client.json` na raiz do projeto durante o desenvolvimento (o arquivo não deve ser versionado). O exemplo está em `google-oauth-client.example.json`.

Ative a **Google Drive API** no projeto Google Cloud.

A seleção visual de pasta pelo Google Picker será conectada na próxima camada da interface de SISTEMA; o ID manual da pasta já está preparado nesta etapa.

## OAuth e Google Picker

1. Copie `google-oauth-client.example.json` para `google-oauth-client.json` e informe o Client ID/Client Secret de um cliente OAuth do tipo Desktop.
2. Crie `google-picker-api-key.txt` a partir de `google-picker-api-key.example.txt` e informe a chave de API usada pelo Google Picker.
3. No Google Cloud, habilite a Google Drive API e a Google Picker API para o mesmo projeto.
4. O aplicativo solicita apenas `drive.file` para Drive, além de `openid`/`email` para identificar a conta. Não solicita Gmail nem Calendar.
5. Na tela SISTEMA, use AUTORIZAR GOOGLE e depois SELECIONAR PASTA. Também é possível informar manualmente o ID da pasta.

Os tokens ficam protegidos pelo armazenamento seguro do sistema operacional. Os dados operacionais do CONTROLE DIÁRIO permanecem no Google Drive.

### Credenciais incluídas no projeto

O ZIP traz arquivos de exemplo já posicionados para permitir o build. Substitua o conteúdo de `google-oauth-client.json` e `google-picker-api-key.txt` pelas credenciais reais antes do primeiro uso. Esses dois arquivos não devem ser compartilhados publicamente.

## Camada TAREFAS V1
A base agora implementa a execução do expediente a partir dos dados do Drive:
- seleção de data e perfil;
- GERAL com todas as tarefas ativas;
- snapshot das tarefas/e-mails ao iniciar;
- marcação imediata de tarefas e e-mails;
- sincronização automática dos e-mails vinculados à tarefa;
- deduplicação do mesmo e-mail no cálculo de obrigação;
- observação com gravação automática;
- barra de progresso;
- fechamento em R001/R### quando atingir 100%;
- abandono explícito sem criação de histórico.

## Camada de configuração V1

A base agora inclui a área CONFIGURAÇÃO com:
- PERFIS: criação, edição, ativação/desativação e associação de tarefas ativas.
- TAREFAS: criação, edição, ativação/desativação, links, criação e e-mails vinculados.
- E-MAIL: criação, edição, ativação/desativação, título, corpo e compilação global.
- LAYOUT: ordem dos blocos, ordem dos perfis, ordem das tarefas, abas e largura do painel lateral.
- RESTAURAR PADRÃO no LAYOUT, sem gravação automática.
- IDs automáticos P###, T### e M### sem reutilização.

As alterações continuam sendo persistidas no Google Drive. A camada de dados mantém a proteção contra alteração externa dos arquivos.

O editor de ROTEIRO possui grade estruturada 50 x 5, persistência das células/dimensões e recursos avançados de formatação, incluindo mesclagem/desmesclagem, bordas, listas, filtros de linhas, cores, alinhamento, quebra de texto, ajuste de fonte e redimensionamento de colunas.

## Continuidade V1 — 05/10/2026

- CRIAÇÃO e ROTEIRO são conteúdos independentes e editáveis durante a produção.
- CRIAÇÃO contém orientações de consultas, filtros, datas e arquivos a baixar.
- CRIAÇÃO/ROTEIRO podem usar POPUP ou EXPANSÃO LATERAL.
- A posição da EXPANSÃO LATERAL é única e compartilhada, com ESQUERDA/DIREITA.
- Alterações em CRIAÇÃO/ROTEIRO atualizam a configuração no Drive e não alteram históricos já concluídos.
- A produção permite TROCAR PERFIL mantendo a mesma data e preservando marcações comuns entre o perfil anterior e o novo.
