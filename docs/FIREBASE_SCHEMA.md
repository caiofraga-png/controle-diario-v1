# Leste - Controle Diário: estrutura inicial do Firebase

Este documento descreve a estrutura proposta para o Firestore. Ele não significa que um projeto Firebase tenha sido criado ou configurado.

## Identidade e organização

- `users/{uid}`: perfil organizacional do colaborador, mantido por administradores. Inclui e-mail corporativo, Login, Agente, IDs atuais de Setor e Contato, situação da conta, função e datas de criação/atualização. O UID do Firebase Authentication é a identidade estável.
- `organizationSectors/{sectorId}`: catálogo de setores, mantido por administradores.
- `organizationContacts/{contactId}`: catálogo de contatos/equipes, mantido por administradores; cada contato aponta para o respectivo `sectorId`.
- `accessRequests/{uid}`: solicitações aguardando decisão administrativa.
- `settings/allowedDomains`: lista central de domínios de e-mail corporativo permitidos.
- `adminAudit/{auditId}`: registro somente de acréscimo das ações administrativas relevantes.

O administrador inicial deve ser provisionado por um procedimento confiável e controlado. O cliente executado no navegador nunca pode conceder a si mesmo a função de administrador.

## Dados individuais

- `users/{uid}/configuration/{documentId}`: configuração própria de tarefas, perfis, e-mails e layout. Cada novo usuário começa com configuração independente; a configuração compartilhada atual do Google Drive não é copiada automaticamente.
- `Expediente/{expedienteId}`: índice compartilhado e consultável dos cartões de expediente, destinado à futura supervisão por setor/contato. Cada documento deve conter `ownerUid`, `date`, `status`, `sectorId`, `sectorName`, `contactId`, `contactName`, `login`, `agent` e uma fotografia histórica da lotação. A coleção está definida no projeto, mas o Firestore não mantém uma coleção vazia até que exista ao menos um documento.
- `users/{uid}/operational/{documentId}`: registros privados individuais de operação/histórico, caso a arquitetura final os utilize. O índice `Expediente` não pode substituir o histórico durável do próprio colaborador.
- `users/{uid}/calendar/{documentId}`: calendário individual.
- `users/{uid}/usefulLinks/{documentId}`: links úteis individuais.

Os IDs finais dos documentos e a divisão entre subcoleções precisam ser conferidos com as operações reais do repositório antes de conectar a interface. Históricos grandes devem ser paginados; evite armazenar todo o histórico em um único documento que cresce indefinidamente.

## Fotografia histórica da lotação

Cada expediente concluído deve preservar uma fotografia da lotação no momento da conclusão (e, se as regras operacionais exigirem, também no início): UID, Login, Agente, ID/nome do Setor e ID/nome do Contato. Uma alteração posterior no cadastro atualiza apenas o perfil atual do colaborador; não deve reescrever os expedientes antigos.

## Princípios de autorização

- Autenticar-se não significa ter acesso aprovado.
- A situação da conta e a função são consultadas em um registro confiável.
- Cada colaborador lê e grava somente seus próprios dados operacionais.
- Administradores podem consultar registros operacionais para supervisão gerencial, mas não podem criar, alterar ou excluir registros operacionais de outras pessoas.
- O campo booleano `isSupervisor` é atribuído somente por um administrador. Supervisores podem consultar cartões de expediente cujo `sectorId` registrado corresponda ao seu setor atual; não podem editar nem excluir registros de outros colaboradores.
- O índice `Expediente` armazena uma fotografia histórica do Setor e do Contato, para que transferências futuras não alterem a atribuição dos registros antigos.
- Somente administradores podem manter os cadastros de usuários e os catálogos organizacionais.
- Verificações de função no cliente servem apenas para exibição; as regras de segurança do Firestore devem impor as permissões.
- O arquivo de regras é um ponto de partida e precisa ser testado no Emulador do Firestore para cada operação pretendida antes da implantação. O fluxo de solicitação de acesso e a validação da lista de domínios ainda precisam de implementação final e verificação.

## Acesso de supervisores: projeto extensível

A primeira versão pode usar o setor atual como limite inicial de acesso, mas `sectorId` não deve se tornar o único filtro permanente para supervisores.

Mantenha separados três conceitos:

1. **Designação de supervisor:** sinalizador mantido no perfil organizacional por um administrador. O próprio usuário não pode conceder esse privilégio a si mesmo.
2. **Política de acesso:** regra aplicada no servidor que determina quais registros o supervisor pode consultar. A regra inicial baseada no setor é apenas a primeira política, não o modelo definitivo.
3. **Filtros da visualização:** filtros opcionais escolhidos na interface, como setor, contato, agente, intervalo de datas ou situação do expediente. Os filtros da interface podem restringir os resultados autorizados, mas nunca podem conceder acesso a registros que a política não permita.

Ao implementar filtros mais avançados para supervisores, crie uma representação/versionamento específico de política e um serviço responsável por aplicá-la, em vez de espalhar verificações fixas de setor pelos componentes. A estrutura deve permitir diferentes dimensões e escopos autorizados, como vários setores, contatos, agentes ou colaboradores específicos, mantendo o padrão seguro de negar acesso quando não houver autorização. O formato exato da política e sua interface de administração ficam para uma etapa posterior, quando os requisitos estiverem definidos.

As regras de segurança do Firestore e as consultas devem impor a mesma política. Não confie em filtros executados somente no cliente nem aceite nomes de campos ou valores arbitrários como autorização. Se uma política não puder ser representada ou consultada com segurança pelas regras do Firestore, aplique-a em um serviço confiável no servidor (por exemplo, uma Cloud Function chamada pelo cliente) e impeça o acesso direto do cliente à coleção subjacente. Teste no Emulador do Firestore cada consulta permitida e cada consulta negada antes da implantação. Crie índices apenas para combinações de consulta aprovadas e efetivamente utilizadas.

A substituição da regra inicial baseada em setor por uma política mais completa deve incluir compatibilidade com dados existentes e testes para colaboradores cujo Setor ou Contato tenha mudado depois do registro de expedientes antigos.
