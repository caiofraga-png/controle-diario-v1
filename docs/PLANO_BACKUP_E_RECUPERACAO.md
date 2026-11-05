# Plano de backup e recuperação — Controle Diário

**Ambiente inicial:** homologação  
**Projeto Firebase:** `controle-diario-510808`  
**Branch:** `feature/leste-firebase-multusuario`

Este documento define a arquitetura e o procedimento de implantação. A inclusão deste documento no repositório **não ativa serviços, não cria buckets, não altera o Firestore e não gera custos**.

## 1. Arquitetura proposta

1. **Backups gerenciados do Firestore:** rotina diária, retenção de 14 semanas (98 dias), usando o recurso nativo de agendamento de backups do Firestore.
2. **PITR:** habilitar recuperação pontual com janela de até 7 dias.
3. **Cópia independente no Cloud Storage:** exportação semanal do Firestore para um bucket exclusivo, fora do banco e fora do Hosting.
4. **Retenção do bucket:** política de ciclo de vida para expirar objetos após 98 dias, após validar a política e a primeira exportação.
5. **Restauração:** sempre restaurar primeiro em projeto/banco isolado; nunca sobrescrever produção durante testes.

A cópia semanal no Cloud Storage é uma camada independente dos backups gerenciados do Firestore. O backup criptografado manual do aplicativo continua sendo uma proteção complementar, mas não substitui estas rotinas.

## 2. Separação dos ambientes

- Começar somente na homologação do projeto `controle-diario-510808`.
- Não apontar rotinas para produção nem executar restauração no banco operacional.
- Antes da implantação oficial, criar/confirmar projeto e bucket de produção separados, com permissões próprias.
- O bucket deve ser dedicado aos backups, sem acesso público e sem uso para arquivos do site.

## 3. Preparação do Cloud Storage

Criar um bucket regional dedicado, por exemplo `controle-diario-backups-homologacao`, na mesma região do banco Firestore, após confirmar a localização real do banco e estimar custos.

Requisitos:
- acesso público bloqueado;
- acesso uniforme no nível do bucket;
- versionamento apenas se houver justificativa de recuperação, pois pode aumentar custos;
- criptografia padrão gerenciada pelo Google inicialmente;
- permissões mínimas para a identidade que executará exportações;
- prefixos separados por ambiente e data, por exemplo `homologacao/firestore/AAAA/MM/DD/`.

**Não criar o bucket antes de confirmar região, nome disponível, orçamento e permissões.** O nome acima é apenas uma sugestão.

## 4. Agendamentos e retenção

### Backups gerenciados do Firestore
- Frequência: diária.
- Retenção: 14 semanas.
- Confirmar no Console Google Cloud que o agendamento está ativo e registrar o identificador e o horário.
- Verificar o custo estimado de armazenamento e operações antes de ativar.

### PITR
- Janela desejada: até 7 dias.
- Confirmar elegibilidade, região, cobrança e preço no projeto antes de habilitar.
- PITR não substitui backups independentes: ele protege contra erros recentes, mas não é uma cópia externa.

### Exportação semanal para Cloud Storage
- Frequência: semanal, em horário de baixa utilização.
- Destino: bucket exclusivo, prefixo por ambiente/data.
- A identidade de execução deve ter apenas as permissões necessárias para ler/exportar o Firestore e gravar no bucket.
- Não reutilizar automaticamente a credencial ampla usada pelo deploy do Firebase Hosting.
- Registrar início, fim, resultado, quantidade/tamanho quando disponível e URI do objeto exportado.
- Alertar em caso de falha ou ausência de exportação dentro da janela esperada.

### Retenção no bucket
Aplicar regra de expiração de 98 dias somente depois de verificar que:
1. a exportação semanal foi concluída;
2. a restauração de teste foi bem-sucedida;
3. a regra atinge somente o prefixo de backups deste ambiente;
4. não existe obrigação de retenção maior.

## 5. Identidade e segurança

Criar uma identidade de serviço exclusiva para backup, sem chaves JSON permanentes no repositório. Preferir identidade gerenciada/Workload Identity Federation quando a rotina for executada fora do Google Cloud.

Separar permissões:
- leitura/exportação do banco;
- criação de objetos no bucket;
- leitura dos objetos para restauração de teste;
- administração de políticas e retenção somente para responsáveis autorizados.

Não conceder Owner/Editor por conveniência. Não incluir segredos, chaves ou tokens neste repositório.

## 6. Teste obrigatório de restauração

Antes de considerar a proteção concluída:
1. gerar uma exportação semanal de homologação;
2. confirmar que os arquivos/metadados esperados existem no bucket;
3. criar um destino isolado de teste;
4. restaurar a exportação nesse destino;
5. conferir documentos e subcoleções importantes: usuários, configurações privadas, expedientes, histórico operacional, setores, contatos, catálogo de tarefas, promoções, manutenções, histórico de manutenções, avisos e notificações;
6. registrar data, origem, destino, resultado e divergências;
7. excluir o ambiente temporário somente após validação e autorização.

Não testar restauração sobre o banco de homologação ativo nem sobre produção.

## 7. Critérios de conclusão

- [ ] Localização do Firestore e custos estimados confirmados.
- [ ] Bucket privado e exclusivo criado.
- [ ] Identidade de backup com permissões mínimas configurada.
- [ ] Backup gerenciado diário ativo com retenção de 14 semanas.
- [ ] PITR configurado para até 7 dias.
- [ ] Exportação semanal independente ativa no bucket.
- [ ] Política de retenção de 98 dias validada.
- [ ] Alertas de falha e ausência de backup configurados.
- [ ] Restauração de teste concluída em ambiente isolado.
- [ ] Procedimento de recuperação documentado e responsável definido.

**Status atual:** planejamento documentado; nenhum serviço de backup em nuvem foi ativado por este commit.
