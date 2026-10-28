import type { Configuracao, LoadedData } from "./dataRepository";
import { defaultConfiguration, normalizeConfiguration } from "./dataRepository";
import { FirebasePersonalDataService } from "./firebasePersonalDataService";
import { FirebaseOperationalService } from "./firebaseOperationalService";

/**
 * Step 1 adapter for the per-user Firebase workspace.
 * This repository is not wired into the live UI yet; Drive remains the active
 * source until the complete operational flow is integrated and tested.
 */
export class FirebaseWorkspaceRepository {
  constructor(
    private readonly personal = new FirebasePersonalDataService(),
    private readonly operational = new FirebaseOperationalService(),
  ) {}

  async load(): Promise<LoadedData> {
    const loadedConfiguration = await this.personal.loadConfiguration();
    const configuracao = normalizeConfiguration(loadedConfiguration ?? defaultConfiguration());
    if (!loadedConfiguration) {
      await this.personal.saveConfiguration(configuracao);
    }

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
