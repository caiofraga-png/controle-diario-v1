# Plano de testes de segurança e integridade — Firebase

## Objetivo
Validar a persistência individual e a consulta gerencial do Leste – Controle Diário antes de substituir o armazenamento no Google Drive. Este documento descreve testes planejados, **não resultados executados**.

## Pré-condições
- Usar projeto Firebase exclusivo de testes e Firestore Emulator com as regras da branch de desenvolvimento.
- Criar usuários de teste aprovados em setores diferentes, um supervisor e um administrador, com autenticação simulada.
- Preparar expedientes de exemplo sem copiar históricos reais da produção.
- Executar as consultas com as mesmas restrições utilizadas no aplicativo, não apenas leituras diretas.

## Casos obrigatórios

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| AUT-01 | Usuário sem aprovação tenta ler ou gravar configuração | Acesso negado |
| AUT-02 | Usuário aprovado acessa sua configuração e calendário | Permitido |
| AUT-03 | Usuário aprovado tenta acessar configuração de outra pessoa | Acesso negado |
| AUT-04 | Usuário tenta mudar seu próprio perfil organizacional | Acesso negado |
| EXP-01 | Colaborador cria expediente com seu UID e atribuição válida | Permitido após validação de identidade e atribuição |
| EXP-02 | Colaborador tenta criar expediente com UID de outra pessoa | Acesso negado |
| EXP-03 | Colaborador tenta gravar setor, contato ou agente falsificados | Acesso negado |
| EXP-04 | Colaborador tenta modificar a identidade ou atribuição de expediente existente | Acesso negado |
| EXP-05 | Supervisor consulta expedientes de seu setor atual | Somente leitura e apenas registros autorizados |
| EXP-06 | Supervisor tenta consultar outro setor ou editar expediente alheio | Acesso negado |
| EXP-07 | Administrador consulta expediente de outro usuário | Leitura permitida; edição negada |
| HIS-01 | Fechamento repetido do mesmo expediente | Sem duplicação de versões |
| HIS-02 | Falha durante fechamento e nova tentativa | Recuperação consistente, sem perda de dados |
| HIS-03 | Errata altera somente marcações e observação | Nova versão preserva conteúdo imutável |
| HIS-04 | Colaborador muda de setor após fechamento | Histórico mantém identificação e setor da data registrada |
| CON-01 | Dois dispositivos tentam fechar o mesmo expediente | Apenas um fechamento efetivo, sem sobrescrita |
| DOM-01 | E-mail de domínio não autorizado solicita acesso | Acesso negado |
| ADM-01 | Usuário comum tenta promover a si próprio a administrador | Acesso negado |

## Bloqueadores identificados na revisão do código
1. As regras atuais de `Expediente` verificam `ownerUid`, mas ainda não comprovam que setor, contato, login e agente correspondem ao cadastro aprovado. A criação ou atualização com dados organizacionais falsificados precisa ser impedida.
2. O caminho `users/{uid}/operational` permite gravação pelo proprietário sem validar campos imutáveis do histórico. É necessário distinguir estado atual de registros finalizados e versões de errata.
3. A gravação do índice `Expediente` e a gravação do histórico pessoal precisam ser coordenadas para evitar inconsistências em falhas parciais.
4. Consultas de supervisão precisam ser testadas com filtros compatíveis com as regras e índices do Firestore.
5. O primeiro administrador depende de um procedimento confiável de inicialização, externo ao cliente web.
6. As regras ainda não foram executadas no Firestore Emulator nesta etapa.

## Critérios para liberar integração
- Todos os casos de autorização e isolamento passam no emulador.
- O fechamento e a criação de versões são seguros contra repetição e concorrência.
- Nenhum histórico real é copiado ou excluído sem aprovação específica.
- A compilação e os testes automatizados da branch passam.
- A publicação na branch `main` permanece bloqueada até aprovação explícita.

## Sequência de implementação
1. Endurecer as regras e o contrato dos documentos.
2. Implementar testes automatizados de autorização no emulador.
3. Implementar adaptador de armazenamento por UID, com gravações transacionais onde necessário.
4. Integrar gradualmente configuração, calendário, expediente e histórico.
5. Validar a interface e a visão de supervisão em ambiente de testes.
