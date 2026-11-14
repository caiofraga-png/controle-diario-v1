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
  getDocs,
  collectionGroup,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} = require("firebase/firestore");

const PROJECT_ID = "leste-controle-diario-rules-test";
let env;

const profiles = {
  alice: {
    uid: "alice", email: "alice@lestetelecom.net.br", login: "alice",
    agent: "Alice", sectorId: "suporte", contactId: "equipe-a",
    role: "employee", status: "approved", isSupervisor: false,
    allowedProfileIds: ["P001"],
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
    await setDoc(doc(db, "accessRequests", "pending"), {
      uid: "pending",
      email: "pending@lestetelecom.net.br",
      status: "pending",
      requestedAt: "2026-10-28T12:00:00.000Z",
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

test("administrador pode ler subcoleções privadas de qualquer colaborador para backup", async () => {
  const admin = dbAs("admin");
  const privatePaths = [
    "users/alice/configuration/layout",
    "users/alice/preferences/appearance",
    "users/alice/preferences/notifications",
    "users/alice/calendar/dados",
    "users/alice/taskCustomizations/T001",
    "users/alice/usefulLinks/L001",
    "users/alice/operational/currentState",
    "users/alice/operational/history/entries/2026-10-28_R001",
  ];
  for (const path of privatePaths) {
    await assertSucceeds(getDoc(doc(admin, path)));
  }
});

test("supervisor lê expedientes e históricos de outros colaboradores, mas mantém as demais subcoleções privadas", async () => {
  const supervisor = dbAs("supervisor");
  const privatePaths = [
    "users/alice/configuration/layout",
    "users/alice/preferences/appearance",
    "users/alice/calendar/dados",
    "users/alice/taskCustomizations/T001",
    "users/alice/usefulLinks/L001",
  ];
  for (const path of privatePaths) {
    await assertFails(getDoc(doc(supervisor, path)));
  }
  await assertSucceeds(getDoc(doc(supervisor, "users/alice/operational/currentState")));
  await assertSucceeds(getDoc(doc(supervisor, "users/alice/operational/history/entries/2026-10-28_R001")));
});

async function seedOperationalQueryFixtures() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const uid of ["alice", "bob"]) {
      await setDoc(doc(db, "users", uid, "operational", "currentState"), {
        schemaVersion: 1, ownerUid: uid, estado: null,
      });
      await setDoc(doc(db, "users", uid, "operational", "history", "entries", `fixture-${uid}`), {
        schemaVersion: 1, ownerUid: uid, id: `fixture-${uid}`, versao: 1,
        data: "2026-10-28", perfil: { id: "P001", nome: "MÍDIAS" },
        tarefas: [], emailsGlobais: [], observacao: "", status: "CONCLUIDO",
        criadoEm: "2026-10-28T08:00:00Z", concluidoEm: "2026-10-28T12:00:00Z",
        ultimaAlteracao: "2026-10-28T12:00:00Z", origemVersao: null,
      });
    }
  });
}

test("supervisor consulta em grupo os expedientes e históricos de todos os colaboradores", async () => {
  await seedOperationalQueryFixtures();
  const db = dbAs("supervisor");
  const currentStates = await getDocs(query(
    collectionGroup(db, "operational"),
    where("schemaVersion", "==", 1),
  ));
  const historyEntries = await getDocs(collectionGroup(db, "entries"));

  assert.equal(currentStates.size, 2);
  assert.deepEqual(currentStates.docs.map(item => item.data().ownerUid).sort(), ["alice", "bob"]);
  assert.equal(historyEntries.size, 2);
  assert.deepEqual(historyEntries.docs.map(item => item.data().ownerUid).sort(), ["alice", "bob"]);
});

test("colaborador só consulta em grupo os próprios expedientes e históricos", async () => {
  await seedOperationalQueryFixtures();
  const db = dbAs("alice");
  const ownCurrentStates = await getDocs(query(
    collectionGroup(db, "operational"),
    where("ownerUid", "==", "alice"),
    where("schemaVersion", "==", 1),
  ));
  const ownHistory = await getDocs(query(
    collectionGroup(db, "entries"),
    where("ownerUid", "==", "alice"),
  ));

  assert.equal(ownCurrentStates.size, 1);
  assert.equal(ownHistory.size, 1);
  await assertFails(getDocs(query(
    collectionGroup(db, "operational"),
    where("schemaVersion", "==", 1),
  )));
  await assertFails(getDocs(collectionGroup(db, "entries")));
});

test("administrador pode restaurar documentos privados ausentes, mas não sobrescrever nem excluir", async () => {
  const admin = dbAs("admin");
  const layout = doc(admin, "users/alice/configuration/layout");
  await assertSucceeds(setDoc(layout, { schemaVersion: 1, blocos: [], restaurado: true }));
  await assertFails(updateDoc(layout, { restaurado: false }));
  await assertFails(deleteDoc(layout));

  const currentState = doc(admin, "users/alice/operational/currentState");
  await assertSucceeds(setDoc(currentState, {
    schemaVersion: 1, ownerUid: "alice", estado: null, updatedAt: "2026-10-28T12:00:00Z",
  }));
  await assertFails(updateDoc(currentState, { estado: { id: "alterado" } }));
  await assertFails(deleteDoc(currentState));

  const history = doc(admin, "users/alice/operational/history/entries/backup-R001");
  await assertSucceeds(setDoc(history, {
    schemaVersion: 1, ownerUid: "alice", id: "backup-R001", versao: 1,
    data: "2026-10-28", perfil: { id: "P001", nome: "MÍDIAS" }, tarefas: [],
    emailsGlobais: [], observacao: "Registro restaurado", status: "CONCLUIDO",
    criadoEm: "2026-10-28T08:00:00Z", concluidoEm: "2026-10-28T12:00:00Z",
    ultimaAlteracao: "2026-10-28T12:00:00Z", origemVersao: null,
  }));
  await assertFails(updateDoc(history, { observacao: "não pode alterar" }));
  await assertFails(deleteDoc(history));
});

test("supervisor não pode restaurar dados privados de outro colaborador", async () => {
  const supervisor = dbAs("supervisor");
  await assertFails(setDoc(doc(supervisor, "users/alice/configuration/layout"), { schemaVersion: 1 }));
  await assertFails(setDoc(doc(supervisor, "users/alice/operational/currentState"), {
    schemaVersion: 1, ownerUid: "alice", estado: null,
  }));
});

test("administrador pode recriar índice histórico de expediente sem poder editá-lo", async () => {
  const admin = dbAs("admin");
  const ref = doc(admin, "Expediente/bob_backup_2026-10-27");
  await assertSucceeds(setDoc(ref, expediente("bob", { date: "2026-10-27" })));
  await assertFails(updateDoc(ref, { status: "alterado" }));
  await assertFails(deleteDoc(ref));
});

test("administrador pode criar perfil administrativo ausente durante restauração", async () => {
  const admin = dbAs("admin");
  await assertSucceeds(setDoc(doc(admin, "users/restored-admin"), {
    uid: "restored-admin", email: "restored@lestetelecom.net.br",
    role: "admin", status: "approved", login: "restored", agent: "Restaurado",
  }));
});

test("administrador não pode sobrescrever configuração privada de colaborador", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice/configuration/layout"), {
      schemaVersion: 1, valor: "original",
    });
  });
  await assertFails(setDoc(doc(dbAs("admin"), "users/alice/configuration/layout"), {
    schemaVersion: 1, valor: "sobrescrito",
  }));
});

test("colaborador lê e grava somente suas personalizações de tarefas", async () => {
  const alice = dbAs("alice");
  const own = doc(alice, "users/alice/taskCustomizations/T001");
  await assertSucceeds(setDoc(own, { taskId: "T001", criacao: "Minha criação" }));
  await assertSucceeds(getDoc(own));
  await assertFails(getDoc(doc(alice, "users/bob/taskCustomizations/T001")));
  await assertFails(setDoc(doc(alice, "users/bob/taskCustomizations/T001"), {
    taskId: "T001", criacao: "Tentativa de alteração de outra pessoa",
  }));
});

test("colaborador não pode alterar o padrão institucional compartilhado", async () => {
  const db = dbAs("alice");
  await assertFails(setDoc(doc(db, "sharedTaskCatalog/current"), {
    schemaVersion: 1, tarefas: { schemaVersion: 1, tarefas: [] },
  }));
});

test("usuário não pode alterar o próprio perfil organizacional", async () => {
  await assertFails(updateDoc(doc(dbAs("alice"), "users/alice"), { sectorId: "financeiro" }));
});

test("conta pendente não acessa dados privados", async () => {
  await assertFails(getDoc(doc(dbAs("pending"), "users/pending/configuration/layout")));
  await assertFails(setDoc(doc(dbAs("pending"), "users/pending/configuration/layout"), { schemaVersion: 1 }));
});

test("usuário aprovado pode consultar seu estado operacional ainda não criado", async () => {
  const alice = dbAs("alice");
  await assertSucceeds(getDoc(doc(alice, "users/alice/operational/currentState")));
  await assertFails(getDoc(doc(alice, "users/bob/operational/currentState")));
  await assertFails(getDoc(doc(dbAs("pending"), "users/pending/operational/currentState")));
});

test("estado operacional permite GERAL somente quando há ao menos um perfil autorizado", async () => {
  const aliceRef = doc(dbAs("alice"), "users/alice/operational/currentState");
  await assertSucceeds(setDoc(aliceRef, {
    schemaVersion: 1,
    ownerUid: "alice",
    estado: { id: "state-geral", perfil: { id: "GERAL", nome: "GERAL" } },
    updatedAt: "2026-10-28T12:00:00Z",
  }));
  const bobRef = doc(dbAs("bob"), "users/bob/operational/currentState");
  await assertFails(setDoc(bobRef, {
    schemaVersion: 1,
    ownerUid: "bob",
    estado: { id: "state-geral", perfil: { id: "GERAL", nome: "GERAL" } },
    updatedAt: "2026-10-28T12:00:00Z",
  }));
});

test("estado operacional só aceita perfil atribuído ao colaborador", async () => {
  const db = dbAs("alice");
  const ref = doc(db, "users/alice/operational/currentState");
  await assertSucceeds(setDoc(ref, {
    schemaVersion: 1,
    ownerUid: "alice",
    estado: { id: "state-1", perfil: { id: "P001" } },
    updatedAt: "2026-10-28T12:00:00Z",
  }));
  await assertFails(setDoc(ref, {
    schemaVersion: 1,
    ownerUid: "alice",
    estado: { id: "state-2", perfil: { id: "P002" } },
    updatedAt: "2026-10-28T12:00:00Z",
  }));
  await assertSucceeds(setDoc(ref, {
    schemaVersion: 1,
    ownerUid: "alice",
    estado: null,
    updatedAt: "2026-10-28T12:00:00Z",
  }));
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

test("colaborador pode consultar o próprio índice mesmo antes de sua criação", async () => {
  const db = dbAs("alice");
  const ownMissingIndex = await getDoc(doc(db, "Expediente/alice_2026-11-10"));
  assert.equal(ownMissingIndex.exists(), false);
  await assertFails(getDoc(doc(db, "Expediente/bob_2026-11-10")));
});

test("supervisor consulta índice de outros colaboradores, mas não altera nem conclui por eles", async () => {
  const supervisor = dbAs("supervisor");
  const bobIndex = doc(supervisor, "Expediente/bob_2026-10-28");
  await assertSucceeds(getDoc(bobIndex));
  await assertFails(updateDoc(bobIndex, { status: "concluido" }));
  await assertFails(deleteDoc(bobIndex));
});

test("atendimentos ficam isolados por colaborador e não podem ser alterados ou apagados", async () => {
  const alice = dbAs("alice");
  const own = doc(alice, "users/alice/attendanceRows/ticket-1");
  await assertSucceeds(setDoc(own, {
    ticket: "123", canal: "CHAT", codigo: "", nome: "Cliente",
    tipo: "SUPORTE", resolvido: "SIM", subtipo: "", motivoResolucao: "",
    ownerUid: "alice", createdAt: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(own));
  await assertFails(getDoc(doc(alice, "users/bob/attendanceRows/ticket-2")));
  await assertFails(setDoc(doc(alice, "users/bob/attendanceRows/forjado"), {
    ticket: "999", canal: "CHAT", codigo: "", nome: "Outro",
    tipo: "SUPORTE", resolvido: "SIM", subtipo: "", motivoResolucao: "",
    ownerUid: "alice", createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(own, { nome: "Alterado" }));
  await assertFails(deleteDoc(own));
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

test("supervisor lê expedientes de todos os setores, mas não os altera", async () => {
  const db = dbAs("supervisor");
  await assertSucceeds(getDoc(doc(db, "Expediente/alice_2026-10-28")));
  await assertSucceeds(getDoc(doc(db, "Expediente/bob_2026-10-28")));
  await assertFails(updateDoc(doc(db, "Expediente/alice_2026-10-28"), { status: "alterado" }));
});

test("colaborador não pode alterar o próprio vínculo organizacional ou nível de acesso", async () => {
  const db = dbAs("alice");
  await assertFails(updateDoc(doc(db, "users/alice"), { sectorId: "financeiro" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { contactId: "equipe-b" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { agent: "Identidade alterada" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { isSupervisor: true }));
  await assertFails(updateDoc(doc(db, "users/alice"), { status: "blocked" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { allowedProfileIds: ["ADMIN"] }));
});

test("auditoria administrativa é consultável somente por administrador e imutável", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "adminAudit/audit-test"), {
      actorUid: "admin", action: "TESTE", targetUid: "alice",
      details: {}, createdAt: new Date(),
    });
  });
  await assertSucceeds(getDoc(doc(dbAs("admin"), "adminAudit/audit-test")));
  await assertFails(getDoc(doc(dbAs("supervisor"), "adminAudit/audit-test")));
  await assertFails(getDoc(doc(dbAs("alice"), "adminAudit/audit-test")));
  await assertFails(updateDoc(doc(dbAs("admin"), "adminAudit/audit-test"), { action: "ALTERADO" }));
  await assertFails(deleteDoc(doc(dbAs("admin"), "adminAudit/audit-test")));
});

test("somente gestor pode criar auditoria e colaborador não pode forjar histórico", async () => {
  const audit = {
    actorUid: "alice", actorEmail: "alice@lestetelecom.net.br",
    action: "ORGANIZATIONAL_PROFILE_UPDATED", targetUid: "bob",
    details: {}, createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(dbAs("alice"), "adminAudit/forged-audit"), audit));
  const supervisor = dbAs("supervisor");
  await assertSucceeds(setDoc(doc(supervisor, "adminAudit/supervisor-audit"), {
    ...audit, actorUid: "supervisor",
  }));
  // A supervisor cannot attribute an event to another person.
  await assertFails(setDoc(doc(supervisor, "adminAudit/forged-supervisor-audit"), {
    ...audit, actorUid: "alice",
  }));
  // Nor can a supervisor backdate or forge the server timestamp.
  await assertFails(setDoc(doc(supervisor, "adminAudit/backdated-supervisor-audit"), {
    ...audit, actorUid: "supervisor", createdAt: new Date("2020-01-01T00:00:00Z"),
  }));
});

test("supervisor pode gerenciar colaboradores comuns e catálogos globais", async () => {
  const db = dbAs("supervisor");
  await assertSucceeds(updateDoc(doc(db, "users/alice"), { login: "alice-novo" }));
  await assertSucceeds(setDoc(doc(db, "organizationSectors/novo"), { id: "novo", name: "Novo", active: true }));
  await assertSucceeds(setDoc(doc(db, "organizationContacts/novo"), { id: "novo", name: "Novo", sectorId: "suporte", active: true }));
  await assertSucceeds(setDoc(doc(db, "sharedTaskCatalog/current"), { schemaVersion: 1, perfis: [] }));
});

test("supervisor atribui perfis a colaboradores, e o acesso operacional respeita a atribuição", async () => {
  const supervisor = dbAs("supervisor");
  const bob = dbAs("bob");
  const bobUserRef = doc(supervisor, "users/bob");

  // O colaborador não consegue liberar um perfil para si mesmo.
  await assertFails(updateDoc(doc(bob, "users/bob"), {
    allowedProfileIds: ["P001"],
  }));

  // A supervisão pode atribuir o perfil ao colaborador.
  await assertSucceeds(updateDoc(bobUserRef, {
    allowedProfileIds: ["P001"],
    updatedAt: new Date().toISOString(),
  }));

  // Depois da atribuição, o colaborador consegue iniciar com esse perfil.
  await assertSucceeds(setDoc(doc(bob, "users/bob/operational/currentState"), {
    schemaVersion: 1,
    ownerUid: "bob",
    estado: { id: "state-perfil-atribuido", perfil: { id: "P001" } },
    updatedAt: "2026-10-28T12:00:00Z",
  }));

  // A tentativa de usar um perfil que não foi atribuído continua bloqueada.
  await assertFails(updateDoc(doc(bob, "users/bob/operational/currentState"), {
    estado: { id: "state-perfil-nao-atribuido", perfil: { id: "P002" } },
    updatedAt: "2026-10-28T12:01:00Z",
  }));
});

test("nenhum gestor pode alterar o papel administrativo de uma conta existente", async () => {
  const admin = dbAs("admin");
  const supervisor = dbAs("supervisor");

  await assertFails(updateDoc(doc(admin, "users/alice"), { role: "admin" }));
  await assertFails(updateDoc(doc(admin, "users/admin"), { role: "employee" }));
  await assertFails(updateDoc(doc(supervisor, "users/alice"), { role: "admin" }));
  await assertFails(updateDoc(doc(supervisor, "users/supervisor"), { role: "admin" }));
  await assertFails(updateDoc(doc(supervisor, "users/alice"), { status: "blocked" }));
  await assertFails(updateDoc(doc(supervisor, "users/alice"), { isSupervisor: true }));
});

test("supervisor não pode alterar nem criar administrador", async () => {
  const db = dbAs("supervisor");
  await assertFails(updateDoc(doc(db, "users/admin"), { agent: "Alterado" }));
  await assertFails(setDoc(doc(db, "users/new-admin"), {
    uid: "new-admin", role: "admin", status: "approved",
  }));
});

test("supervisor não pode conceder nem retirar privilégio de supervisão", async () => {
  const db = dbAs("supervisor");
  await assertFails(updateDoc(doc(db, "users/alice"), { isSupervisor: true }));
  await assertFails(updateDoc(doc(db, "users/supervisor"), { isSupervisor: false }));
});

test("supervisor pode aprovar solicitação vinculada em uma única operação, somente como colaborador", async () => {
  const db = dbAs("supervisor");
  await env.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), "users/pending"));
  });
  const batch = writeBatch(db);
  batch.set(doc(db, "users/pending"), { ...profiles.pending, status: "approved" });
  batch.update(doc(db, "accessRequests/pending"), { status: "approved", decidedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
});

test("supervisor não pode aprovar colaborador com privilégio de supervisão", async () => {
  const db = dbAs("supervisor");
  await env.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), "users/pending"));
  });
  const batch = writeBatch(db);
  batch.set(doc(db, "users/pending"), { ...profiles.pending, status: "approved", isSupervisor: true });
  batch.update(doc(db, "accessRequests/pending"), { status: "approved", decidedAt: serverTimestamp() });
  await assertFails(batch.commit());
});

test("supervisor não pode criar colaborador sem solicitação vinculada", async () => {
  const db = dbAs("supervisor");
  await assertFails(setDoc(doc(db, "users/unrequested"), {
    uid: "unrequested", email: "unrequested@lestetelecom.net.br",
    role: "employee", status: "approved", isSupervisor: false,
  }));
});

test("supervisor não pode alterar o status administrativo de colaborador existente", async () => {
  const db = dbAs("supervisor");
  await assertFails(updateDoc(doc(db, "users/alice"), { status: "blocked" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { role: "admin" }));
});

test("supervisor não pode excluir solicitações de acesso", async () => {
  await assertFails(deleteDoc(doc(dbAs("supervisor"), "accessRequests/pending")));
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


test("notificações de promoção exigem vínculo atômico com campanha e impedem duplicidade", async () => {
  const supervisor = dbAs("supervisor");
  const notification = {
    category: "promocoes", message: "Promoção - Campanha de teste - Em Andamento",
    target: "promocoes", referenceId: "promo-1",
    createdByUid: "supervisor", createdAt: serverTimestamp(),
  };
  const batch = writeBatch(supervisor);
  batch.set(doc(supervisor, "sharedPromotions/promo-1"), {
    id: "promo-1", name: "Campanha de teste", category: "Teste", benefit: "Benefício",
    eligible: "Todos", conditions: "Condições", startDate: "", endDate: "",
    status: "active", createdByUid: "supervisor", createdByName: "Supervisor",
    createdAt: serverTimestamp(), updatedByUid: "supervisor", updatedByName: "Supervisor",
    updatedAt: serverTimestamp(), lastNotificationId: "promo-1",
    ownerSectorId: "suporte", ownerContactId: "equipe-a",
  });
  batch.set(doc(supervisor, "sharedNotifications/promo-1"), notification);
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(dbAs("alice"), "sharedNotifications/promo-1")));
  await assertFails(setDoc(doc(supervisor, "sharedNotifications/promo-duplicate"), notification));
  await assertFails(setDoc(doc(dbAs("alice"), "sharedNotifications/forbidden"), {
    ...notification, referenceId: "campanha-inexistente", createdByUid: "alice",
  }));
  await assertFails(updateDoc(doc(supervisor, "sharedNotifications/promo-1"), { message: "Alterada" }));
  await assertFails(deleteDoc(doc(supervisor, "sharedNotifications/promo-1")));
  await assertFails(updateDoc(doc(supervisor, "sharedPromotions/promo-1"), {
    lastNotificationId: "notificacao-sem-lote", updatedByUid: "supervisor",
    updatedByName: "Supervisor", updatedAt: serverTimestamp(),
  }));
});

test("permissão de publicação de inadimplência é gerenciada por supervisão e administração", async () => {
  const permission = {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: [],
    contactIds: ["equipe-a"], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  };
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/delinquency"), permission));
  await assertSucceeds(getDoc(doc(dbAs("alice"), "featurePermissions/delinquency")));
  await assertFails(setDoc(doc(dbAs("alice"), "featurePermissions/delinquency"), {
    ...permission, updatedByUid: "alice",
  }));
});


test("manutenção exige gravação atômica do histórico imutável e do aviso", async () => {
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/maintenance"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));

  const db = dbAs("alice");
  const batch = writeBatch(db);
  const maintenance = doc(db, "externalMaintenances/maintenance-1");
  const history = doc(db, "externalMaintenances/maintenance-1/history/history-1");
  const notification = doc(db, "sharedNotifications/maintenance-notice-1");
  const details = {
    title: "Manutenção de rede",
    date: "2026-11-04",
    location: "Centro",
    description: "Reparo preventivo",
    status: "ongoing",
  };
  batch.set(maintenance, {
    ...details, createdByUid: "alice", createdAt: serverTimestamp(), createdByName: "Alice",
    ownerSectorId: "suporte", ownerContactId: "equipe-a",
    updatedByUid: "alice", updatedAt: serverTimestamp(), updatedByName: "Alice",
    lastHistoryId: "history-1", lastNotificationId: "maintenance-notice-1",
  });
  batch.set(history, {
    maintenanceId: "maintenance-1", changedByUid: "alice", changedByName: "Alice",
    changedAt: serverTimestamp(), before: null, after: details,
  });
  batch.set(notification, {
    category: "manutencoes", message: "Manutenção - Manutenção de rede - Em Andamento",
    target: "manutencoes", maintenanceId: "maintenance-1", createdByUid: "alice", createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());

  await assertSucceeds(getDoc(maintenance));
  await assertSucceeds(getDoc(history));
  await assertSucceeds(getDoc(notification));

  // A publisher cannot create a standalone notification for an existing
  // maintenance record: it must be the exact notification linked atomically
  // to an authorized update of that record.
  await assertFails(setDoc(doc(db, "sharedNotifications/maintenance-spoof"), {
    category: "manutencoes", message: "Aviso falsificado",
    target: "manutencoes", maintenanceId: "maintenance-1",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "externalMaintenances/maintenance-financeiro"), {
      title: "Manutenção financeira", date: "2026-11-04", location: "Centro",
      description: "Registro de outro escopo", status: "ongoing",
      createdByUid: "bob", createdAt: new Date(), createdByName: "Bob",
      ownerSectorId: "financeiro", ownerContactId: "equipe-b",
      updatedByUid: "bob", updatedAt: new Date(), updatedByName: "Bob",
      lastHistoryId: "history-financeiro", lastNotificationId: "notice-financeiro",
    });
  });
  await assertFails(setDoc(doc(db, "sharedNotifications/maintenance-out-of-scope"), {
    category: "manutencoes", message: "Aviso fora do escopo",
    target: "manutencoes", maintenanceId: "maintenance-financeiro",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(dbAs("supervisor"), "sharedNotifications/orphan-maintenance"), {
    category: "manutencoes", message: "Manutenção de rede",
    target: "manutencoes", maintenanceId: "missing-maintenance",
    createdByUid: "supervisor", createdAt: serverTimestamp(),
  }));

  const updatedDetails = { ...details, title: "Manutenção de rede atualizada", status: "completed" };
  const updateBatch = writeBatch(db);
  const history2 = doc(db, "externalMaintenances/maintenance-1/history/history-2");
  const notification2 = doc(db, "sharedNotifications/maintenance-notice-2");
  updateBatch.update(maintenance, {
    ...updatedDetails, updatedByUid: "alice", updatedAt: serverTimestamp(), updatedByName: "Alice",
    lastHistoryId: "history-2", lastNotificationId: "maintenance-notice-2",
  });
  updateBatch.set(history2, {
    maintenanceId: "maintenance-1", changedByUid: "alice", changedByName: "Alice",
    changedAt: serverTimestamp(), before: details, after: updatedDetails,
  });
  updateBatch.set(notification2, {
    category: "manutencoes", message: "Manutenção - Manutenção de rede atualizada - Concluído",
    target: "manutencoes", maintenanceId: "maintenance-1", createdByUid: "alice", createdAt: serverTimestamp(),
  });
  await assertSucceeds(updateBatch.commit());

  await assertFails(updateDoc(maintenance, { title: "Edição sem histórico" }));
  await assertFails(updateDoc(history, { after: { ...details, title: "Alterado" } }));
  await assertFails(deleteDoc(history));
  await assertFails(deleteDoc(maintenance));
});

test("permissão de manutenção respeita contato e agente individual", async () => {
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/maintenance"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte", "financeiro"],
    wholeSectorIds: [], contactIds: ["equipe-a"], agentIds: ["bob"],
    updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/charlie"), {
      uid: "charlie", email: "charlie@lestetelecom.net.br", login: "charlie",
      agent: "Charlie", sectorId: "financeiro", contactId: "equipe-b",
      role: "employee", status: "approved", isSupervisor: false,
    });
  });

  async function createMaintenance(uid, id, agent, ownerScope = {}) {
    const db = dbAs(uid);
    const batch = writeBatch(db);
    const maintenance = doc(db, "externalMaintenances/" + id);
    const history = doc(db, "externalMaintenances/" + id + "/history/history-" + id);
    const notification = doc(db, "sharedNotifications/notice-" + id);
    const details = { title: "Manutenção " + id, date: "2026-11-04", location: "Centro", description: "Teste", status: "ongoing" };
    batch.set(maintenance, {
      ...details, createdByUid: uid, createdAt: serverTimestamp(), createdByName: agent,
      ownerSectorId: ownerScope.ownerSectorId ?? (uid === "alice" ? "suporte" : "financeiro"),
      ownerContactId: ownerScope.ownerContactId ?? (uid === "alice" ? "equipe-a" : "equipe-b"),
      updatedByUid: uid, updatedAt: serverTimestamp(), updatedByName: agent,
      lastHistoryId: "history-" + id, lastNotificationId: "notice-" + id,
    });
    batch.set(history, {
      maintenanceId: id, changedByUid: uid, changedByName: agent,
      changedAt: serverTimestamp(), before: null, after: details,
    });
    batch.set(notification, {
      category: "manutencoes", message: `Manutenção - ${details.title} - Em Andamento`,
      target: "manutencoes", maintenanceId: id, createdByUid: uid, createdAt: serverTimestamp(),
    });
    return batch.commit();
  }

  await assertSucceeds(createMaintenance("alice", "maintenance-contact", "Alice"));
  await assertFails(createMaintenance("alice", "maintenance-forged-scope", "Alice", { ownerSectorId: "financeiro" }));
  await assertSucceeds(createMaintenance("bob", "maintenance-agent", "Bob"));
  await assertFails(createMaintenance("charlie", "maintenance-denied", "Charlie"));
});

test("colaborador sem autorização não pode cadastrar manutenção externa", async () => {
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/maintenance"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  const db = dbAs("bob");
  const batch = writeBatch(db);
  const maintenance = doc(db, "externalMaintenances/maintenance-bob");
  const history = doc(db, "externalMaintenances/maintenance-bob/history/history-bob");
  const notification = doc(db, "sharedNotifications/maintenance-notice-bob");
  const details = { title: "Manutenção", date: "2026-11-04", location: "Centro", description: "Teste", status: "ongoing" };
  batch.set(maintenance, {
    ...details, createdByUid: "bob", createdAt: serverTimestamp(),
    updatedByUid: "bob", updatedAt: serverTimestamp(),
    lastHistoryId: "history-bob", lastNotificationId: "maintenance-notice-bob",
  });
  batch.set(history, {
    maintenanceId: "maintenance-bob", changedByUid: "bob", changedByName: "Bob",
    changedAt: serverTimestamp(), before: null, after: details,
  });
  batch.set(notification, {
    category: "manutencoes", message: "Manutenção - Manutenção - Em Andamento",
    target: "manutencoes", createdByUid: "bob", createdAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
});

test("preferências de notificações são privadas por usuário", async () => {
  const own = doc(dbAs("alice"), "users/alice/preferences/notifications");
  await assertSucceeds(setDoc(own, { schemaVersion: 1, categories: { cobranca: false, promocoes: true, manutencoes: true } }));
  await assertSucceeds(getDoc(own));
  await assertFails(getDoc(doc(dbAs("bob"), "users/alice/preferences/notifications")));
  await assertFails(setDoc(doc(dbAs("alice"), "users/bob/preferences/notifications"), {
    schemaVersion: 1, categories: { cobranca: false },
  }));
});


test("somente setor ou contato liberado pode publicar aviso de inadimplência com notificação vinculada", async () => {
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/delinquency"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));

  const createNoticeBatch = (uid, noticeId, ownerScope = {}) => {
    const db = dbAs(uid);
    const batch = writeBatch(db);
    const noticeRef = doc(db, "delinquencyNotices", noticeId);
    const notificationRef = doc(db, "sharedNotifications", `cobranca-${uid}`);
    const timestamp = serverTimestamp();
    batch.set(noticeRef, {
      type: "reducao", date: "2026-11-04", title: "Aviso de redução",
      dueDate: "2026-10-20", customerCount: 12, overdueDays: 15,
      validUntil: "2026-11-10", status: "ongoing",
      notificationId: notificationRef.id,
      ownerSectorId: ownerScope.ownerSectorId ?? (uid === "alice" ? "suporte" : "financeiro"),
      ownerContactId: ownerScope.ownerContactId ?? (uid === "alice" ? "equipe-a" : "equipe-b"),
      createdByUid: uid, createdAt: timestamp,
      updatedByUid: uid, updatedAt: timestamp,
    });
    batch.set(notificationRef, {
      category: "cobranca", message: "Inadimplência - Aviso de redução",
      target: "inadimplencia", noticeId,
      createdByUid: uid, createdAt: timestamp,
    });
    return batch.commit();
  };

  await assertSucceeds(createNoticeBatch("alice", "aviso-alice"));
  await assertFails(createNoticeBatch("alice", "aviso-alice-escopo-falso", { ownerSectorId: "financeiro" }));
  await assertFails(createNoticeBatch("bob", "aviso-bob"));

  const alice = dbAs("alice");
  const notification = {
    category: "cobranca", message: "Inadimplência - Aviso de redução",
    target: "inadimplencia", noticeId: "aviso-alice",
    createdByUid: "alice", createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(alice, "sharedNotifications/aviso-duplicado"), notification));
  await assertFails(setDoc(doc(alice, "sharedNotifications/aviso-adulterado"), {
    ...notification, message: "Inadimplência - Título falsificado",
  }));
  await assertFails(setDoc(doc(alice, "sharedNotifications/aviso-extra"), {
    ...notification, campoExtra: "não permitido",
  }));

  const batch = writeBatch(alice);
  const newNoticeId = "aviso-titulo-incorreto";
  batch.set(doc(alice, "delinquencyNotices", newNoticeId), {
    type: "reducao", date: "2026-11-04", title: "Título verdadeiro",
    dueDate: "2026-10-20", customerCount: 12, overdueDays: 15,
    validUntil: "2026-11-10", status: "ongoing",
    notificationId: "aviso-mensagem-incorreta",
    createdByUid: "alice", createdAt: serverTimestamp(),
    updatedByUid: "alice", updatedAt: serverTimestamp(),
  });
  batch.set(doc(alice, "sharedNotifications/aviso-mensagem-incorreta"), {
    category: "cobranca", message: "Inadimplência - Outro título",
    target: "inadimplencia", noticeId: newNoticeId,
    createdByUid: "alice", createdAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
});

test("escopo registrado permanece estável quando o autor muda de setor", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "featurePermissions/promotions"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "sharedPromotions/promo-snapshot"), {
      id: "promo-snapshot", name: "Campanha com escopo fixo", category: "Teste",
      benefit: "Benefício", eligible: "Todos", conditions: "Condições",
      startDate: "", endDate: "", status: "active",
      createdByUid: "charlie", createdByName: "Charlie", createdAt: new Date(),
      updatedByUid: "charlie", updatedByName: "Charlie", updatedAt: new Date(),
      ownerSectorId: "suporte", ownerContactId: "equipe-a",
    });
    await setDoc(doc(db, "users/charlie"), {
      uid: "charlie", email: "charlie@lestetelecom.net.br", login: "charlie",
      agent: "Charlie", sectorId: "financeiro", contactId: "equipe-b",
      role: "employee", status: "approved", isSupervisor: false,
    });
  });
  await assertSucceeds(updateDoc(doc(dbAs("alice"), "sharedPromotions/promo-snapshot"), {
    benefit: "Atualizada pelo escopo original", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
});

test("edição de promoções e inadimplência respeita o escopo do autor do registro", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/charlie"), {
      uid: "charlie", email: "charlie@lestetelecom.net.br", login: "charlie",
      agent: "Charlie", sectorId: "suporte", contactId: "equipe-b",
      role: "employee", status: "approved", isSupervisor: false,
    });
    await setDoc(doc(db, "sharedPromotions/promo-charlie"), {
      id: "promo-charlie", name: "Campanha Charlie", category: "Teste",
      benefit: "Benefício", eligible: "Todos", conditions: "Condições",
      startDate: "", endDate: "", status: "active",
      createdByUid: "charlie", createdByName: "Charlie", createdAt: new Date(),
      updatedByUid: "charlie", updatedByName: "Charlie", updatedAt: new Date(),
      ownerSectorId: "suporte", ownerContactId: "equipe-b",
    });
    await setDoc(doc(db, "sharedPromotions/promo-bob"), {
      id: "promo-bob", name: "Campanha Bob", category: "Teste",
      benefit: "Benefício", eligible: "Todos", conditions: "Condições",
      startDate: "", endDate: "", status: "active",
      createdByUid: "bob", createdByName: "Bob", createdAt: new Date(),
      updatedByUid: "bob", updatedByName: "Bob", updatedAt: new Date(),
    });
    for (const [id, ownerUid] of [["aviso-charlie", "charlie"], ["aviso-bob", "bob"]]) {
      await setDoc(doc(db, "delinquencyNotices", id), {
        type: "reducao", date: "2026-11-04", title: "Aviso " + ownerUid,
        dueDate: "2026-10-20", customerCount: 12, overdueDays: 15,
        validUntil: "2026-11-10", status: "ongoing",
        notificationId: "notification-" + id,
        createdByUid: ownerUid, createdAt: new Date(),
        updatedByUid: ownerUid, updatedAt: new Date(),
        ...(ownerUid === "charlie" ? { ownerSectorId: "suporte", ownerContactId: "equipe-b" } : {}),
      });
    }
  });

  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/promotions"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "featurePermissions/delinquency"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));

  const alice = dbAs("alice");
  await assertSucceeds(updateDoc(doc(alice, "sharedPromotions/promo-charlie"), {
    benefit: "Benefício atualizado", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(alice, "sharedPromotions/promo-bob"), {
    benefit: "Tentativa fora do setor", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(alice, "delinquencyNotices/aviso-charlie"), {
    status: "completed", updatedByUid: "alice", updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(alice, "delinquencyNotices/aviso-bob"), {
    status: "completed", updatedByUid: "alice", updatedAt: serverTimestamp(),
  }));

  // A conta do criador pode ser bloqueada sem tornar publicações de escopo
  // imutável impossíveis de administrar por outro publicador autorizado.
  await assertSucceeds(updateDoc(doc(dbAs("admin"), "users/charlie"), { status: "blocked" }));
  await assertSucceeds(updateDoc(doc(alice, "sharedPromotions/promo-charlie"), {
    benefit: "Editada após bloqueio do criador", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(alice, "delinquencyNotices/aviso-charlie"), {
    status: "completed", updatedByUid: "alice", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(alice, "sharedAttachments/anexo-criador-bloqueado"), {
    targetType: "promotion", targetId: "promo-charlie", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));
});

test("anexos de tarefas são liberados à supervisão e os demais respeitam escopo de publicação", async () => {
  const admin = dbAs("admin");
  for (const targetType of ["task-creation", "task-roteiro", "maintenance", "promotion", "delinquency"]) {
    await assertSucceeds(setDoc(doc(admin, "sharedAttachments", `admin-${targetType}`), {
      targetType, targetId: "registro-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "admin", createdAt: serverTimestamp(),
    }));
  }

  const supervisor = dbAs("supervisor");
  for (const targetType of ["task-creation", "task-roteiro"]) {
    await assertSucceeds(setDoc(doc(supervisor, "sharedAttachments", `supervisor-${targetType}`), {
      targetType, targetId: "tarefa-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "supervisor", createdAt: serverTimestamp(),
    }));
  }
  for (const targetType of ["maintenance", "promotion", "delinquency"]) {
    await assertFails(setDoc(doc(supervisor, "sharedAttachments", `supervisor-sem-escopo-${targetType}`), {
      targetType, targetId: "registro-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "supervisor", createdAt: serverTimestamp(),
    }));
  }

  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/promotions"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await assertSucceeds(setDoc(doc(supervisor, "sharedAttachments/supervisor-promocao-autorizada"), {
    targetType: "promotion", targetId: "rascunho-promocao", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "supervisor", createdAt: serverTimestamp(),
  }));
});

test("anexos rejeitam campos extras, destinos inválidos e payloads acima do limite", async () => {
  const supervisor = dbAs("supervisor");
  const base = {
    targetType: "task-creation", targetId: "registro-1", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "supervisor", createdAt: serverTimestamp(),
  };

  await assertFails(setDoc(doc(supervisor, "sharedAttachments/campo-extra"), {
    ...base, permissaoElevada: true,
  }));
  await assertFails(setDoc(doc(supervisor, "sharedAttachments/destino-invalido"), {
    ...base, targetType: "admin-settings",
  }));
  await assertFails(setDoc(doc(supervisor, "sharedAttachments/arquivo-grande"), {
    ...base, size: 512001,
  }));
  await assertFails(setDoc(doc(supervisor, "sharedAttachments/conteudo-grande"), {
    ...base, data: "x".repeat(700001),
  }));
  await assertFails(setDoc(doc(supervisor, "sharedAttachments/autor-falso"), {
    ...base, createdByUid: "alice",
  }));
  await assertFails(setDoc(doc(supervisor, "sharedAttachments/nome-grande"), {
    ...base, name: "x".repeat(181),
  }));
});

test("anexos de promoções respeitam o escopo do registro", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "featurePermissions/promotions"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "sharedPromotions/promo-suporte"), {
      id: "promo-suporte", name: "Promoção", status: "active",
      createdByUid: "bob", ownerSectorId: "suporte", ownerContactId: "equipe-a",
    });
    await setDoc(doc(db, "sharedPromotions/promo-financeiro"), {
      id: "promo-financeiro", name: "Promoção", status: "active",
      createdByUid: "bob", ownerSectorId: "financeiro", ownerContactId: "equipe-b",
    });
  });
  const alice = dbAs("alice");
  const attachment = (id, targetId) => setDoc(doc(alice, `sharedAttachments/${id}`), {
    targetType: "promotion", targetId, name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  });
  await assertSucceeds(attachment("promo-dentro-escopo", "promo-suporte"));
  await assertFails(attachment("promo-fora-escopo", "promo-financeiro"));
  await assertSucceeds(deleteDoc(doc(alice, "sharedAttachments/promo-dentro-escopo")));
});

test("autor pode remover apenas os próprios anexos órfãos de rascunhos autorizados", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "featurePermissions/maintenance"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "featurePermissions/promotions"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "featurePermissions/delinquency"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "sharedAttachments/orfao-de-outro-autor"), {
      targetType: "promotion", targetId: "rascunho-alice", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "bob", createdAt: new Date(),
    });
    await setDoc(doc(db, "sharedPromotions/promo-fora-do-escopo"), {
      id: "promo-fora-do-escopo", name: "Campanha", status: "active",
      createdByUid: "bob", ownerSectorId: "financeiro", ownerContactId: "equipe-b",
    });
    await setDoc(doc(db, "sharedAttachments/anexo-fora-do-escopo"), {
      targetType: "promotion", targetId: "promo-fora-do-escopo", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "bob", createdAt: new Date(),
    });
  });
  const alice = dbAs("alice");
  for (const targetType of ["maintenance", "promotion", "delinquency"]) {
    const attachmentId = `orfao-${targetType}`;
    await assertSucceeds(setDoc(doc(alice, `sharedAttachments/${attachmentId}`), {
      targetType, targetId: `rascunho-${targetType}-alice`, name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "alice", createdAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(doc(alice, `sharedAttachments/${attachmentId}`)));
  }
  await assertFails(deleteDoc(doc(alice, "sharedAttachments/orfao-de-outro-autor")));
  await assertFails(deleteDoc(doc(alice, "sharedAttachments/anexo-fora-do-escopo")));
});
test("anexos de manutenção e inadimplência respeitam as permissões específicas de publicação", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "featurePermissions/maintenance"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
    await setDoc(doc(db, "featurePermissions/delinquency"), {
      enabled: true, wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    });
  });
  const alice = dbAs("alice");
  for (const targetType of ["maintenance", "delinquency"]) {
    await assertSucceeds(setDoc(doc(alice, `sharedAttachments/alice-${targetType}`), {
      targetType, targetId: "registro-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "alice", createdAt: serverTimestamp(),
    }));
  }
  await assertFails(setDoc(doc(alice, "sharedAttachments/alice-promotion"), {
    targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));
});

test("colaborador aprovado pode visualizar anexos, mas não anexar ou remover", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "sharedAttachments/existing"), {
      targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "admin", createdAt: new Date(),
    });
  });
  const alice = dbAs("alice");
  await assertSucceeds(getDoc(doc(alice, "sharedAttachments/existing")));
  await assertFails(setDoc(doc(alice, "sharedAttachments/new"), {
    targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(doc(alice, "sharedAttachments/existing")));
});

test("configurações administrativas são exclusivas de administradores e catálogos operacionais ficam com gestores", async () => {
  await assertSucceeds(setDoc(doc(dbAs("admin"), "settings/allowedDomains"), {
    domains: ["lestetelecom.net.br"],
  }));
  await assertFails(setDoc(doc(dbAs("supervisor"), "settings/allowedDomains"), {
    domains: ["dominio-nao-autorizado.com"],
  }));
  await assertFails(setDoc(doc(dbAs("alice"), "settings/allowedDomains"), {
    domains: ["dominio-nao-autorizado.com"],
  }));

  await assertSucceeds(setDoc(doc(dbAs("supervisor"), "settings/attendanceMotives"), {
    schemaVersion: 1, items: ["Resolvido", "Retido"],
    updatedByUid: "supervisor", updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(dbAs("alice"), "settings/attendanceMotives"), {
    schemaVersion: 1, items: ["Motivo indevido"],
    updatedByUid: "alice", updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(dbAs("alice"), "organizationSectors/novo-setor"), {
    id: "novo-setor", name: "Novo setor", active: true,
  }));
  await assertFails(setDoc(doc(dbAs("alice"), "sharedTaskCatalog/current"), {
    schemaVersion: 1, perfis: [],
  }));
});


test("edição de publicações de terceiros respeita permissões por contato e agente", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, contactId] of [["charlie", "equipe-b"], ["dana", "equipe-b"]]) {
      await setDoc(doc(db, "users", uid), {
        uid, email: `${uid}@lestetelecom.net.br`, login: uid,
        agent: uid === "charlie" ? "Charlie" : "Dana",
        sectorId: "financeiro", contactId,
        role: "employee", status: "approved", isSupervisor: false,
      });
    }
    const promotion = (id, ownerUid, ownerContactId) => ({
      id, name: "Campanha " + id, category: "Teste", benefit: "Benefício",
      eligible: "Todos", conditions: "Condições", startDate: "", endDate: "",
      status: "active", createdByUid: ownerUid, createdByName: ownerUid,
      createdAt: new Date(), updatedByUid: ownerUid, updatedByName: ownerUid,
      updatedAt: new Date(), ownerSectorId: "financeiro", ownerContactId,
    });
    await setDoc(doc(db, "sharedPromotions/promo-contato"), promotion("promo-contato", "charlie", "equipe-a"));
    await setDoc(doc(db, "sharedPromotions/promo-agente"), promotion("promo-agente", "charlie", "equipe-b"));
    await setDoc(doc(db, "sharedPromotions/promo-outro-agente"), promotion("promo-outro-agente", "dana", "equipe-b"));
  });

  const supervisor = dbAs("supervisor");
  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/promotions"), {
    schemaVersion: 1, enabled: true, sectorIds: [], wholeSectorIds: [],
    contactIds: ["equipe-a"], agentIds: [],
    updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));

  const alice = dbAs("alice");
  await assertSucceeds(updateDoc(doc(alice, "sharedPromotions/promo-contato"), {
    benefit: "Editada pelo contato autorizado", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(alice, "sharedPromotions/promo-agente"), {
    benefit: "Tentativa sem autorização", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/promotions"), {
    schemaVersion: 1, enabled: true, sectorIds: [], wholeSectorIds: [],
    contactIds: [], agentIds: ["charlie"],
    updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await assertSucceeds(updateDoc(doc(alice, "sharedPromotions/promo-agente"), {
    benefit: "Editada pelo agente autorizado", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(alice, "sharedPromotions/promo-outro-agente"), {
    benefit: "Tentativa fora do agente autorizado", updatedByUid: "alice",
    updatedByName: "Alice", updatedAt: serverTimestamp(),
  }));
});


test("revogação de permissão impede editar publicações e anexos imediatamente", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "sharedPromotions/promo-revogacao"), {
      id: "promo-revogacao", name: "Campanha de teste", category: "Teste",
      benefit: "Benefício", eligible: "Todos", conditions: "Condições",
      startDate: "", endDate: "", status: "active",
      createdByUid: "bob", createdByName: "Bob", createdAt: new Date(),
      updatedByUid: "bob", updatedByName: "Bob", updatedAt: new Date(),
      ownerSectorId: "suporte", ownerContactId: "equipe-a",
    });
  });

  const supervisor = dbAs("supervisor");
  const alice = dbAs("alice");
  const permissionRef = doc(supervisor, "featurePermissions/promotions");
  const permission = (enabled) => ({
    schemaVersion: 1, enabled, sectorIds: [],
    wholeSectorIds: ["suporte"], contactIds: [], agentIds: [],
    updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  });
  const edit = (benefit) => updateDoc(doc(alice, "sharedPromotions/promo-revogacao"), {
    benefit, updatedByUid: "alice", updatedByName: "Alice",
    updatedAt: serverTimestamp(),
  });
  const attachment = (id) => setDoc(doc(alice, `sharedAttachments/${id}`), {
    targetType: "promotion", targetId: "promo-revogacao",
    name: "arquivo.pdf", mimeType: "application/pdf", size: 4,
    data: "JVBERg==", createdByUid: "alice", createdAt: serverTimestamp(),
  });

  await assertSucceeds(setDoc(permissionRef, permission(true)));
  await assertSucceeds(edit("Edição antes da revogação"));
  await assertSucceeds(attachment("anexo-antes-revogacao"));

  await assertSucceeds(setDoc(permissionRef, permission(false)));
  await assertFails(edit("Tentativa após revogação"));
  await assertFails(attachment("anexo-depois-revogacao"));
  await assertFails(deleteDoc(doc(alice, "sharedAttachments/anexo-antes-revogacao")));

  // A revogação não impede a leitura compartilhada de documentos já publicados.
  await assertSucceeds(getDoc(doc(alice, "sharedPromotions/promo-revogacao")));
  await assertSucceeds(getDoc(doc(alice, "sharedAttachments/anexo-antes-revogacao")));
});


test("usuários pendentes e bloqueados não acessam dados operacionais nem anexos compartilhados", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/blocked"), {
      uid: "blocked", email: "blocked@lestetelecom.net.br", login: "blocked",
      agent: "Bloqueado", sectorId: "suporte", contactId: "equipe-a",
      role: "employee", status: "blocked", isSupervisor: false,
    });
    await setDoc(doc(db, "sharedAttachments/arquivo-publicado"), {
      targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "admin", createdAt: new Date(),
    });
  });

  for (const uid of ["pending", "blocked"]) {
    const db = dbAs(uid);
    await assertFails(getDoc(doc(db, "Expediente/alice_2026-10-28")));
    await assertFails(getDoc(doc(db, "sharedAttachments/arquivo-publicado")));
    await assertFails(getDoc(doc(db, "users/alice/operational/currentState")));
    await assertFails(setDoc(doc(db, "sharedAttachments/tentativa-" + uid), {
      targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: uid, createdAt: serverTimestamp(),
    }));
  }
});

test("supervisor não pode modificar dados privados nem histórico operacional de terceiros", async () => {
  const supervisor = dbAs("supervisor");
  await assertFails(setDoc(doc(supervisor, "users/alice/configuration/layout"), {
    schemaVersion: 1, blocos: [],
  }));
  await assertFails(setDoc(doc(supervisor, "users/alice/preferences/appearance"), {
    theme: "corporate-dark",
  }));
  await assertFails(setDoc(doc(supervisor, "users/alice/operational/currentState"), {
    schemaVersion: 1, ownerUid: "alice", estado: null,
  }));
  await assertFails(deleteDoc(doc(supervisor, "Expediente/alice_2026-10-28")));
});


test("somente administrador pode bloquear ou reativar contas", async () => {
  const admin = dbAs("admin");
  const supervisor = dbAs("supervisor");

  await assertFails(updateDoc(doc(supervisor, "users/alice"), { status: "blocked" }));
  await assertSucceeds(updateDoc(doc(admin, "users/alice"), { status: "blocked" }));
  // The reactivation attempt is tested against a genuinely blocked account,
  // not an unchanged "approved" value (which Firestore treats as a no-op).
  await assertFails(updateDoc(doc(supervisor, "users/alice"), { status: "approved" }));
  await assertSucceeds(updateDoc(doc(admin, "users/alice"), { status: "approved" }));

  // A supervisor may decide a pending request, but cannot mark it as blocked.
  await assertFails(updateDoc(doc(supervisor, "accessRequests/pending"), { status: "blocked" }));
  await assertSucceeds(updateDoc(doc(supervisor, "accessRequests/pending"), { status: "approved" }));
  await assertSucceeds(updateDoc(doc(admin, "accessRequests/pending"), { status: "blocked" }));
});

test("administrador pode atualizar status de conta histórica sem vínculo organizacional ativo", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/legacy-user"), {
      uid: "legacy-user", email: "legacy@lestetelecom.net.br",
      role: "employee", status: "blocked", isSupervisor: false,
    });
  });
  await assertSucceeds(updateDoc(doc(dbAs("admin"), "users/legacy-user"), {
    status: "approved",
  }));
});

test("bloqueio administrativo revoga imediatamente o acesso da sessão ativa", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "sharedAttachments/anexo-sessao-ativa"), {
      targetType: "promotion", targetId: "promo-1", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "admin", createdAt: new Date(),
    });
  });

  const admin = dbAs("admin");
  const alice = dbAs("alice");

  // A conta aprovada consegue consultar os próprios dados e anexos compartilhados.
  await assertSucceeds(getDoc(doc(alice, "users/alice/operational/currentState")));
  await assertSucceeds(getDoc(doc(alice, "sharedAttachments/anexo-sessao-ativa")));

  // O administrador bloqueia a conta sem encerrar artificialmente o token de autenticação.
  await assertSucceeds(updateDoc(doc(admin, "users/alice"), { status: "blocked" }));

  // A mesma sessão autenticada perde imediatamente as permissões baseadas em approvedUser().
  await assertFails(getDoc(doc(alice, "users/alice/operational/currentState")));
  await assertFails(getDoc(doc(alice, "sharedAttachments/anexo-sessao-ativa")));
  await assertFails(updateDoc(doc(alice, "users/alice"), { status: "approved" }));
});

test("alteração administrativa e auditoria são atômicas no mesmo lote", async () => {
  const supervisor = dbAs("supervisor");
  const userRef = doc(supervisor, "users/alice");
  const validBatch = writeBatch(supervisor);
  validBatch.update(userRef, { login: "alice-atualizada" });
  validBatch.set(doc(supervisor, "adminAudit/edicao-alice"), {
    actorUid: "supervisor", actorEmail: "supervisor@lestetelecom.net.br",
    action: "ORGANIZATIONAL_PROFILE_UPDATED", targetUid: "alice",
    details: {}, createdAt: serverTimestamp(),
  });
  await assertSucceeds(validBatch.commit());

  const afterValid = await getDoc(userRef);
  assert.equal(afterValid.data().login, "alice-atualizada");

  const invalidBatch = writeBatch(supervisor);
  invalidBatch.update(userRef, { login: "alteracao-sem-auditoria" });
  invalidBatch.set(doc(supervisor, "adminAudit/auditoria-invalida"), {
    actorUid: "outro-usuario", actorEmail: "outro@lestetelecom.net.br",
    action: "ORGANIZATIONAL_PROFILE_UPDATED", targetUid: "alice",
    details: {}, createdAt: serverTimestamp(),
  });
  await assertFails(invalidBatch.commit());

  const afterRejected = await getDoc(userRef);
  assert.equal(afterRejected.data().login, "alice-atualizada");
  await assertFails(getDoc(doc(supervisor, "adminAudit/auditoria-invalida")));
});

test("setores e contatos são desativados sem exclusão e novos vínculos exigem cadastros ativos", async () => {
  const supervisor = dbAs("supervisor");
  const sectorRef = doc(supervisor, "organizationSectors/suporte");
  const contactRef = doc(supervisor, "organizationContacts/equipe-a");

  await assertFails(deleteDoc(sectorRef));
  await assertFails(deleteDoc(contactRef));
  await assertSucceeds(updateDoc(sectorRef, { active: false }));
  await assertSucceeds(updateDoc(contactRef, { active: false }));

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "organizationSectors/inativo"), {
      id: "inativo", name: "Setor inativo", active: false,
    });
    await setDoc(doc(db, "organizationContacts/contato-inativo"), {
      id: "contato-inativo", name: "Contato inativo",
      sectorId: "inativo", active: false,
    });
  });

  await assertFails(updateDoc(doc(supervisor, "users/alice"), {
    sectorId: "inativo", contactId: "contato-inativo",
  }));
  await assertFails(setDoc(doc(dbAs("admin"), "users/novo-colaborador"), {
    uid: "novo-colaborador", email: "novo@lestetelecom.net.br",
    login: "novo", agent: "Novo", sectorId: "inativo",
    contactId: "contato-inativo", isSupervisor: false,
    status: "approved", role: "employee",
  }));
  await assertSucceeds(updateDoc(doc(supervisor, "users/alice"), {
    sectorId: "financeiro", contactId: "equipe-b",
  }));
});

test("contato não pode ser ativado enquanto seu setor estiver inativo", async () => {
  const supervisor = dbAs("supervisor");
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, "organizationSectors/suporte"), { active: false });
    await updateDoc(doc(db, "organizationContacts/equipe-a"), { active: false });
  });

  await assertFails(updateDoc(doc(supervisor, "organizationContacts/equipe-a"), {
    active: true,
  }));
  await assertFails(setDoc(doc(supervisor, "organizationContacts/novo-contato"), {
    id: "novo-contato", name: "Contato inválido",
    sectorId: "suporte", active: true,
  }));
  await assertSucceeds(updateDoc(doc(supervisor, "organizationContacts/equipe-a"), {
    active: false, name: "Contato preservado",
  }));
});

test("desativar setor preserva contatos e histórico, mas bloqueia novos vínculos até reativação", async () => {
  const supervisor = dbAs("supervisor");
  const sectorRef = doc(supervisor, "organizationSectors/suporte");
  const contactRef = doc(supervisor, "organizationContacts/equipe-a");
  const historicalRef = doc(supervisor, "users/alice/operational/history/entries/historico-preservado");

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice/operational/history/entries/historico-preservado"), {
      schemaVersion: 1, ownerUid: "alice", id: "historico-preservado",
      data: "2026-10-28", status: "CONCLUIDO", perfil: { id: "P001" },
      tarefas: [], emailsGlobais: [], observacao: "Histórico anterior",
      criadoEm: "2026-10-28T08:00:00Z", concluidoEm: "2026-10-28T12:00:00Z",
      ultimaAlteracao: "2026-10-28T12:00:00Z", origemVersao: null,
    });
  });

  await assertSucceeds(updateDoc(sectorRef, { active: false }));
  await assertSucceeds(getDoc(contactRef));
  await assertSucceeds(getDoc(historicalRef));
  // Reenviar o vínculo atual não é uma transferência nem altera os campos.
  await assertSucceeds(updateDoc(doc(supervisor, "users/alice"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));
  // Uma transferência real para o setor desativado deve ser recusada.
  await assertFails(updateDoc(doc(supervisor, "users/bob"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));

  await assertSucceeds(updateDoc(sectorRef, { active: true }));
  await assertSucceeds(updateDoc(doc(supervisor, "users/alice"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));
  await assertSucceeds(updateDoc(doc(supervisor, "users/bob"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));
});

test("desativar setor ou contato suspende publicação e anexos sem apagar os vínculos", async () => {
  const supervisor = dbAs("supervisor");
  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/maintenance"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/promotions"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));
  await assertSucceeds(setDoc(doc(supervisor, "featurePermissions/delinquency"), {
    schemaVersion: 1, enabled: true, sectorIds: ["suporte"], wholeSectorIds: ["suporte"],
    contactIds: [], agentIds: [], updatedAt: serverTimestamp(), updatedByUid: "supervisor",
  }));

  const alice = dbAs("alice");
  await assertSucceeds(setDoc(doc(alice, "sharedAttachments/antes-desativacao"), {
    targetType: "promotion", targetId: "rascunho", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(supervisor, "organizationSectors/suporte"), { active: false }));
  // The historical assignment remains readable, but no longer authorizes publishing.
  await assertSucceeds(getDoc(doc(alice, "users/alice")));
  for (const targetType of ["maintenance", "promotion", "delinquency"]) {
    await assertFails(setDoc(doc(alice, `sharedAttachments/setor-inativo-${targetType}`), {
      targetType, targetId: "rascunho", name: "arquivo.pdf",
      mimeType: "application/pdf", size: 4, data: "JVBERg==",
      createdByUid: "alice", createdAt: serverTimestamp(),
    }));
  }

  await assertSucceeds(updateDoc(doc(supervisor, "organizationSectors/suporte"), { active: true }));
  await assertSucceeds(updateDoc(doc(supervisor, "organizationContacts/equipe-a"), { active: false }));
  await assertFails(setDoc(doc(alice, "sharedAttachments/contato-inativo"), {
    targetType: "promotion", targetId: "rascunho", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(supervisor, "organizationContacts/equipe-a"), { active: true }));
  await assertSucceeds(setDoc(doc(alice, "sharedAttachments/apos-reativacao"), {
    targetType: "promotion", targetId: "rascunho", name: "arquivo.pdf",
    mimeType: "application/pdf", size: 4, data: "JVBERg==",
    createdByUid: "alice", createdAt: serverTimestamp(),
  }));
});

test("contato existente não pode ser transferido diretamente para outro setor", async () => {
  const supervisor = dbAs("supervisor");
  const contactRef = doc(supervisor, "organizationContacts/equipe-a");

  await assertFails(updateDoc(contactRef, { sectorId: "financeiro" }));
  await assertSucceeds(updateDoc(contactRef, { name: "Equipe A - nome atualizado" }));

  const saved = await getDoc(contactRef);
  assert.equal(saved.data().sectorId, "suporte");
  assert.equal(saved.data().name, "Equipe A - nome atualizado");
});

test("transferência de colaborador exige setor e contato ativos e pertencentes entre si", async () => {
  const supervisor = dbAs("supervisor");
  const aliceRef = doc(supervisor, "users/alice");

  await assertFails(updateDoc(aliceRef, {
    sectorId: "suporte", contactId: "equipe-b",
  }));
  await assertFails(updateDoc(aliceRef, {
    sectorId: "setor-inexistente", contactId: "equipe-a",
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, "organizationSectors/suporte"), { active: false });
  });
  // Bob is currently in Financeiro; moving him to the inactive Suporte sector must fail.
  await assertFails(updateDoc(doc(supervisor, "users/bob"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, "organizationSectors/suporte"), { active: true });
    await updateDoc(doc(db, "organizationContacts/equipe-a"), { active: false });
  });
  // The sector is active, but its target contact is inactive.
  await assertFails(updateDoc(doc(supervisor, "users/bob"), {
    sectorId: "suporte", contactId: "equipe-a",
  }));

  await assertSucceeds(updateDoc(aliceRef, {
    sectorId: "financeiro", contactId: "equipe-b",
  }));
  const saved = await getDoc(aliceRef);
  assert.equal(saved.data().sectorId, "financeiro");
  assert.equal(saved.data().contactId, "equipe-b");
});
