import type { Configuracao, LoadedData } from "./dataRepository";
import { defaultConfiguration, normalizeConfiguration } from "./dataRepository";
import { FirebasePersonalDataService } from "./firebasePersonalDataService";
import { FirebaseOperationalService } from "./firebaseOperationalService";
import { loadSharedTaskCatalog, saveSharedTaskCatalog, updateSharedTaskCatalog } from "./firebaseSharedTaskCatalogService";
import { requireFirebase } from "./firebaseClient";
import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

/**
 * Shared task/profile/email catalog + private layout/calendar/operational state.
 * Existing personal configurations remain the fallback until a manager
 * explicitly initializes the shared catalog.
 */
export class FirebaseWorkspaceRepository {
  constructor(
    private readonly personal = new FirebasePersonalDataService(),
    private readonly operational = new FirebaseOperationalService(),
  ) {}

  async load(): Promise<LoadedData> {
    const loadedConfiguration = await this.personal.loadConfiguration();
    const personalConfiguration = normalizeConfiguration(loadedConfiguration ?? defaultConfiguration());
    if (!loadedConfiguration) {
      await this.personal.saveConfiguration(personalConfiguration);
    }

    const sharedCatalog = await loadSharedTaskCatalog();
    const configuracao: Configuracao = sharedCatalog
      ? normalizeConfiguration({
          tarefas: sharedCatalog.tarefas,
          perfis: sharedCatalog.perfis,
          email: sharedCatalog.email,
          layout: personalConfiguration.layout,
        })
      : personalConfiguration;

    // Personal task text overrides are private to the signed-in collaborator.
    // They are layered over the latest institutional template at read time.
    const { auth, db } = requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("FAÇA LOGIN PARA CARREGAR SUAS PERSONALIZAÇÕES.");
    const customizationSnapshot = await getDocs(collection(db, "users", user.uid, "taskCustomizations"));
    const overrides = new Map(customizationSnapshot.docs.map(item => [item.id, item.data()]));
    configuracao.tarefas.tarefas = configuracao.tarefas.tarefas.map(task => {
      const override = overrides.get(task.id);
      if (!override) return task;
      return {
        ...task,
        ...(typeof override.criacao === "string" ? { criacao: override.criacao } : {}),
        ...(override.roteiro && typeof override.roteiro === "object" ? { roteiro: override.roteiro } : {}),
      };
    });

    const [calendar, estado] = await Promise.all([
      this.personal.loadCalendar(),
      this.operational.loadCurrentState(),
    ]);

    return {
      configuracao,
      calendario: calendar ?? { schemaVersion: 1, datas: [] },
      estado,
    };
  }

  async saveConfiguration(configuracao: Configuracao): Promise<void> {
    const normalized = normalizeConfiguration(configuracao);
    const sharedCatalog = await loadSharedTaskCatalog();

    // Before the organization initializes its shared catalog, preserve the
    // existing personal configuration as a safe fallback.
    if (!sharedCatalog) {
      await this.personal.saveConfiguration(normalized);
      return;
    }

    const { auth, db } = requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("FAÇA LOGIN PARA SALVAR A CONFIGURAÇÃO.");
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    const userData = userSnapshot.exists() ? userSnapshot.data() : null;
    const isManager = userData?.status === "approved" &&
      (userData.role === "admin" || userData.isSupervisor === true);

    // Both sides are validated into the same domain shapes before comparison.
    const catalogChanged =
      JSON.stringify(normalized.tarefas) !== JSON.stringify(sharedCatalog.tarefas) ||
      JSON.stringify(normalized.perfis) !== JSON.stringify(sharedCatalog.perfis) ||
      JSON.stringify(normalized.email) !== JSON.stringify(sharedCatalog.email);

    if (catalogChanged && !isManager) {
      throw new Error("SOMENTE SUPERVISORES E ADMINISTRADORES PODEM ALTERAR TAREFAS, PERFIS E E-MAILS COMPARTILHADOS.");
    }

    // Managers publish catalog changes for future expedientes. Every user,
    // including managers, keeps an independent layout.
    if (catalogChanged) await updateSharedTaskCatalog(normalized);
    await this.personal.saveLayout(normalized.layout);
  }

  async saveTaskContent(input: { id: string; criacao?: string; roteiro?: unknown }): Promise<void> {
    const { auth, db } = requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("FAÇA LOGIN PARA SALVAR O CONTEÚDO DA TAREFA.");
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    const userData = userSnapshot.exists() ? userSnapshot.data() : null;
    const isManager = userData?.status === "approved" &&
      (userData.role === "admin" || userData.isSupervisor === true);

    if (isManager) {
      const loaded = await this.load();
      const sharedCatalog = await loadSharedTaskCatalog();
      if (!sharedCatalog) throw new Error("O CATÁLOGO INSTITUCIONAL AINDA NÃO FOI INICIALIZADO.");
      // Start from the institutional source, never from the merged personal view.
      const config = normalizeConfiguration({
        tarefas: JSON.parse(JSON.stringify(sharedCatalog.tarefas)),
        perfis: JSON.parse(JSON.stringify(sharedCatalog.perfis)),
        email: JSON.parse(JSON.stringify(sharedCatalog.email)),
        layout: loaded.configuracao.layout,
      });
      const task = config.tarefas.tarefas.find(item => item.id === input.id);
      if (!task) throw new Error("TAREFA NÃO ENCONTRADA.");
      if (Object.prototype.hasOwnProperty.call(input, "criacao")) task.criacao = String(input.criacao ?? "");
      if (Object.prototype.hasOwnProperty.call(input, "roteiro")) task.roteiro = JSON.parse(JSON.stringify(input.roteiro));
      await this.saveConfiguration(config);
      return;
    }

    const ref = doc(db, "users", user.uid, "taskCustomizations", input.id);
    const payload: Record<string, unknown> = { taskId: input.id, updatedAt: serverTimestamp() };
    if (Object.prototype.hasOwnProperty.call(input, "criacao")) payload.criacao = String(input.criacao ?? "");
    if (Object.prototype.hasOwnProperty.call(input, "roteiro")) payload.roteiro = JSON.parse(JSON.stringify(input.roteiro));
    await setDoc(ref, payload, { merge: true });
  }

  async resetTaskContent(input: { id: string; field: "criacao" | "roteiro" }): Promise<void> {
    const { auth, db } = requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("FAÇA LOGIN PARA REDEFINIR O CONTEÚDO DA TAREFA.");
    const ref = doc(db, "users", user.uid, "taskCustomizations", input.id);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists() || !Object.prototype.hasOwnProperty.call(snapshot.data(), input.field)) return;
    await updateDoc(ref, { [input.field]: deleteField(), updatedAt: serverTimestamp() });
  }

  async saveCalendar(calendario: LoadedData["calendario"]): Promise<void> {
    await this.personal.saveCalendar(calendario);
  }

  async loadCurrentState() {
    return this.operational.loadCurrentState();
  }

  async saveCurrentState(estado: LoadedData["estado"]): Promise<void> {
    await this.operational.saveCurrentState(estado);
  }
}
