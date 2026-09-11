import fs from 'node:fs';
import path from 'node:path';
import { HubConfig, emptyConfig } from './types.js';
import { CONFIG_PATH } from './defaults.js';
import { log } from '../infra/logger.js';

/**
 * 旧版 agent key → PRD §5.2.1 约定 key。
 * 内置清单已改用 PRD 命名，此处保证既有用户配置不失效。
 */
const AGENT_KEY_RENAMES: Record<string, string> = {
  claude: 'claude_code',
  'trae-cn': 'trae_cn',
  'qwen-code': 'qwen_code',
  'kilo-code': 'kilo_code',
  'roo-code': 'roo_code',
  'gemini-cli': 'gemini_cli',
};

export class ConfigStore {
  private cfg: HubConfig;

  constructor(private filePath: string = CONFIG_PATH) {
    this.cfg = this.load();
  }

  /** 把旧 agent key 迁到 PRD 命名（幂等） */
  private migrateAgentKeys(cfg: HubConfig): void {
    const renames = Object.entries(AGENT_KEY_RENAMES).filter(([old]) => old in cfg.agents);
    if (renames.length === 0 && !cfg.activeAgents.some((k) => k in AGENT_KEY_RENAMES)) return;
    for (const [old, next] of renames) {
      const merged = { ...(cfg.agents[next] ?? {}), ...cfg.agents[old] };
      delete cfg.agents[old];
      cfg.agents[next] = merged;
    }
    cfg.activeAgents = [...new Set(cfg.activeAgents.map((k) => AGENT_KEY_RENAMES[k] ?? k))];
  }

  private load(): HubConfig {
    let parsed: Partial<HubConfig> = {};
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<HubConfig>;
    } catch (e) {
      // 首次运行（文件不存在，ENOENT）属正常；存在但解析失败（SyntaxError）需提示
      const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
      (missing ? log.info : log.warn)('config', `配置文件${missing ? '不存在，按默认值启动' : `解析失败，按默认值启动: ${(e as Error).message}`}`, { file: this.filePath });
      parsed = {};
    }
    const cfg: HubConfig = {
      ...emptyConfig(),
      ...parsed,
      repos: parsed.repos ?? [],
      foreignSources: parsed.foreignSources ?? [],
      customAgents: parsed.customAgents ?? [],
      agents: parsed.agents ?? {},
      activeAgents: parsed.activeAgents ?? [],
      presets: parsed.presets ?? [],
      skillMeta: parsed.skillMeta ?? {},
      projects: parsed.projects ?? [],
      defaultSync: parsed.defaultSync ?? emptyConfig().defaultSync,
      // PRD：watcher 为可选项，历史配置一律按「关闭」处理
      watchers: parsed.watchers === true,
    } as HubConfig;
    this.migrateAgentKeys(cfg);
    if (cfg.schemaVersion !== emptyConfig().schemaVersion) {
      log.info('config', `schemaVersion 迁移 ${cfg.schemaVersion} → ${emptyConfig().schemaVersion}`, { file: this.filePath });
      cfg.schemaVersion = emptyConfig().schemaVersion;
      this.cfg = cfg;
      this.save();
    }
    return cfg;
  }

  save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.cfg, null, 2), 'utf-8');
    } catch (e) {
      log.error('config', `保存配置失败: ${(e as Error).message}`, { file: this.filePath });
      throw e;
    }
  }

  get data(): HubConfig { return this.cfg; }

  replace(data: HubConfig): void {
    this.cfg = { ...emptyConfig(), ...data };
  }
}
