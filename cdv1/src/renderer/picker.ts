import "./styles.css";

const root = document.getElementById("picker-root")!;
root.innerHTML = `
  <div class="picker-loading">
    <strong>SELECIONAR PASTA</strong>
    <p>Carregando o Google Drive…</p>
  </div>`;

async function start() {
  try {
    const config = await (window as any).controleDiario.picker.getConfig();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => (window as any).gapi.load("picker", buildPicker);
    script.onerror = () => fail("NÃO FOI POSSÍVEL CARREGAR O SELETOR DO GOOGLE DRIVE.");
    document.head.appendChild(script);

    function buildPicker() {
      const docsView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);
      const picker = new (window as any).google.picker.PickerBuilder()
        .setDeveloperKey(config.developerKey)
        .setOAuthToken(config.accessToken)
        .addView(docsView)
        .setTitle("Selecione a pasta CONTROLE DIÁRIO")
        .setCallback((data: any) => {
          if (data.action === (window as any).google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc?.id) (window as any).controleDiario.picker.complete({ id: doc.id, name: doc.name ?? "" });
          } else if (data.action === (window as any).google.picker.Action.CANCEL) {
            (window as any).controleDiario.picker.cancel();
          }
        })
        .build();
      picker.setVisible(true);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ABRIR O SELETOR.");
  }
}

function fail(message: string) {
  root.innerHTML = `<div class="picker-loading"><strong>SELECIONAR PASTA</strong><p>${message}</p><button id="cancel">CANCELAR</button></div>`;
  document.getElementById("cancel")?.addEventListener("click", () => (window as any).controleDiario.picker.cancel());
}

void start();
