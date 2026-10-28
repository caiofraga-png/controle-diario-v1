const { before, after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");

const PROJECT_ID = "leste-controle-diario-rules-test";
let env;

const profiles = {
  alice: {
    uid: "alice", email: "alice@lestetelecom.net.br", login: "alice",
    agent: "Alice", sectorId: "suporte", contactId: "equipe-a",
    role: "employee", status: "approved", isSupervisor: false,
  },
  bob: {
    uid: "bob", email: "bob@lestetelecom.net.br", login: "bob",
    agent: "Bob", sectorId: "financeiro", contactId: "equipe-b",
    role: "employee", status: "approved", isSupervisor: false,
  },
  supervisor: {
    uid: "supervisor", email: "supervisor@lestetelecom.net.br",
    login: "supervisor", agent: "Supervisora", sectorId: "suporte",
    contactId: "equipe-a", role: "employee", status: "approved",
    isSupervisor: true,
  },
  admin: {
    uid: "admin", email: "admin@lestetelecom.net.br", login: "admin",
    agent: "Admin", sectorId: "suporte", contactId: "equipe-a",
    role: "admin", status: "approved", isSupervisor: false,
  },
  pending: {
    uid: "pending", email: "pending@lestetelecom.net.br", login: "pending",
    agent: "Pendente", sectorId: "suporte", contactId: "equipe-a",
    role: "employee", status: "pending", isSupervisor: false,
  },
};

function expediente(ownerUid = "alice", overrides = {}) {
  const assignment = {
    uid: ownerUid,
    login: ownerUid === "alice" ? "alice" : "bob",
    agent: ownerUid === "alice" ? "Alice" : "Bob",
    sectorId: ownerUid === "alice" ? "suporte" : "financeiro",
    sectorName: ownerUid === "alice" ? "Suporte" : "Financeiro",
    contactId: ownerUid === "alice" ? "equipe-a" : "equipe-b",
    contactName: ownerUid === "alice" ? "Equipe A" : "Equipe B",
  };
  return {
    ownerUid,
    date: "2026-10-28",
    status: "concluido",
    sectorId: assignment.sectorId,
    sectorName: assignment.sectorName,
    contactId: assignment.contactId,
    contactName: assignment.contactName,
    login: assignment.login,
    agent: assignment.agent,
    assignment,
    completedAt: "2026-10-28T12:00:00.000Z",
    ...overrides,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: require("node:fs").readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const profile of Object.values(profiles)) {
      await setDoc(doc(db, "users", profile.uid), profile);
    }
    await setDoc(doc(db, "organizationSectors", "suporte"), {
      id: "suporte", name: "Suporte", active: true,
    });
    await setDoc(doc(db, "organizationSectors", "financeiro"), {
      id: "financeiro", name: "Financeiro", active: true,
    });
    await setDoc(doc(db, "organizationContacts", "equipe-a"), {
      id: "equipe-a", name: "Equipe A", sectorId: "suporte", active: true,
    });
    await setDoc(doc(db, "organizationContacts", "equipe-b"), {
      id: "equipe-b", name: "Equipe B", sectorId: "financeiro", active: true,
    });
    await setDoc(doc(db, "settings", "allowedDomains"), {
      domains: ["lestetelecom.net.br", "lestetelecom.com.br", "lestetelecom.com"],
    });
    await setDoc(doc(db, "Expediente", "alice_2026-10-28"), expediente("alice"));
    await setDoc(doc(db, "Expediente", "bob_2026-10-28"), expediente("bob"));
  });
});

function dbAs(uid, email = `${uid}@lestetelecom.net.br`, email_verified = true) {
  return env.authenticatedContext(uid, { email, email_verified }).firestore();
}

test("usuário aprovado lê e grava sua configuração", async () => {
  const db = dbAs("alice");
  const ref = doc(db, "users/alice/configuration/layout");
  await assertSucceeds(setDoc(ref, { schemaVersion: 1, blocos: [] }));
  await assertSucceeds(getDoc(ref));
});

test("usuário não acessa configuração de outra pessoa", async () => {
  const db = dbAs("alice");
  await assertFails(getDoc(doc(db, "users/bob/configuration/layout")));
  await assertFails(setDoc(doc(db, "users/bob/configuration/layout"), { schemaVersion: 1 }));
});

test("usuário não pode alterar o próprio perfil organizacional", async () => {
  await assertFails(updateDoc(doc(dbAs("alice"), "users/alice"), { sectorId: "financeiro" }));
});

test("conta pendente não acessa dados privados", async () => {
  await assertFails(getDoc(doc(dbAs("pending"), "users/pending/configuration/layout")));
  await assertFails(setDoc(doc(dbAs("pending"), "users/pending/configuration/layout"), { schemaVersion: 1 }));
});

test("estado operacional permite leitura e gravação apenas pelo proprietário aprovado", async () => {
  const alice = dbAs("alice");
  const own = doc(alice, "users/alice/operational/currentState");
  await assertSucceeds(setDoc(own, {
    schemaVersion: 1, ownerUid: "alice", estado: null, updatedAt: "2026-10-28T12:00:00Z",
  }));
  await assertSucceeds(getDoc(own));
  await assertFails(getDoc(doc(dbAs("bob"), "users/alice/operational/currentState")));
  await assertFails(setDoc(doc(dbAs("pending"), "users/pending/operational/currentState"), {
    schemaVersion: 1, ownerUid: "pending", estado: null,
  }));
  await assertFails(setDoc(doc(alice, "users/bob/operational/currentState"), {
    schemaVersion: 1, ownerUid: "alice", estado: null,
  }));
});

test("histórico operacional é somente acréscimo e não pode ser editado nem excluído", async () => {
  const db = dbAs("alice");
  const ref = doc(db, "users/alice/operational/history/entries/2026-10-28_R001");
  await assertSucceeds(setDoc(ref, {
    schemaVersion: 1,
    ownerUid: "alice",
    id: "2026-10-28-R001",
    versao: 1,
    data: "2026-10-28",
    perfil: { id: "P001", nome: "MÍDIAS" },
    tarefas: [],
    emailsGlobais: [],
    observacao: "",
    status: "CONCLUIDO",
    criadoEm: "2026-10-28T08:00:00Z",
    concluidoEm: "2026-10-28T12:00:00Z",
    ultimaAlteracao: "2026-10-28T12:00:00Z",
    origemVersao: null,
  }));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { observacao: "tentativa de sobrescrita" }));
  await assertFails(deleteDoc(ref));
  await assertFails(getDoc(doc(dbAs("bob"), "users/alice/operational/history/entries/2026-10-28_R001")));
});

test("proprietário cria expediente com fotografia válida e catálogos ativos", async () => {
  const db = dbAs("alice");
  await assertSucceeds(setDoc(doc(db, "Expediente", "alice_2026-10-29"), expediente("alice", { date: "2026-10-29" })));
});

test("não permite criar expediente em nome de outra pessoa", async () => {
  const forged = expediente("bob");
  await assertFails(setDoc(doc(dbAs("alice"), "Expediente", "forged"), forged));
});

test("não permite falsificar nome/lotação nem usar contato de outro setor", async () => {
  const db = dbAs("alice");
  const wrongName = expediente("alice", { sectorName: "Administrativo" });
  await assertFails(setDoc(doc(db, "Expediente", "wrong-name"), wrongName));
  const wrongContact = expediente("alice", {
    contactId: "equipe-b",
    contactName: "Equipe B",
    assignment: { ...expediente("alice").assignment, contactId: "equipe-b", contactName: "Equipe B" },
  });
  await assertFails(setDoc(doc(db, "Expediente", "wrong-contact"), wrongContact));
});

test("não permite criar expediente com setor ou contato inativo", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "organizationSectors/suporte"), { active: false });
  });
  await assertFails(setDoc(doc(dbAs("alice"), "Expediente", "inactive-sector"), expediente("alice")));
});

test("proprietário só atualiza status e completedAt; não pode excluir índice", async () => {
  const db = dbAs("alice");
  const ref = doc(db, "Expediente/alice_2026-10-28");
  await assertSucceeds(updateDoc(ref, { status: "revisado" }));
  await assertSucceeds(updateDoc(ref, { completedAt: "2026-10-28T13:00:00.000Z" }));
  await assertFails(updateDoc(ref, { agent: "Pessoa falsificada" }));
  await assertFails(deleteDoc(ref));
});

test("administrador lê índice de outra pessoa, mas não o altera", async () => {
  const ref = doc(dbAs("admin"), "Expediente/bob_2026-10-28");
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { status: "alterado pelo admin" }));
});

test("supervisor lê registro do próprio setor, mas não de outro setor", async () => {
  const db = dbAs("supervisor");
  await assertSucceeds(getDoc(doc(db, "Expediente/alice_2026-10-28")));
  await assertFails(getDoc(doc(db, "Expediente/bob_2026-10-28")));
  await assertFails(updateDoc(doc(db, "Expediente/alice_2026-10-28"), { status: "alterado" }));
});

test("domínio corporativo não verificado não pode abrir solicitação de acesso", async () => {
  const db = dbAs("external", "user@example.org", true);
  await assertFails(setDoc(doc(db, "accessRequests/external"), {
    uid: "external", email: "user@example.org", status: "pending", requestedAt: "2026-10-28T12:00:00Z",
  }));
});

test("usuário comum não pode se promover a administrador", async () => {
  await assertFails(updateDoc(doc(dbAs("alice"), "users/alice"), { role: "admin" }));
});


test("usuário autenticado não pode criar o próprio perfil nem atribuir papel administrativo", async () => {
  const db = dbAs("newuser");
  await assertFails(setDoc(doc(db, "users/newuser"), {
    uid: "newuser",
    email: "newuser@lestetelecom.net.br",
    login: "newuser",
    agent: "Novo usuário",
    sectorId: "suporte",
    contactId: "equipe-a",
    isSupervisor: false,
    status: "approved",
    role: "admin",
  }));
});

test("conta do domínio permitido pode criar somente a própria solicitação pendente", async () => {
  const db = dbAs("newuser");
  await assertSucceeds(setDoc(doc(db, "accessRequests/newuser"), {
    uid: "newuser",
    email: "newuser@lestetelecom.net.br",
    status: "pending",
    requestedAt: new Date().toISOString(),
  }));
  await assertFails(setDoc(doc(db, "accessRequests/other-user"), {
    uid: "other-user",
    email: "other-user@lestetelecom.net.br",
    status: "pending",
    requestedAt: new Date().toISOString(),
  }));
});

test("solicitação de acesso não pode ser enviada como aprovada", async () => {
  const db = dbAs("newuser");
  await assertFails(setDoc(doc(db, "accessRequests/newuser"), {
    uid: "newuser",
    email: "newuser@lestetelecom.net.br",
    status: "approved",
    requestedAt: new Date().toISOString(),
  }));
});

test("e-mail corporativo não verificado não pode solicitar acesso", async () => {
  const db = dbAs("newuser", "newuser@lestetelecom.net.br", false);
  await assertFails(setDoc(doc(db, "accessRequests/newuser"), {
    uid: "newuser",
    email: "newuser@lestetelecom.net.br",
    status: "pending",
    requestedAt: new Date().toISOString(),
  }));
});
