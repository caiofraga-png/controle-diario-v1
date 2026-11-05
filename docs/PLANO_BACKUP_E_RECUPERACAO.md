# Plano de backup e recuperação — Controle Diário

**Ambiente:** homologação  
**Projeto Firebase:** `controle-diario-510808`  
**Região confirmada pelo responsável:** `southamerica-east1` (São Paulo)  
**Restrição obrigatória:** orçamento adicional de R$ 0,00.

## 1. Decisão de arquitetura

Não serão habilitados recursos que possam gerar cobrança. Portanto, ficam **descartados neste projeto, enquanto a regra de custo zero permanecer**:

- backups gerenciados agendados do Firestore;
- Point-in-Time Recovery (PITR);
- buckets novos ou armazenamento adicional no Cloud Storage;
- Cloud Scheduler, Cloud Functions ou outros serviços pagos/que exijam faturamento para automatizar exportações.

A região do banco está confirmada como `southamerica-east1`. A localização, por si só, não altera a decisão de custo zero.

**Consequência importante:** não é correto prometer backup automático diário em nuvem e retenção de 98 dias sem verificar e assumir custos. A solução sem custo adicional será um procedimento de exportação manual criptografada, usando a funcionalidade administrativa já existente no Controle Diário.

## 2. Procedimento de backup sem custo adicional

1. Ao encerrar o expediente, um administrador aprovado acessa a função de backup administrativo do Controle Diário.
2. Gera o arquivo de backup criptografado com senha forte (mínimo de 12 caracteres; recomenda-se uma frase-senha exclusiva).
3. Confere se o arquivo foi baixado e registra a data.
4. Guarda uma cópia em local aprovado pela empresa, fora do computador de uso diário, se já houver armazenamento corporativo disponível sem custo adicional.
5. Mantém também uma segunda cópia em outro local aprovado, quando isso puder ser feito sem contratar serviço ou consumir orçamento.
6. Não envia o arquivo nem a senha em canais públicos ou junto do próprio arquivo.

O arquivo contém dados administrativos e pessoais. Deve ser tratado como informação corporativa confidencial. A senha deve ser guardada separadamente do arquivo.

## 3. Frequência e retenção

- **Frequência desejada:** diária, ao final do expediente.
- **Retenção-alvo:** 98 dias (14 semanas), desde que exista espaço em armazenamento já disponível e autorizado.
- Se o espaço disponível for limitado, não apagar a única cópia recente para abrir espaço. Priorizar manter a cópia mais recente e cópias periódicas mais antigas, registrando claramente a limitação.
- Não existe expiração automática garantida neste procedimento manual. A revisão e eliminação de cópias antigas devem seguir a política corporativa.

## 4. O que já está coberto pelo backup administrativo

A exportação administrativa criptografada existente inclui as coleções institucionais configuradas no código, documentos privados conhecidos dos usuários, expedientes e históricos operacionais, além dos históricos de manutenções externas.

A lista de coleções é mantida explicitamente no código. Quando novas coleções ou subcoleções forem adicionadas ao sistema, a rotina de backup deverá ser revisada para incluí-las. A exportação só deve ser considerada completa depois dessa conferência.

O backup manual do aplicativo é uma exportação lógica feita pela aplicação; não é um backup gerenciado nativo do Google Cloud e não oferece PITR.

## 5. Restauração segura

- Não selecionar um backup para restauração sem confirmar a data, o projeto de origem e a senha.
- A restauração pode alterar dados existentes. Não executar testes sobre o banco ativo nem sobre produção.
- O teste de restauração deverá ser planejado separadamente. Como não será criado outro projeto/serviço pago, primeiro avaliar se é possível validar o arquivo e o processo usando ferramentas locais gratuitas, sem credenciais ou dados reais expostos.
- Até existir um teste isolado e documentado, considerar a restauração como **não validada**.
- Em caso de incidente real, interromper alterações no sistema e realizar a recuperação somente com acompanhamento do responsável técnico.

## 6. Controles operacionais

- Usar senha forte e exclusiva para cada política/arquivo, guardada em gerenciador de senhas corporativo já disponível.
- Manter arquivo e senha separados.
- Restringir o acesso às cópias a administradores autorizados.
- Conferir diariamente se o arquivo foi gerado e armazenado corretamente.
- Fazer uma revisão mensal da lista de coleções incluídas no backup.
- Não armazenar credenciais de serviço, chaves privadas ou senhas no GitHub.

## 7. Critérios de conclusão

- [x] Região do Firestore confirmada: `southamerica-east1`.
- [x] Restrição de orçamento adicional igual a R$ 0,00 registrada.
- [x] Recursos pagos/que possam gerar cobrança descartados enquanto a restrição permanecer.
- [x] Exportação administrativa criptografada existente identificada como mecanismo manual.
- [ ] Procedimento diário adotado na operação.
- [ ] Local corporativo sem custo adicional confirmado para guardar as cópias.
- [ ] Teste de restauração em ambiente local/isolado gratuito concluído.
- [ ] Revisão da cobertura de coleções e subcoleções concluída.

**Status:** estratégia de backup sem custo adicional documentada. Não foram ativados serviços, criados buckets, alteradas configurações do Firebase ou executadas restaurações.
