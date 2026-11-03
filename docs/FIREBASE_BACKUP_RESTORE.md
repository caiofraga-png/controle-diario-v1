# Backup e recuperação do Firebase — Controle Diário

## Objetivo e limites

Este procedimento define como proteger os dados do Controle Diário no Cloud Firestore e como recuperar o serviço após exclusão acidental, corrupção lógica ou indisponibilidade.

**Estado deste documento:** plano técnico preparado para homologação. A existência deste arquivo não significa que backups, PITR, bucket ou alertas já estejam habilitados no projeto. Nenhuma rotina deste documento deve ser executada em produção sem autorização e validação do projeto, região, permissões e custos.

O projeto identificado atualmente pelo fluxo de homologação é `controle-diario-510808`. Antes de qualquer configuração, confirme no Google Cloud Console que esse é o projeto correto e que não contém dados de produção.

## Dados que precisam ser protegidos

O backup do banco deve abranger o banco Firestore completo, não apenas a coleção `Expediente`. Entre os dados importantes estão:

- `users/{uid}`: identidade organizacional, status, papel, setor, contato e perfis autorizados;
- subcoleções privadas `configuration`, `preferences`, `usefulLinks`, `taskCustomizations` e `operational`;
- `Expediente`: índice compartilhado usado pela Visão Geral;
- `accessRequests`, `organizationSectors`, `organizationContacts`;
- `sharedTaskCatalog`, `sharedPromotions`, `settings` e `adminAudit`.

O histórico operacional é append-only nas regras do cliente, mas isso não substitui backup: exclusões administrativas, falhas de configuração, incidentes de credenciais ou erros de aplicação ainda podem comprometer dados.

## Camadas recomendadas

### 1. Backups gerenciados do Firestore

Habilitar uma agenda de backups gerenciados para o banco `(default)`, preferencialmente:

- frequência diária;
- retenção de 14 semanas, se disponível e aprovada;
- horário de execução fora do período de maior uso;
- revisão periódica do estado da agenda e dos backups concluídos.

A disponibilidade de agenda, frequência, retenção e região deve ser confirmada para a localização real do banco no Google Cloud Console. Backups gerenciados têm cobrança própria; verificar preços vigentes e estimativa de armazenamento antes de habilitar.

Os backups gerenciados são cópias de recuperação do banco. A restauração normalmente cria um banco de destino separado; planejar a troca da aplicação para o banco restaurado, a validação e o retorno controlado. Não presumir que a restauração sobrescreve o banco original.

### 2. Recuperação pontual (PITR)

Avaliar habilitar Point-in-Time Recovery (PITR) para o banco, se disponível na região e compatível com a necessidade operacional.

- PITR oferece recuperação para um instante dentro da janela suportada pelo Firestore (atualmente até sete dias, sujeita à configuração e ao produto).
- PITR não substitui backups gerenciados de retenção mais longa.
- Há cobrança adicional e requisitos de configuração; confirmar preço e janela disponíveis no Console antes de ativar.

### 3. Exportação independente para Cloud Storage

Para uma cópia independente do mecanismo de backup gerenciado, planejar exportações periódicas do banco para um bucket Cloud Storage dedicado, com:

- bucket no projeto/ambiente aprovado e localização compatível com a política de dados da empresa;
- acesso restrito a uma identidade de serviço específica;
- versionamento e/ou política de retenção/imutabilidade conforme política corporativa;
- criptografia e monitoramento;
- nomes de exportação com data/hora, sem sobrescrever exportações anteriores;
- teste de importação em um banco de recuperação isolado.

Exportação/importação do Firestore é uma camada adicional de portabilidade e recuperação; não é substituta automática de backups gerenciados. Confirmar custos de armazenamento, operações e tráfego, além das permissões IAM necessárias.

## Frequência e objetivos operacionais propostos

| Camada | Frequência / janela | Objetivo |
|---|---|---|
| Backup gerenciado | Diário; retenção-alvo 14 semanas | Recuperação de falhas e incidentes com janela maior |
| PITR | Contínuo dentro da janela suportada | Recuperar alterações recentes ou exclusões acidentais |
| Exportação Cloud Storage | Semanal, e antes de mudanças estruturais relevantes | Cópia independente e portabilidade |

Metas iniciais para discussão, não garantias técnicas: RPO de até 24 horas para backup diário e RTO definido após ensaio de restauração. PITR pode reduzir a perda potencial de alterações recentes, mas o RTO depende da restauração, validação e troca do banco.

## Controle de acesso

- Não colocar chaves privadas de contas de serviço no repositório, em variáveis `VITE_*), em issues ou no chat.
- Preferir identidade de serviço dedicada com menor privilégio necessário e credenciais de curta duração/federação quando suportadas.
- Separar permissões de operação de backup, leitura de backups e restauração.
- Restringir quem pode excluir backups, alterar agendas, remover buckets ou iniciar restaurações.
- Registrar responsáveis, aprovações e ações de recuperação.
- Não conceder papel amplo de Owner/Editor apenas para simplificar a configuração.

## Procedimento de verificação

Depois de habilitar cada camada no Console:

1. Confirmar projeto, banco, região e agenda.
2. Confirmar ao menos um backup concluído com sucesso e sua data.
3. Confirmar a janela PITR efetivamente habilitada, se adotada.
4. Confirmar exportação concluída no bucket, se adotada.
5. Verificar alertas para falha de backup/exportação e para alteração/exclusão de configuração.
6. Registrar custos estimados, responsáveis e local das cópias.
7. Repetir a verificação periodicamente e após alterações de projeto/região.

Uma execução verde do GitHub Actions não confirma que os backups do Firestore estejam ativos.

## Ensaio de restauração

O ensaio deve ocorrer em um projeto/banco isolado, nunca sobre o banco em uso:

1. Selecionar um backup conhecido ou um ponto PITR aprovado.
2. Restaurar para um banco de destino separado, ou importar a exportação para um banco de teste.
3. Aplicar/revisar índices e regras de segurança compatíveis com a versão da aplicação.
4. Verificar presença e consistência de documentos organizacionais, configurações, histórico individual e índice `Expediente`.
5. Conferir contagens e amostras de registros, incluindo diferentes usuários e datas.
6. Validar que os documentos históricos mantêm `ownerUid`, versões e fotografia de setor/contato.
7. Executar os testes de regras e a compilação da aplicação contra o ambiente restaurado.
8. Testar login e leitura em uma conta de teste autorizada.
9. Documentar duração, falhas, diferenças e responsável pelo ensaio.

Não apontar a aplicação ativa para o banco restaurado antes de aprovação formal. Não copiar dados restaurados para produção como parte de um teste.

## Recuperação de incidente

Em caso de exclusão ou corrupção suspeita:

1. Suspender alterações administrativas e novas gravações afetadas, quando operacionalmente seguro.
2. Registrar horário aproximado, escopo, projeto e banco envolvidos.
3. Preservar evidências e verificar logs de auditoria disponíveis.
4. Escolher o ponto de recuperação com o responsável pelo negócio, considerando o instante do incidente e a perda aceitável de dados.
5. Restaurar em banco isolado e executar o ensaio de validação.
6. Planejar janela de indisponibilidade, troca de configuração e comunicação aos usuários.
7. Só efetuar a troca após aprovação explícita do responsável.
8. Manter o banco original preservado até a conclusão da validação e do período de segurança acordado.

## Checklist de implantação — pendente no Console

- [ ] Confirmar que `controle-diario-510808` é o projeto correto e exclusivo de homologação.
- [ ] Confirmar região e tipo do banco Firestore.
- [ ] Consultar custos de backup gerenciado, PITR e Cloud Storage.
- [ ] Habilitar agenda diária de backup com retenção aprovada.
- [ ] Avaliar e, se aprovado, habilitar PITR.
- [ ] Criar bucket dedicado para exportações, se aprovado.
- [ ] Configurar IAM de menor privilégio e retenção das exportações.
- [ ] Configurar alertas de falha e alteração/exclusão.
- [ ] Executar restauração de teste em ambiente isolado.
- [ ] Registrar RPO/RTO aprovados, responsáveis e evidências do ensaio.

## Estado atual confirmado no repositório

- Não foi encontrada rotina de backup, exportação, PITR ou restauração nos workflows atuais.
- O workflow de homologação compila, testa regras no emulador e publica regras/Hosting; ele não cria nem verifica backups.
- O arquivo `firebase.json` configura regras, emulador e Hosting, sem configuração de backup.
- A configuração efetiva de backups, PITR, buckets, IAM, alertas, região e custos só pode ser confirmada no Google Cloud Console.
