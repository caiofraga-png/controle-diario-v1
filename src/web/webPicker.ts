type PickerConfig = {
  developerKey: string;
  accessToken: string;
};

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    const g = (globalThis as any).gapi;
    if (g?.picker) { resolve(); return; }
    const existing = document.querySelector('script[data-google-picker]');
    if (existing) {
      const wait = () => (globalThis as any).gapi?.picker ? resolve() : setTimeout(wait, 50);
      wait();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.dataset.googlePicker = '1';
    script.onload = () => {
      const api = (globalThis as any).gapi;
      if (!api?.load) { reject(new Error('NÃO FOI POSSÍVEL CARREGAR O GOOGLE PICKER.')); return; }
      api.load('picker', () => resolve());
    };
    script.onerror = () => reject(new Error('NÃO FOI POSSÍVEL CARREGAR O GOOGLE PICKER.'));
    document.head.appendChild(script);
  });
}

export async function pickDriveFolder(config: PickerConfig): Promise<string> {
  if (!config.developerKey) throw new Error('CHAVE DA API DO GOOGLE PICKER NÃO CONFIGURADA.');
  if (!config.accessToken) throw new Error('AUTORIZAÇÃO DO GOOGLE NECESSÁRIA.');
  await loadPickerApi();
  const googlePicker = (globalThis as any).google?.picker;
  if (!googlePicker) throw new Error('GOOGLE PICKER NÃO ESTÁ DISPONÍVEL.');

  return new Promise((resolve, reject) => {
    const view = new googlePicker.DocsView(googlePicker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const picker = new googlePicker.PickerBuilder()
      .setDeveloperKey(config.developerKey)
      .setOAuthToken(config.accessToken)
      .setOrigin(window.location.protocol + '//' + window.location.host)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === googlePicker.Action.PICKED) {
          const id = data.docs?.[0]?.id;
          if (id) resolve(id);
          else reject(new Error('NENHUMA PASTA FOI SELECIONADA.'));
        } else if (data.action === googlePicker.Action.CANCEL) {
          reject(new Error('SELEÇÃO CANCELADA.'));
        }
      })
      .build();

    picker.setVisible(true);
  });
}
