# Backup e restauração administrativa — Controle Diário

## Estratégia aprovada

O projeto não terá conta de faturamento vinculada. Portanto, esta solução não depende de backups gerenciados do Firestore, PITR, Cloud Storage, Cloud Functions ou serviços pagos.

A proteção disponível nesta versão é uma exportação administrativa manual, feita pelo navegador por um administrador aprovado:
- arquivo JSON criptografado com AES-256-GCM;
- chave derivada da senha informada pelo administrador com PBKDF2-SHA256 (310.000 iterações);
- verificação de integridade SHA-256 após descriptografia;
- arquivo local, sem enviar a senha ao Firebase;
- leitura dos dados, sem alterar os documentos de origem.

A senha deve ter pelo menos 12 caracteres e ser guardada separadamente do arquivo. Sem ela, não será possível abrir o backup.

## Escopo incluído

A exportação contempla os documentos encontrados nos caminhos conhecidos pela aplicação:

- documentos de perfil em `users`;
- documentos privados conhecidos por usuário: `configuration/tarefas`, `configuration/perfis`, `configuration/email`, `configuration/layout`, `preferences/appearance`, `preferences/workSchedule`, `calendar/dados` e `operational/currentState`;
- subcoleções privadas conhecidas: `taskCustomizations`, `usefulLinks` e `operational/history/entries`;
- coleções institucionais: `accessRequests`, `adminAudit`, `organizationContacts`, `organizationSectors`, `Expediente`, `settings`, `sharedPromotions` e `sharedTaskCatalog`.

**Limite importante:** o Firestore Web SDK não permite enumerar automaticamente subcoleções desconhecidas. Este arquivo não é uma cópia genérica de todo o banco. Quando a aplicação ganhar novos caminhos de dados, a lista do serviço de backup, os testes e esta documentação deverão ser atualizados juntos.

## Como gerar o arquivo

1. Entre no Controle Diário com uma conta empresarial verificada e aprovada com perfil de administrador.
2. Abra o painel de administração e localize **Backup administrativo**.
3. Informe uma senha forte com pelo menos 12 caracteres e confirme-a.
4. Acione **Gerar backup administrativo criptografado**.
5. Guarde o arquivo JSON em local seguro e independente do computador de uso diário.
6. Guarde a senha em outro local seguro. Não envie o arquivo nem a senha em canais públicos.

A exportação é somente leitura. O número de documentos e usuários informado ao final serve como referência para identificar o arquivo.

## Como validar e restaurar

A restauração também é exclusiva de administrador aprovado e só aceita um arquivo do mesmo projeto Firebase.

1. Na área **Conferir backup para restauração**, selecione o JSON e informe a senha.
2. Acione **Validar arquivo e visualizar conflitos**.
3. Confira a origem, data, projeto, quantidade de usuários, documentos e distribuição por coleção.
4. Analise os documentos ausentes e os caminhos que já existem.
5. Para iniciar, acione **Restaurar documentos ausentes** e confirme a palavra solicitada pela interface.
6. Ao terminar, confira o resultado e os registros de auditoria administrativos.

A validação confere formato, versão, integridade criptográfica, projeto de origem, coleções obrigatórias, caminhos permitidos, duplicidades e vínculos básicos de propriedade. A rotina de restauração repete as validações estruturais antes de gravar.

### Política de gravação

- A restauração cria somente documentos ausentes.
- Se um documento já existir, ele será preservado e ignorado.
- Não há sobrescrita nem exclusão de documentos existentes.
- O histórico operacional continua imutável.
- A operação registra início e conclusão na auditoria administrativa; se houver interrupção, tenta registrar o resultado parcial.
- A restauração é sequencial, documento a documento, e **não é atômica**. Uma falha de conexão ou permissão pode deixar parte dos documentos restaurados. A interface informa quantos foram criados e quantos foram preservados; consulte a auditoria antes de repetir.

A restauração não substitui um ensaio de recuperação de banco completo e não deve ser tratada como mecanismo para reverter alterações em documentos que já existem.

## Cuidados operacionais

- Faça exportações em intervalos regulares e antes de mudanças estruturais relevantes.
- Mantenha mais de uma cópia do arquivo em locais seguros e independentes.
- Restrinja o acesso ao arquivo e à senha: o conteúdo inclui dados pessoais e operacionais de todos os colaboradores.
- Não coloque arquivos de backup, senhas ou chaves privadas no repositório GitHub.
- Não execute restauração em produção como teste. Sempre que possível, valide primeiro em ambiente isolado.
- Antes de uma recuperação real, registre o motivo, o projeto, o horário e o escopo; comunique os responsáveis e obtenha autorização operacional.

## O que Actions verdes confirma — e o que não confirma

O GitHub Actions valida a compilação, os testes automatizados e as regras incluídas no workflow. Isso não confirma que um arquivo de backup real foi exportado, que a senha foi guardada, que o arquivo pode ser recuperado em outro dispositivo ou que todos os caminhos futuros estão incluídos.

A configuração efetiva de backups gerenciados, PITR, buckets, IAM, alertas, região e custos só poderia ser confirmada no Google Cloud Console. Esses serviços não fazem parte da estratégia aprovada sem faturamento.

## Manutenção desta documentação

Sempre que forem criados ou removidos documentos/subcoleções no Firestore:
1. atualizar os caminhos em `src/web/firebaseAdminBackupService.ts`;
2. revisar as permissões de leitura/exportação e criação/restauração em `firestore.rules`;
3. ampliar `tests/firestore.rules.test.cjs` e os testes do serviço, quando aplicável;
4. atualizar esta lista de escopo;
5. executar Actions e revisar o resultado antes de considerar a mudança concluída.
