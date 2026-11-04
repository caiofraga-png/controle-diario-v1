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

A política fica em `featurePermissions/delinquency`. Supervisores e administradores podem habilitar o recurso e selecionar setores e/ou contatos autorizados. A seleção é cumulativa: pertencer a um setor liberado ou a um contato liberado concede a permissão. A validação no serviço de domínio deve ser chamada novamente ao implementar a criação/publicação dos avisos, além das regras do Firestore.

## Próxima integração

O menu de inadimplência deverá criar a notificação **Novo alerta de inadimplência** após a publicação bem-sucedida. O menu Manutenções Externas deverá criar **Atualização de manutenção** após publicar ou atualizar uma manutenção, conforme a regra de evento definida para esse recurso.
