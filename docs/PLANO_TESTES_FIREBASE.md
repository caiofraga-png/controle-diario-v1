# Plano de testes de segurança e integridade — Firebase

## Objetivo
Validar a persistência individual e a consulta gerencial do Leste – Controle Diário no Firebase. Os testes automatizados das regras e da compilação são executados no GitHub Actions; este plano registra as validações manuais ainda necessárias.

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
| EXP-03 | Colaborador tenta gravar setor, contato, Login ou Agente falsificados | Acesso negado |
| EXP-04 | Colaborador tenta modificar a identidade ou atribuição de expediente existente | Acesso negado |
| EXP-05 | Colaborador tenta atualizar campos diferentes de `status` e `completedAt` no índice | Acesso negado |
| EXP-06 | Cliente tenta excluir documento do índice `Expediente` | Acesso negado |
| EXP-07 | Supervisor consulta expedientes de seu setor atual | Somente leitura e apenas registros autorizados |
| EXP-08 | Supervisor tenta consultar outro setor ou editar expediente alheio | Acesso negado |
| EXP-09 | Administrador consulta expediente de outro usuário | Leitura permitida; edição negada |
| HIS-01 | Fechamento repetido do mesmo expediente | Sem duplicação de versões |
| HIS-02 | Falha durante fechamento e nova tentativa | Recuperação consistente, sem perda de dados |
| HIS-03 | Errata altera somente marcações e observação | Nova versão preserva conteúdo imutável |
| HIS-04 | Colaborador muda de setor após fechamento | Histórico mantém identificação e setor da data registrada |
| CON-01 | Dois dispositivos tentam fechar o mesmo expediente | Apenas um fechamento efetivo, sem sobrescrita |
| DOM-01 | E-mail de domínio não autorizado solicita acesso | Acesso negado |
| ADM-01 | Usuário comum tenta promover a si próprio a administrador | Acesso negado |

## Situação da revisão do código

1. **Índice `Expediente`:** as regras são testadas pelo workflow de validação no emulador. A criação exige proprietário autenticado e aprovado, fotografia de atribuição correspondente ao perfil atual e correspondência entre os campos duplicados e a fotografia. A atualização pelo proprietário fica limitada a `status` e `completedAt`; a exclusão pelo cliente é negada.
2. **Dados operacionais por usuário:** `currentState` e histórico possuem regras explícitas de propriedade; os demais documentos operacionais não modelados permanecem negados. Os testes do emulador passaram. A homologação manual ainda precisa validar recuperação, concorrência e histórico imutável.
3. A gravação do índice `Expediente` e a gravação do histórico pessoal precisam ser coordenadas para evitar inconsistências em falhas parciais.
4. Consultas de supervisão precisam ser testadas com filtros compatíveis com as regras e índices do Firestore.
5. O primeiro administrador depende de um procedimento confiável de inicialização, externo ao cliente web.
6. Os testes automatizados das regras são executados no Firestore Emulator pelo GitHub Actions e passaram no commit atualmente validado. Repetir os testes sempre que as regras forem alteradas.

## Critérios para liberar integração
- Todos os casos de autorização e isolamento passam no emulador.
- O fechamento e a criação de versões são seguros contra repetição e concorrência.
- Nenhum histórico real é copiado ou excluído sem aprovação específica.
- A compilação e os testes automatizados da branch passam.
- A publicação na branch `main` permanece bloqueada até aprovação explícita.

## Sequência de implementação
1. Endurecer as regras e o contrato dos documentos.
2. Implementar testes automatizados de autorização no emulador.
3. Restringir o acesso aos documentos operacionais e ao histórico conforme seu ciclo de vida.
4. Implementar adaptador de armazenamento por UID, com gravações transacionais onde necessário.
5. Integrar gradualmente configuração, calendário, expediente e histórico.
6. Validar a interface e a visão de supervisão em ambiente de testes.
