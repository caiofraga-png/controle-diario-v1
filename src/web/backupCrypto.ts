export type BackupPayloadForCrypto = {
  format: "controle-diario-admin-backup";
  schemaVersion: 1 | 2;
  createdAt: string;
  projectId: string;
  createdBy: { uid: string; email: string };
  scope: string[];
  collections: Record<string, unknown[]>;
};

export type EncryptedBackupEnvelope = {
  format: "controle-diario-encrypted-backup";
  schemaVersion: 1;
  algorithm: "AES-256-GCM";
  keyDerivation: "PBKDF2-SHA256";
  iterations: 310000;
  salt: string;
  iv: string;
  integrity: { algorithm: "SHA-256"; digest: string };
  ciphertext: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, [usage],
  );
}

export async function encryptBackupPayload(payload: BackupPayloadForCrypto, password: string): Promise<EncryptedBackupEnvelope> {
  if (password.length < 12) throw new Error("Use uma senha com pelo menos 12 caracteres.");
  const plainText = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", plainText);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, "encrypt");
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainText);
  return {
    format: "controle-diario-encrypted-backup", schemaVersion: 1,
    algorithm: "AES-256-GCM", keyDerivation: "PBKDF2-SHA256", iterations: 310000,
    salt: toBase64(salt), iv: toBase64(iv),
    integrity: { algorithm: "SHA-256", digest: toBase64(new Uint8Array(digest)) },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBackupEnvelope(envelope: EncryptedBackupEnvelope, password: string): Promise<Uint8Array> {
  if (envelope.format !== "controle-diario-encrypted-backup" || envelope.schemaVersion !== 1
    || envelope.algorithm !== "AES-256-GCM" || envelope.keyDerivation !== "PBKDF2-SHA256"
    || envelope.iterations !== 310000 || envelope.integrity?.algorithm !== "SHA-256") {
    throw new Error("Formato, versão ou algoritmo do backup não reconhecido.");
  }
  let salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array;
  try {
    salt = fromBase64(envelope.salt);
    iv = fromBase64(envelope.iv);
    ciphertext = fromBase64(envelope.ciphertext);
  } catch {
    throw new Error("O arquivo de backup possui estrutura criptográfica inválida.");
  }
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("O arquivo de backup possui estrutura criptográfica inválida.");
  }
  const key = await deriveKey(password, salt, "decrypt");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer);
  } catch {
    throw new Error("Não foi possível abrir o backup. Verifique a senha e se o arquivo está íntegro.");
  }
  const digest = await crypto.subtle.digest("SHA-256", plaintext);
  let expected: Uint8Array;
  try { expected = fromBase64(envelope.integrity.digest); }
  catch { throw new Error("A verificação de integridade do backup falhou."); }
  const actual = new Uint8Array(digest);
  if (expected.length !== actual.length || actual.some((byte, index) => byte !== expected[index])) {
    throw new Error("A verificação de integridade do backup falhou.");
  }
  return new Uint8Array(plaintext);
}

export function assertBackupProject(payload: { projectId?: unknown }, expectedProjectId: string): void {
  if (payload.projectId !== expectedProjectId) {
    throw new Error("Este backup pertence a outro projeto Firebase. A restauração foi bloqueada.");
  }
}
