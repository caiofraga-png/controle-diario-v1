const { before, after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, runTransaction, setDoc } = require("firebase/firestore");
const { restoreMissingDocuments } = require("../src/web/backupRestoreCore.ts");
const fs = require("node:fs");

const PROJECT_ID = "controle-diario-backup-restore-test";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/admin"), {
      uid: "admin", email: "admin@example.invalid", role: "admin", status: "approved",
      agent: "Administrador fictício", isSupervisor: false,
    });
    await setDoc(doc(context.firestore(), "users/alice/configuration/layout"), {
      schemaVersion: 1, origem: "valor atual que não pode ser sobrescrito",
    });
  });
});

function adminDb() {
  return env.authenticatedContext("admin", {
    email: "admin@example.invalid", email_verified: true,
  }).firestore();
}

async function restoreIntoEmulator(db, documents) {
  return restoreMissingDocuments(documents, async (item) => {
    const reference = doc(db, item.path);
    return runTransaction(db, async (transaction) => {
      const current = await transaction.get(reference);
      if (current.exists()) return false;
      transaction.set(reference, item.data);
      return true;
    });
  });
}

test("restaura dados fictícios no Firestore Emulator e preserva documentos existentes", async () => {
  const db = adminDb();
  const backupDocuments = [
    { path: "users/alice/configuration/layout", data: { schemaVersion: 1, origem: "backup antigo" } },
    { path: "users/alice/preferences/appearance", data: { schemaVersion: 1, tema: "escuro" } },
    { path: "Expediente/alice_backup_teste", data: {
      ownerUid: "alice", date: "2026-11-05", status: "concluido",
      assignment: { uid: "alice" },
    } },
    { path: "sharedAttachments/anexo_teste", data: {
      targetType: "maintenance", targetId: "manutencao_teste",
      name: "comprovante-ficticio.pdf", mimeType: "application/pdf",
      size: 128, data: "ZmljdGljaW8=", createdByUid: "alice",
    } },
  ];

  const first = await restoreIntoEmulator(db, backupDocuments);
  assert.deepEqual(first, { restoredCount: 3, skippedCount: 1 });

  const existing = await getDoc(doc(db, "users/alice/configuration/layout"));
  assert.equal(existing.data().origem, "valor atual que não pode ser sobrescrito");
  const restoredPreference = await getDoc(doc(db, "users/alice/preferences/appearance"));
  assert.equal(restoredPreference.data().tema, "escuro");
  const restoredExpediente = await getDoc(doc(db, "Expediente/alice_backup_teste"));
  assert.equal(restoredExpediente.data().assignment.uid, "alice");
  const restoredAttachment = await getDoc(doc(db, "sharedAttachments/anexo_teste"));
  assert.equal(restoredAttachment.data().name, "comprovante-ficticio.pdf");
  assert.equal(restoredAttachment.data().targetId, "manutencao_teste");

  const second = await restoreIntoEmulator(db, backupDocuments);
  assert.deepEqual(second, { restoredCount: 0, skippedCount: 4 });
  assert.equal((await getDoc(doc(db, "users/alice/configuration/layout"))).data().origem, "valor atual que não pode ser sobrescrito");
});

test("interrupção simulada não apaga nem altera documentos já gravados", async () => {
  const db = adminDb();
  const firstDoc = { path: "users/alice/preferences/appearance", data: { schemaVersion: 1, tema: "claro" } };
  const secondDoc = { path: "users/alice/configuration/layout", data: { schemaVersion: 1, origem: "backup" } };
  let attempts = 0;
  await assert.rejects(restoreMissingDocuments([firstDoc, secondDoc], async (item) => {
    attempts += 1;
    if (attempts === 2) throw new Error("Falha fictícia de conexão");
    const reference = doc(db, item.path);
    return runTransaction(db, async (transaction) => {
      const current = await transaction.get(reference);
      if (current.exists()) return false;
      transaction.set(reference, item.data);
      return true;
    });
  }), /Falha fictícia de conexão/);
  assert.equal((await getDoc(doc(db, "users/alice/preferences/appearance"))).data().tema, "claro");
  assert.equal((await getDoc(doc(db, "users/alice/configuration/layout"))).data().origem, "valor atual que não pode ser sobrescrito");
});
