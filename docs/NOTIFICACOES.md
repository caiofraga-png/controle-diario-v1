# Central de avisos

## Categorias e preferências

As preferências individuais ficam em `users/{uid}/preferences/notifications`. Quando o documento ainda não existe, todas as categorias são consideradas ativadas:

- **Cobrança:** novos alertas de inadimplência; destino `inadimplencia`.
- **Promoções:** nova promoção publicada ou reativada; destino `promocoes`.
- **Manutenções:** atualização de manutenção; destino `manutencoes`.

Desativar uma categoria afeta somente a exibição das notificações no sininho. Não remove o acesso ao menu nem apaga o conteúdo.

## Feed compartilhado

Os avisos publicados são documentos em `sharedNotifications`, lidos por todos os usuários aprovados. A interface consulta os 30 avisos mais recentes e filtra as categorias pelas preferências do usuário. Os avisos são transitórios e não fazem parte do backup administrativo.

Somente administradores e supervisores podem publicar notificações institucionais. A publicação é append-only: documentos não podem ser alterados nem excluídos pelo cliente.

## Promoções

Uma notificação **Nova promoção ativa** é criada quando uma promoção passa a ativa, incluindo reativação de uma promoção suspensa. A primeira gravação do catálogo não dispara avisos retroativos. Alterações em uma promoção que já estava ativa não geram novo aviso.

## Permissões de inadimplência

A política fica em `featurePermissions/delinquency`. Supervisores e administradores podem habilitar o recurso e selecionar setores e/ou contatos autorizados. A seleção é cumulativa: pertencer a um setor liberado ou a um contato liberado concede a permissão. O serviço e as regras do Firestore validam esse escopo antes de aceitar a publicação.

## Manutenções externas

A coleção `externalMaintenances` mantém os cartões de manutenção. Cada cadastro ou alteração efetiva grava, em uma única operação atômica, o documento da manutenção, um registro append-only em `externalMaintenances/{maintenanceId}/history` e a notificação **Atualização de manutenção**. Uma edição sem mudança efetiva não gera histórico nem aviso.

A autorização de cadastro/edição fica em `featurePermissions/maintenance` e pode ser concedida por setor inteiro, contato inteiro ou agente individual. Administradores e supervisores podem gerenciar as permissões e publicar sem depender de uma autorização adicional. Todos os colaboradores aprovados podem consultar os cartões e o histórico.

O status `ongoing` aparece na lista Em andamento; `completed` aparece na visualização Concluídas / Histórico. O cliente não pode excluir cartões nem editar/excluir registros de histórico. As regras do Firestore exigem que o histórico e o aviso correspondentes sejam gravados no mesmo lote da criação/alteração.
