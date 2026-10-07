# CONTROLE DIÁRIO — V1 Web

O CONTROLE DIÁRIO está sendo executado como aplicação Web. O usuário acessa o sistema pelo Chrome/Edge, sem instalar ou baixar um aplicativo.

## Arquitetura

- Interface: React + TypeScript + Vite
- Hospedagem: GitHub Pages
- Autorização: Google Identity Services
- Persistência: Google Drive API
- Dados operacionais: arquivos JSON no Google Drive
- Não há Electron, instalador ou banco local de dados operacionais.

## Google Cloud

Use um cliente OAuth do tipo **Aplicativo Web** no mesmo projeto que possui a Google Drive API habilitada.

Em `src/renderer/config.js`, informe:

```js
window.__CONTROLE_DIARIO_CONFIG__ = {
  googleClientId: "SEU_CLIENT_ID_WEB.apps.googleusercontent.com",
  googlePickerApiKey: "SUA_CHAVE_DA_GOOGLE_PICKER"
};
```

O Client ID e a chave de API são valores públicos usados pelo navegador; ainda assim, a chave de API deve ser restringida no Google Cloud ao domínio da aplicação.

## Google Drive

O aplicativo utiliza a estrutura:

```text
CONTROLE DIÁRIO/
├── CONFIGURAÇÃO/
│   ├── tarefas.json
│   ├── perfis.json
│   ├── email.json
│   └── layout.json
├── HISTÓRICO/
└── SISTEMA/
    ├── estado_atual.json
    ├── estado_anterior.json
    ├── calendario.json
    └── sessão
```

## Publicação

O workflow `.github/workflows/main.yml` compila e publica automaticamente no GitHub Pages a cada push na branch `main`.
