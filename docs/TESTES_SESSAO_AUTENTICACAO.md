# Testes de sessão e autenticação do Leste

## Objetivo
Verificar que o login corporativo permanece ativo entre recargas e retornos ao navegador, sem dispensar a aprovação administrativa.

## Implementação preparada
- A persistência do Firebase Authentication é definida explicitamente como local no navegador.
- A rotina de login aguarda a configuração de persistência antes de abrir o fluxo do Google.
- O parâmetro que forçava a seleção de conta em cada login foi removido.
- A aprovação administrativa e as regras do Firestore continuam obrigatórias.

## Testes manuais obrigatórios em ambiente de homologação

| ID | Ação | Resultado esperado |
| --- | --- | --- |
| SESS-01 | Entrar com usuário corporativo aprovado | Acesso permitido |
| SESS-02 | Atualizar a página após entrar | Sessão preservada sem novo login, desde que válida |
| SESS-03 | Fechar e reabrir o navegador no mesmo perfil | Sessão preservada, se os dados do site não forem apagados e a política corporativa permitir |
| SESS-04 | Voltar no dia seguinte | Sessão retomada se ainda válida; caso contrário, solicitar autenticação |
| SESS-05 | Usar o botão de sair | Sessão encerrada; novo acesso exige login |
| SESS-06 | Tentar entrar com conta sem aprovação administrativa | Nenhum acesso aos dados operacionais |
| SESS-07 | Limpar os dados do site e abrir novamente | Nova autenticação esperada |
| SESS-08 | Revogar o acesso no Google ou invalidar a sessão | O aplicativo deve solicitar autenticação novamente ou negar acesso |
| SESS-09 | Abrir em outro navegador ou perfil | Não presumir sessão compartilhada entre perfis |
| SESS-10 | Verificar políticas de sessão da empresa | Documentar eventual exigência de autenticação periódica imposta pelo Google Workspace |

## Limitações importantes
Persistência local reduz logins repetidos, mas não pode garantir uma sessão eterna. O Google Workspace pode exigir nova autenticação; o usuário pode sair ou limpar dados do navegador; e uma sessão pode ser invalidada. Não reduzir a segurança para contornar essas políticas.

## Estado da validação
A alteração de código foi preparada na branch de desenvolvimento. Estes cenários ainda precisam ser executados depois que a configuração Firebase de homologação estiver disponível. A alteração não deve ser considerada validada apenas porque a compilação passa.
