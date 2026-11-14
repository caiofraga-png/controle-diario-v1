const { test } = require("node:test");
const assert = require("node:assert/strict");

test("restaura documentos ausentes e preserva os que já existem", async () => {
  const { restoreMissingDocuments } = await import("../src/web/backupRestoreCore.ts");
  const store = new Map([["users/existente", { nome: "Valor atual" }]]);
  const documents = [
    { path: "users/existente", data: { nome: "Valor antigo do backup" } },
    { path: "users/novo", data: { nome: "Pessoa fictícia" } },
    { path: "settings/config", data: { tema: "escuro" } },
  ];
  const progress = [];
  const result = await restoreMissingDocuments(documents, async (document) => {
    if (store.has(document.path)) return false;
    store.set(document.path, document.data);
    return true;
  }, (value) => progress.push(value));

  assert.deepEqual(result, { restoredCount: 2, skippedCount: 1 });
  assert.deepEqual(store.get("users/existente"), { nome: "Valor atual" });
  assert.deepEqual(store.get("users/novo"), { nome: "Pessoa fictícia" });
  assert.deepEqual(store.get("settings/config"), { tema: "escuro" });
  assert.equal(progress.length, 3);
});

test("uma segunda execução não duplica nem sobrescreve documentos", async () => {
  const { restoreMissingDocuments } = await import("../src/web/backupRestoreCore.ts");
  const store = new Map([["users/1", { nome: "Já existente" }]]);
  const documents = [{ path: "users/1", data: { nome: "Do backup" } }];
  const result = await restoreMissingDocuments(documents, async (document) => {
    if (store.has(document.path)) return false;
    store.set(document.path, document.data);
    return true;
  });
  assert.deepEqual(result, { restoredCount: 0, skippedCount: 1 });
  assert.deepEqual(store.get("users/1"), { nome: "Já existente" });
});

test("interrupção mantém contagem do progresso já concluído", async () => {
  const { restoreMissingDocuments } = await import("../src/web/backupRestoreCore.ts");
  const progress = [];
  await assert.rejects(restoreMissingDocuments([
    { path: "users/1", data: { nome: "Um" } },
    { path: "users/2", data: { nome: "Dois" } },
  ], async (document) => {
    if (document.path === "users/2") throw new Error("Falha simulada");
    return true;
  }, (value) => progress.push(value)), /Falha simulada/);
  assert.deepEqual(progress, [{ restoredCount: 1, skippedCount: 0 }]);
});

 
test("valida proprietário e identidade dos caminhos privados antes de restaurar", async () => {
  const { assertRestoreDocumentIdentity } = await import("../src/web/backupRestoreCore.ts");
  assert.doesNotThrow(() => assertRestoreDocumentIdentity("users/alice", { uid: "alice", role: "employee" }));
  assert.throws(() => assertRestoreDocumentIdentity("users/alice", { uid: "bob" }), /identificador do usuário/);
  assert.doesNotThrow(() => assertRestoreDocumentIdentity("users/alice/attendanceRows/ticket-1", { ownerUid: "alice" }));
  assert.throws(() => assertRestoreDocumentIdentity("users/alice/attendanceRows/ticket-1", { ownerUid: "bob" }), /proprietário não corresponde/);
  assert.throws(() => assertRestoreDocumentIdentity("users/alice/operational/currentState", { schemaVersion: 1 }), /proprietário não corresponde/);
  assert.doesNotThrow(() => assertRestoreDocumentIdentity("Expediente/alice_2026-11-10", { ownerUid: "alice", assignment: { uid: "alice" } }));
  assert.throws(() => assertRestoreDocumentIdentity("Expediente/alice_2026-11-10", { ownerUid: "alice", assignment: { uid: "bob" } }), /atribuição do expediente/);
});
