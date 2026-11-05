const { test } = require("node:test");
const assert = require("node:assert/strict");

let cryptoModule;
test("carrega as funções criptográficas isoladas, sem Firebase", async () => {
  cryptoModule = await import("../src/web/backupCrypto.ts");
  assert.equal(typeof cryptoModule.encryptBackupPayload, "function");
  assert.equal(typeof cryptoModule.decryptBackupEnvelope, "function");
});

const fixture = () => ({
  format: "controle-diario-admin-backup",
  schemaVersion: 2,
  createdAt: "2026-11-05T08:00:00.000Z",
  projectId: "projeto-ficticio-teste",
  createdBy: { uid: "usuario-ficticio", email: "teste@example.invalid" },
  scope: ["Dados fictícios para teste automatizado"],
  collections: {
    users: [{ id: "usuario-ficticio", path: "users/usuario-ficticio", data: { nome: "Pessoa Fictícia" } }],
    settings: [],
  },
});
const password = "Senha-ficticia-segura-2026";

test("criptografa e recupera integralmente um backup fictício", async () => {
  const envelope = await cryptoModule.encryptBackupPayload(fixture(), password);
  const plain = await cryptoModule.decryptBackupEnvelope(envelope, password);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), fixture());
  assert.equal(envelope.algorithm, "AES-256-GCM");
  assert.equal(envelope.keyDerivation, "PBKDF2-SHA256");
  assert.equal(envelope.iterations, 310000);
});

test("rejeita senha incorreta", async () => {
  const envelope = await cryptoModule.encryptBackupPayload(fixture(), password);
  await assert.rejects(
    cryptoModule.decryptBackupEnvelope(envelope, "Outra-senha-ficticia-2026"),
    /Verifique a senha/,
  );
});

test("rejeita arquivo adulterado", async () => {
  const envelope = await cryptoModule.encryptBackupPayload(fixture(), password);
  const bytes = Uint8Array.from(atob(envelope.ciphertext), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  envelope.ciphertext = btoa(String.fromCharCode(...bytes));
  await assert.rejects(cryptoModule.decryptBackupEnvelope(envelope, password), /Verifique a senha/);
});

test("rejeita envelope com algoritmo ou estrutura desconhecida", async () => {
  const envelope = await cryptoModule.encryptBackupPayload(fixture(), password);
  await assert.rejects(
    cryptoModule.decryptBackupEnvelope({ ...envelope, iterations: 1000 }, password),
    /Formato, versão ou algoritmo/,
  );
  await assert.rejects(
    cryptoModule.decryptBackupEnvelope({ ...envelope, salt: "inválido" }, password),
    /estrutura criptográfica inválida/,
  );
});

test("bloqueia backup pertencente a outro projeto Firebase", () => {
  assert.doesNotThrow(() => cryptoModule.assertBackupProject(fixture(), "projeto-ficticio-teste"));
  assert.throws(
    () => cryptoModule.assertBackupProject(fixture(), "outro-projeto-ficticio"),
    /outro projeto Firebase/,
  );
});

test("exige senha mínima de 12 caracteres para exportar", async () => {
  await assert.rejects(cryptoModule.encryptBackupPayload(fixture(), "curta"), /12 caracteres/);
});
