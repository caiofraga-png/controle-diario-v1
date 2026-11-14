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


test("valida vínculos entre publicações, notificações e histórico de manutenção", async () => {
  const { assertBackupRelationships } = await import("../src/web/backupRestoreCore.ts");
  const promotion = { path: "sharedPromotions/p1", data: { lastNotificationId: "n1" } };
  const promotionNotice = { path: "sharedNotifications/n1", data: {
    category: "promocoes", target: "promocoes", referenceId: "p1",
  } };
  const delinquency = { path: "delinquencyNotices/d1", data: { notificationId: "n2" } };
  const delinquencyNotice = { path: "sharedNotifications/n2", data: {
    category: "cobranca", target: "inadimplencia", noticeId: "d1",
  } };
  const maintenance = { path: "externalMaintenances/m1", data: {
    title: "Manutenção", date: "2026-11-01", location: "Unidade",
    description: "Teste", status: "ongoing", lastNotificationId: "n3", lastHistoryId: "h1",
  } };
  const maintenanceNotice = { path: "sharedNotifications/n3", data: {
    category: "manutencoes", target: "manutencoes", maintenanceId: "m1",
  } };
  const history = { path: "externalMaintenances/m1/history/h1", data: {
    maintenanceId: "m1", after: { title: "Manutenção", date: "2026-11-01",
      location: "Unidade", description: "Teste", status: "ongoing" },
  } };
  const valid = [promotion, promotionNotice, delinquency, delinquencyNotice, maintenance, maintenanceNotice, history];
  assert.doesNotThrow(() => assertBackupRelationships(valid));
  assert.throws(() => assertBackupRelationships([promotion]), /não contém o registro vinculado/);
  assert.throws(() => assertBackupRelationships([promotion, {
    ...promotionNotice, data: { category: "cobranca", target: "inadimplencia", noticeId: "p1" },
  }]), /não corresponde ao registro/);
  assert.throws(() => assertBackupRelationships([maintenance, maintenanceNotice, {
    ...history, data: { maintenanceId: "m1", after: { title: "Outro título" } },
  }]), /diverge no campo title/);
});
