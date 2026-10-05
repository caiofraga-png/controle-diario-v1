import "./styles.css";
const root = document.getElementById("picker-root");
root.innerHTML = `
  <div class="picker-loading">
    <strong>SELECIONAR PASTA</strong>
    <p>Carregando o Google Drive…</p>
  </div>`;
async function start() {
    try {
        const config = await window.controleDiario.picker.getConfig();
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.onload = () => window.gapi.load("picker", buildPicker);
        script.onerror = () => fail("NÃO FOI POSSÍVEL CARREGAR O SELETOR DO GOOGLE DRIVE.");
        document.head.appendChild(script);
        function buildPicker() {
            const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true);
            const picker = new window.google.picker.PickerBuilder()
                .setDeveloperKey(config.developerKey)
                .setOAuthToken(config.accessToken)
                .addView(docsView)
                .setTitle("Selecione a pasta CONTROLE DIÁRIO")
                .setCallback((data) => {
                if (data.action === window.google.picker.Action.PICKED) {
                    const doc = data.docs?.[0];
                    if (doc?.id)
                        window.controleDiario.picker.complete({ id: doc.id, name: doc.name ?? "" });
                }
                else if (data.action === window.google.picker.Action.CANCEL) {
                    window.controleDiario.picker.cancel();
                }
            })
                .build();
            picker.setVisible(true);
        }
    }
    catch (error) {
        fail(error instanceof Error ? error.message : "NÃO FOI POSSÍVEL ABRIR O SELETOR.");
    }
}
function fail(message) {
    root.innerHTML = `<div class="picker-loading"><strong>SELECIONAR PASTA</strong><p>${message}</p><button id="cancel">CANCELAR</button></div>`;
    document.getElementById("cancel")?.addEventListener("click", () => window.controleDiario.picker.cancel());
}
void start();
