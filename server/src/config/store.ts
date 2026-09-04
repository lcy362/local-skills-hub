import fs from 'node:fs';
import path from 'node:path';
import { HubConfig, emptyConfig } from './types.js';
import { CONFIG_PATH } from './defaults.js';

export class ConfigStore {
  private cfg: HubConfig;

  constructor(private filePath: string = CONFIG_PATH) {
    this.cfg = this.load();
  }

  private load(): HubConfig {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...emptyConfig(), ...parsed,
        repos: parsed.repos ?? [],
        foreignSources: parsed.foreignSources ?? [],
        agents: parsed.agents ?? {},
        activeAgents: parsed.activeAgents ?? [],
        presets: parsed.presets ?? [],
        skillMeta: parsed.skillMeta ?? {},
        projects: parsed.projects ?? [],
      };
    } catch {
      return emptyConfig();
    }
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.cfg, null, 2), 'utf-8');
  }

  get data(): HubConfig { return this.cfg; }

  replace(data: HubConfig): void {
    this.cfg = { ...emptyConfig(), ...data };
  }
}
