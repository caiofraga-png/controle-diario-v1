import type { Configuracao, LoadedData } from "./dataRepository";
import { defaultConfiguration, normalizeConfiguration } from "./dataRepository";
import { FirebasePersonalDataService } from "./firebasePersonalDataService";
import { FirebaseOperationalService } from "./firebaseOperationalService";
import { loadSharedTaskCatalog } from "./firebaseSharedTaskCatalogService";

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
    // Layout remains personal. Shared catalog edits are managed separately
    // through the supervisor/admin catalog workflow.
    await this.personal.saveConfiguration(normalizeConfiguration(configuracao));
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
