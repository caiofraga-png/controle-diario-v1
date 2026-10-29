# Configuração do Firebase de homologação — Leste - Controle Diário

## Objetivo e limites

Este roteiro prepara um projeto Firebase separado para testes. Não configura nem cria recursos automaticamente e não deve ser executado em um projeto que contenha dados de produção.

**Não use a versão de produção nem altere a branch `main` durante esta etapa.** Não coloque chaves de conta de serviço, credenciais administrativas ou arquivos privados no repositório.

## 1. Criar um projeto de teste

1. Acesse o [Firebase Console](https://console.firebase.google.com/) com a conta autorizada pela empresa.
2. Crie um projeto separado com um nome identificável, por exemplo `leste-controle-diario-homologacao`. Se a empresa exigir convenção de nomes, siga a convenção interna.
3. Confirme que o projeto é de homologação e não contém dados reais de colaboradores.
4. Abra **Authentication** e habilite o provedor **Google**.
5. Configure o e-mail de suporte do projeto conforme as orientações da empresa.
6. Em **Authentication → Settings → Authorized domains**, inclua apenas os domínios de hospedagem de teste necessários. Os domínios de e-mail corporativo permitidos pelo aplicativo são uma configuração separada no Firestore.
7. Crie o banco **Cloud Firestore** em modo de produção. Não deixe regras abertas para facilitar os testes.
8. Selecione uma região aprovada pela empresa para os dados e registre a decisão antes de criar o banco. A região do Firestore não deve ser escolhida sem considerar os requisitos internos de privacidade, latência e residência de dados.

## 2. Registrar a configuração web

1. No projeto Firebase de homologação, adicione um aplicativo Web.
2. Copie os valores de configuração web para o ambiente de compilação privado do projeto.
3. Configure as variáveis abaixo no ambiente de build/hospedagem de homologação:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` (opcional, se fornecido)
   - `VITE_FIREBASE_STORAGE_BUCKET` (opcional, se fornecido)

A configuração web do Firebase identifica o projeto; ela não substitui as regras de segurança. Nunca use uma chave privada de conta de serviço em variável `VITE_*`, pois esses valores podem ser incluídos no código enviado ao navegador.

## 3. Publicar e testar as regras

1. Revise o arquivo `firestore.rules` junto com a pessoa responsável pela segurança da aplicação.
2. Publique as regras somente no projeto de homologação.
3. Antes de cadastrar pessoas ou dados, teste as permissões com o Emulador do Firestore ou com contas de teste controladas.
4. Verifique explicitamente: usuário sem aprovação, colaborador aprovado, conta bloqueada, administrador, supervisor do mesmo setor, supervisor de outro setor e tentativas de alteração de registros de terceiros.
5. Não considere a compilação do TypeScript como teste das regras do Firestore.

## 4. Provisionamento do primeiro administrador

O primeiro administrador não pode ser criado por uma opção pública da interface nem se promover no navegador. O painel administrativo depende de já existir um documento autorizado em `users/{uid}`, portanto o primeiro perfil precisa ser provisionado por um procedimento confiável.

O administrador inicial planejado para o sistema é `caio_fraga@lestetelecom.net.br`. Antes de provisioná-lo:

1. Faça login no provedor Google do projeto de homologação com essa conta corporativa e confirme o UID exato emitido pelo Firebase Authentication.
2. Confirme por um canal independente que a conta pertence à pessoa autorizada para administrar o sistema.
3. Use um procedimento administrativo confiável, autorizado pela empresa, para criar o documento `users/{uid}` no Firestore. Não adicione endpoint público, botão de autoaprovação ou regra temporária que permita a qualquer usuário criar um administrador.
4. O documento inicial deve conter os campos de perfil previstos no esquema: `uid`, `email`, `login`, `agent`, `sectorId`, `contactId`, `isSupervisor`, `status`, `role`, `createdAt` e `updatedAt`.
5. Defina `role: "admin"` e `status: "approved"` somente depois da verificação independente. Preencha Setor e Contato com IDs reais dos catálogos de homologação; não invente IDs de produção.
6. Registre quem fez o provisionamento, quando e por qual procedimento. Depois, valide que a conta consegue entrar no painel e que uma conta comum não consegue realizar ações administrativas.

**Importante:** este repositório não possui atualmente uma ferramenta de bootstrap administrativo confiável nem um backend administrativo provisionado. Não invente um UID, não use credenciais de serviço no navegador e não flexibilize as regras para contornar essa ausência. A implementação do mecanismo administrativo deve ser revisada antes de automatizar esse passo.

## 5. Configurar domínios corporativos permitidos

Após o primeiro administrador estar provisionado e autenticado, configure o documento `settings/allowedDomains` com os domínios autorizados pela empresa:

- `lestetelecom.net.br`
- `lestetelecom.com.br`
- `lestetelecom.com`

A lista deve conter domínios normalizados, sem o símbolo `@`. O domínio permitido apenas autoriza a solicitação de acesso; não aprova automaticamente o colaborador. Cada solicitação precisa passar por decisão administrativa.

## 6. Contas e dados de teste

Use contas corporativas de teste aprovadas para homologação e combine previamente quem pode acessá-las. Teste, no mínimo:

- conta permitida sem aprovação;
- conta aprovada;
- conta bloqueada durante sessão ativa;
- conta de domínio não permitido;
- segundo colaborador aprovado para verificar isolamento;
- supervisor e administrador, com privilégios distintos.

Não copie automaticamente configuração, expediente ou histórico real do Google Drive para o projeto de homologação. Cada usuário deve iniciar com dados independentes, e qualquer migração de histórico precisa de aprovação e avaliação de autoria.

## 7. Checklist de liberação da homologação

- [ ] Projeto Firebase separado da produção.
- [ ] Provedor Google habilitado.
- [ ] Domínios de hospedagem de teste revisados.
- [ ] Firestore criado na região aprovada.
- [ ] Regras de segurança revisadas e publicadas no projeto de teste.
- [ ] Testes de regras positivos e negativos executados.
- [ ] Primeiro administrador provisionado por procedimento confiável.
- [ ] Documento `settings/allowedDomains` preenchido pelo administrador.
- [ ] Contas de teste e seus papéis documentados.
- [ ] Nenhum dado real importado sem autorização.
- [ ] Variáveis de configuração disponíveis apenas no ambiente de build/hospedagem correto.
- [x] O fluxo principal da branch de migração usa os serviços Firebase para expediente, configuração, calendário e histórico; falta a homologação ponta a ponta no navegador.

## Estado atual

Este arquivo é um roteiro operacional, não uma confirmação das configurações existentes no Firebase Console. A compilação de homologação no GitHub Actions usa atualmente o projeto `controle-diario-510808` por meio de variáveis públicas `VITE_FIREBASE_*`. Antes de realizar testes com contas reais, confirme no Firebase Console que esse é o projeto autorizado para homologação e que não contém dados de produção. Se for necessário um projeto separado, configure-o explicitamente no ambiente de build; não altere a configuração silenciosamente.

Os testes automatizados de compilação e regras no emulador passaram. Isso não confirma que o provedor Google esteja habilitado no projeto real, que os domínios de hospedagem estejam autorizados, que as regras tenham sido publicadas ou que o administrador inicial tenha sido provisionado. Essas verificações exigem acesso autorizado ao Firebase Console.
