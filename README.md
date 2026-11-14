# CONTROLE DIÁRIO — Aplicação Web

O CONTROLE DIÁRIO é uma aplicação Web acessada pelo navegador, sem instalação local. Esta versão utiliza Firebase para autenticação e armazenamento dos dados operacionais.

## Arquitetura atual

- **Interface:** React, TypeScript e Vite.
- **Autenticação:** Firebase Authentication.
- **Banco de dados:** Cloud Firestore, protegido por `firestore.rules`.
- **Índices:** declarados em `firestore.indexes.json`.
- **Hospedagem de homologação:** Firebase Hosting, no canal temporário `homologacao`.
- **Publicação preparada para produção:** GitHub Pages, por fluxo manual e com configuração Firebase independente.
- **Testes de segurança:** Firebase Emulator Suite e `@firebase/rules-unit-testing`.
- **Backups:** rotinas de exportação, criptografia e restauração cobertas por testes automatizados.

Não fazem parte da arquitetura atual os antigos importadores Google Drive, arquivos JSON operacionais no Drive, Google Identity Services isolado ou o aplicativo Electron.

## Ambientes Firebase

### Homologação

O projeto Firebase `controle-diario-510808` é reservado à homologação. O workflow `.github/workflows/firebase-hosting-preview.yml` executa compilação e testes no emulador, publica regras e índices no projeto de homologação e atualiza o canal temporário do Firebase Hosting.

A publicação de homologação não equivale à liberação de produção.

### Produção

A produção deve utilizar um projeto Firebase separado do projeto de homologação. O workflow `.github/workflows/deploy-web.yml` foi preparado para execução manual e exige as variáveis `PROD_FIREBASE_API_KEY`, `PROD_FIREBASE_AUTH_DOMAIN`, `PROD_FIREBASE_PROJECT_ID` e `PROD_FIREBASE_APP_ID` no ambiente protegido `producao`. O fluxo bloqueia o uso do projeto `controle-diario-510808`.

A publicação permanece indisponível até que o projeto Firebase de produção seja criado e configurado, que o ambiente protegido seja preparado e que a validação final seja aprovada. Não configure credenciais administrativas ou chaves privadas em variáveis `VITE_*`.

Consulte `docs/CONFIGURAR_FIREBASE_HOMOLOGACAO.md` para o roteiro de configuração e a lista de verificações de infraestrutura.

## Desenvolvimento e testes

Requisitos: Node.js 22 e npm.

Instale as dependências:

```bash
npm install
```

Compile a aplicação:

```bash
npm run build
```

Execute os testes das regras Firestore com o emulador ativo:

```bash
npm run test:rules
```

Testes de backup e criptografia:

```bash
npm run test:backup
npm run test:backup:firestore
```

Os workflows de auditoria executam compilação, regras e isolamento, criptografia e restauração em trabalhos paralelos. Os testes de Firestore utilizam o emulador e dados fictícios; não substituem a conferência das configurações reais no Console Firebase nem os testes funcionais de homologação.

## Segurança

- As regras do Firestore são a autoridade de autorização; controles de interface não substituem as regras.
- Os usuários precisam estar aprovados para acessar dados operacionais.
- O acesso de colaboradores é limitado aos próprios dados e permissões de escopo; administradores e supervisores possuem os acessos gerenciais definidos nas regras.
- Configurações pessoais e atendimentos permanecem isolados por colaborador.
- Não coloque credenciais de contas de serviço, chaves privadas ou segredos administrativos no código do navegador ou em variáveis `VITE_*`.

## Publicação

- Homologação: fluxo `.github/workflows/firebase-hosting-preview.yml`, limitado à branch `feature/leste-firebase-multusuario`.
- Produção: fluxo manual `.github/workflows/deploy-web.yml`, com ambiente e configuração Firebase próprios. Não executar até a conclusão da configuração e aprovação formal da produção.
