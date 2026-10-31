# Provisionamento seguro do primeiro administrador

Este procedimento é executado uma única vez no projeto Firebase autorizado, antes de abrir o sistema aos colaboradores. Ele não altera a versão publicada nem migra dados antigos do Google Drive.

## Pré-requisitos

1. Confirmar o projeto Firebase correto com o responsável pelo projeto.
2. Habilitar o provedor **Google** em Authentication.
3. Criar/confirmar o banco Cloud Firestore.
4. Configurar a aplicação Web com as variáveis `VITE_FIREBASE_*` no ambiente de compilação.
5. Confirmar o domínio corporativo real que será permitido. Não copie os domínios fictícios usados nos testes.

## Criar o documento do administrador inicial

1. No Firebase Console, abrir **Authentication → Users** e adicionar/iniciar sessão com a conta Google corporativa que será a administradora inicial.
2. Copiar o **UID** exato dessa conta.
3. Abrir **Firestore Database → Data** e criar manualmente o documento `users/{UID}`, usando o UID como ID do documento.
4. Usar os campos abaixo, substituindo os valores de exemplo pelos dados reais:

```json
{
  "uid": "UID_EXATO_DO_FIREBASE_AUTH",
  "email": "administrador@DOMINIO_CORPORATIVO_REAL",
  "login": "login-corporativo",
  "agent": "Nome do administrador",
  "sectorId": "",
  "contactId": "",
  "isSupervisor": false,
  "status": "approved",
  "role": "admin",
  "createdAt": "2026-10-28T00:00:00.000Z",
  "updatedAt": "2026-10-28T00:00:00.000Z"
}
```

A criação manual pelo Console é intencional: as regras do Firestore não permitem que um cliente comum crie a própria conta administrativa. Nunca habilite uma regra ampla de escrita para contornar o provisionamento.

## Configurar o domínio permitido

Criar ou revisar o documento `settings/allowedDomains` com este formato:

```json
{
  "domains": ["DOMINIO_CORPORATIVO_REAL"]
}
```

Informe somente o domínio, sem `@`, sem espaços e em letras minúsculas. Inclua apenas domínios aprovados pela organização. Não coloque endereços pessoais nem domínios de teste neste documento de produção.

## Validação obrigatória

- Entrar com a conta administrativa e confirmar que a aplicação reconhece `status: "approved"` e `role: "admin"`.
- Confirmar que uma conta corporativa ainda não aprovada não consegue acessar dados operacionais.
- Confirmar que uma conta fora dos domínios permitidos não consegue solicitar acesso.
- Confirmar que a interface do cliente não permite promover a própria conta a administradora.
- Validar as regras no Emulator Suite antes de implantar `firestore.rules`.

## Segurança e separação de ambientes

Não armazenar credenciais de conta de serviço, chaves privadas ou segredos administrativos no repositório nem em variáveis `VITE_*`. Os valores de configuração Web identificam o projeto, mas não substituem as regras de segurança.

Este documento é um procedimento de implantação; não significa que o primeiro administrador ou o documento de domínio já tenham sido criados. A configuração real deve ser feita e verificada no projeto Firebase correto.
