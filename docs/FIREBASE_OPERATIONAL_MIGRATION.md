# Plano de migração do armazenamento operacional

**Situação:** especificação técnica da branch de desenvolvimento; ainda não conectada ao funcionamento do aplicativo.

Este plano acrescenta a estrutura necessária sem substituir prematuramente o armazenamento atual. O repositório baseado no Google Drive continuará sendo a fonte usada pelo aplicativo até que o adaptador do Firestore e o fluxo da interface sejam integrados e validados. Não remova a compatibilidade com o Drive nem altere a branch `main` nesta etapa de planejamento.

## Comportamentos atuais que precisam ser preservados

A implementação em `src/web/dataRepository.ts` e `src/web/calendarHistoryService.ts` define os seguintes comportamentos:

- A configuração reúne tarefas, perfis, modelos de e-mail, seleção de e-mails globais e layout. Ela é validada com a versão 1 do esquema e conferida quanto à consistência das referências entre tarefas, perfis e e-mails.
- O calendário contém datas especiais, como folgas e feriados.
- O expediente atual pode estar vazio ou conter data, fotografia do perfil, marcações de conclusão de tarefas/e-mails, observações e datas de criação/alteração.
- Ao concluir um expediente, é criado um registro histórico e o estado atual/anterior é limpo. O fluxo atual também tenta recuperar a operação quando uma gravação anterior aparentemente já foi concluída; esse mecanismo de recuperação de duplicidade deve ser mantido.
- O histórico possui versões. Uma errata cria uma nova versão, em vez de sobrescrever a original, e só pode alterar marcações de conclusão e observação. Estrutura das tarefas, texto, link, roteiro, conteúdo dos e-mails e identidade dos e-mails devem permanecer iguais.
- O histórico do calendário identifica as datas concluídas pela existência de registros históricos.
- As regras operacionais das tarefas e dos importadores não fazem parte desta migração de armazenamento.

## Mapeamento proposto para o Firestore

Todos os registros privados ficam vinculados ao UID do Firebase autenticado. O UID é a identidade estável; e-mail, Login, Setor e Contato são atributos que podem mudar e não devem ser usados como chave de propriedade dos dados.

| Conceito atual no Google Drive | Local proposto no Firestore | Observações |
|---|---|---|
| Arquivos de configuração de tarefas, perfis, e-mails e layout | `users/{uid}/configuration/{documentId}` | Preservar a versão do esquema e as validações atuais. O primeiro acesso não copia automaticamente a configuração de outra pessoa. |
| Datas especiais do calendário | `users/{uid}/calendar/{documentId}` | Preservar o significado das datas especiais e usar documentos de tamanho limitado, em vez de um único documento que cresça continuamente. |
| Expediente atual | `users/{uid}/operational/currentState` | Armazenar os dados de `EstadoAtual`, além do UID proprietário e das datas de controle. |
| Cópia anterior/de recuperação | `users/{uid}/operational/previousState` | Preservar a lógica de recuperação atual até que o fechamento seja migrado e testado. |
| Versões permanentes do histórico | `users/{uid}/operational/history_{date}_R{version}` | Cada versão completa de `RegistroHistorico` será um documento próprio. O ID deve ser determinístico para que novas tentativas detectem uma gravação já realizada. |
| Índice compartilhado de cartões para consulta gerencial | `Expediente/{ownerUid}_{date}` | Um cartão de índice por proprietário/data, com UID do proprietário e fotografia da lotação. É somente um índice, não o histórico oficial. Uma errata deve atualizar os metadados da versão mais recente do cartão, sem substituir o histórico individual. |
| Links úteis | `users/{uid}/usefulLinks/{documentId}` | Manter separados do expediente e da configuração. |

Esses IDs são propostas e precisam ser usados de forma consistente no repositório, nas regras do Firestore e nas consultas. Se for necessário evitar colisões ao formar IDs com UID/data/versão, concentre a lógica em uma única função auxiliar, em vez de montar os IDs em vários pontos da interface.

## Fotografia histórica da lotação

No momento da conclusão de um expediente, o sistema deve consultar o perfil organizacional aprovado do colaborador e os nomes correspondentes de Setor e Contato. Em seguida, deve gravar uma fotografia imutável contendo:

- UID do Firebase;
- Login e Agente;
- ID e nome do Setor;
- ID e nome do Contato.

A mesma fotografia deve constar no registro histórico oficial e no índice correspondente em `Expediente`. Uma transferência posterior não pode alterar as fotografias antigas. O estado ainda em andamento não deve receber uma fotografia histórica definitiva até que o momento correto esteja definido nas regras operacionais. Se futuramente for necessária uma fotografia do início do expediente, ela deve ser armazenada separadamente da fotografia feita na conclusão.

## Sequência segura para concluir um expediente

O fechamento migrado deve aceitar novas tentativas sem duplicar registros e preservar o mecanismo de recuperação existente:

1. Validar o estado atual e a configuração usando as funções de validação já existentes.
2. Determinar o ID previsível do documento de histórico para a próxima versão e verificar se já existe um registro concluído para aquela data/expediente.
3. Capturar a fotografia da lotação a partir do perfil aprovado e dos catálogos organizacionais.
4. Gravar o histórico completo e o índice desnormalizado de `Expediente` em uma operação coordenada de gravação em lote/transação do Firestore, conforme as restrições de leitura e gravação da operação.
5. Confirmar que o registro permanente esperado pode ser lido de volta.
6. Limpar o estado atual e o estado anterior somente depois de confirmar a gravação permanente.
7. Se a conexão cair durante a gravação, a próxima tentativa deve detectar e recuperar o registro já salvo, em vez de criar uma segunda conclusão.

Uma gravação em lote do Firestore torna atômicas as gravações incluídas, mas não torna atômicas, por si só, quaisquer leituras feitas antes delas. Use uma transação quando a decisão de criar uma versão depender de leituras que precisem estar protegidas contra concorrência. Se os limites da transação ou a estrutura atual dos dados impedirem isso, documente a estratégia para evitar duplicidade e teste novas tentativas concorrentes.

## Histórico e erratas

- O histórico oficial permanece associado ao UID do proprietário.
- Uma errata cria uma nova versão com `origemVersao` apontando para a versão de origem.
- Reutilize a validação existente em `CalendarHistoryService.saveErrata`; não a flexibilize durante a troca do armazenamento.
- O documento de índice pode guardar a versão mais recente e os campos resumidos necessários aos cartões gerenciais, mas não deve conter nem substituir o histórico completo.
- Consulte o histórico em lotes limitados e com paginação; não carregue todos os registros antigos na memória durante a inicialização.

## Contrato de segurança pendente para documentos operacionais

O tipo atual `RegistroHistorico` em `src/shared/types/state.ts` descreve o conteúdo funcional do histórico, mas não inclui os metadados de propriedade e lotação exigidos pelas regras. Não use diretamente esse objeto como documento Firestore de topo sem um envelope de segurança.

Antes de implementar o adaptador, definir e validar um envelope Firestore explícito para documentos operacionais. No mínimo, o envelope de histórico deve conter `ownerUid`, `kind` (por exemplo, `history`), `date`, `version`, `createdAt` e uma fotografia de atribuição aprovada com UID, Login, Agente, Setor e Contato; o conteúdo funcional deve ficar em um campo separado, como `payload`. A forma final deve ser consistente com o índice `Expediente` e com os tipos compartilhados.

Ciclo de vida proposto para as regras, a confirmar e testar antes de habilitar a persistência:
- `currentState`: leitura/gravação apenas pelo proprietário aprovado; não permitir acesso de outros usuários.
- `previousState`: leitura/gravação apenas pelo proprietário aprovado, com semântica de recuperação documentada; não usar como substituto do histórico oficial.
- histórico: criação pelo proprietário aprovado apenas para uma nova versão válida; leitura pelo proprietário e por perfis gerenciais autorizados; atualização e exclusão pelo cliente negadas. Erratas sempre criam uma nova versão.
- índice `Expediente`: não permitir que alterações no índice substituam o conteúdo do histórico oficial; definir transições permitidas de estado e testar consistência com o histórico.

**Até esse contrato existir e ser testado, as regras negam leitura e gravação em `users/{uid}/operational`.** O armazenamento ativo permanece no Google Drive; não habilitar o adaptador Firestore antes de concluir os testes de autorização, recuperação e concorrência.

## Autorização e restrições das consultas

- Cada colaborador só acessa sua própria configuração, calendário, estado atual e histórico.
- O acesso de leitura do administrador serve à supervisão gerencial; não deve permitir gravar ou excluir registros operacionais de outras pessoas.
- Um supervisor só pode consultar os registros de índice permitidos pela política ativa do Firestore. A primeira versão usa o setor atual como regra inicial, mas filtros futuros precisam ser respaldados por uma política aplicada no servidor, não apenas pela interface.
- Toda consulta precisa ser compatível com as regras de segurança do Firestore. Um filtro `where` executado no cliente não é, por si só, uma barreira de autorização.
- Os campos `sectorId`, `contactId`, `login`, `agent`, `ownerUid` e os campos de situação/data do índice devem corresponder à fotografia registrada e ao registro oficial.
- Não permita gravações arbitrárias nos campos de identidade, função, sinalizador de supervisor ou aprovação da conta.

## Validações obrigatórias antes de trocar o armazenamento em uso

1. Verificar a compilação e os testes de conversão de esquema e validações existentes.
2. Testar no Emulador do Firestore: leitura/gravação dos próprios dados, bloqueio de acesso cruzado entre usuários, leitura somente pelo administrador, leitura pelo supervisor do mesmo setor, bloqueio de leitura de outro setor e bloqueio de edição/exclusão de registros alheios.
3. Testar a conclusão do expediente em caso de sucesso, interrupção de rede, nova tentativa após sucesso e ausência de duplicação do histórico/cartão.
4. Testar erratas: alterações válidas de marcações/observação geram nova versão; mudanças na estrutura das tarefas, roteiro, links, conteúdo dos e-mails ou identidade dos e-mails são rejeitadas.
5. Confirmar que datas especiais e indicadores de dias concluídos no calendário mantêm o comportamento atual.
6. Testar transferência de colaborador: registros antigos preservam Setor/Contato anteriores e novos registros usam a lotação atual.
7. Testar isolamento entre usuários: duas pessoas conseguem trabalhar independentemente na mesma data, sem sobrescrever estado atual, configuração, calendário ou histórico uma da outra.
8. Fazer teste completo no navegador com um projeto Firebase de teste real antes da implantação. A compilação na integração contínua, sozinha, não comprova que as regras ou o funcionamento real estão corretos.

## Limites da migração

Este plano não copia nem exclui dados do Google Drive de produção. Os históricos antigos permanecem no Drive até que um procedimento de migração separado, aprovado previamente, avalie propriedade, autoria, datas duplicadas, versões e fotografias da lotação. Não importe históricos em massa sem essa análise.
