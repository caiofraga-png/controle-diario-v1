import type { Configuracao, LoadedData } from "./dataRepository";
import { defaultConfiguration, normalizeConfiguration } from "./dataRepository";
import { FirebasePersonalDataService } from "./firebasePersonalDataService";
import { FirebaseOperationalService } from "./firebaseOperationalService";
import { loadSharedTaskCatalog, saveSharedTaskCatalog } from "./firebaseSharedTaskCatalogService";
import { requireFirebase } from "./firebaseClient";
import { doc, getDoc } from "firebase/firestore";

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

    const catalogChanged =
      JSON.stringify(normalized.tarefas) !== JSON.stringify({ schemaVersion: 1, tarefas: sharedCatalog.tarefas.tarefas }) ||
      JSON.stringify(normalized.perfis) !== JSON.stringify({ schemaVersion: 1, perfis: sharedCatalog.perfis.perfis }) ||
      JSON.stringify(normalized.email) !== JSON.stringify({ schemaVersion: 1, ...sharedCatalog.email });

    if (catalogChanged && !isManager) {
      throw new Error("SOMENTE SUPERVISORES E ADMINISTRADORES PODEM ALTERAR TAREFAS, PERFIS E E-MAILS COMPARTILHADOS.");
    }

    // Managers publish catalog changes for future expedientes. Every user,
    // including managers, keeps an independent layout.
    if (catalogChanged) await saveSharedTaskCatalog(normalized);
    await this.personal.saveLayout(normalized.layout);
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
