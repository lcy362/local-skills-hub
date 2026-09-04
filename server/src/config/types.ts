export type Layout = 'flat' | 'nested' | 'auto';
export type SyncMode = 'symlink' | 'copy';

export interface Repo {
  id: string;
  path: string;
  /** 真实 skills 根目录，默认 <path>/skills；导入现有目录时指向其本体 */
  root?: string;
  layout: Layout;
}

export interface ForeignSource {
  id: string;
  name: string;
  path: string;
  layout: Layout;
  /** true=只读关联(不拷贝本体), false=已收编(拷贝进仓库) */
  linked: boolean;
}

export interface AgentOverride {
  globalDir?: string;
  projectDir?: string;
  sync?: SyncMode;
}

export interface Preset {
  name: string;
  skills: string[];   // name@来源
  tags: string[];
  active?: boolean;
}

export interface SkillMeta {
  tags: string[];
  source?: string;
}

export interface ProjectLink {
  path: string;
  tags: string[];
}

export interface HubConfig {
  schemaVersion: number;
  repos: Repo[];
  foreignSources: ForeignSource[];
  agents: Record<string, AgentOverride>;
  activeAgents: string[];
  presets: Preset[];
  skillMeta: Record<string, SkillMeta>;
  projects: ProjectLink[];
  defaultSync: SyncMode;
}

export const emptyConfig = (): HubConfig => ({
  schemaVersion: 1,
  repos: [],
  foreignSources: [],
  agents: {},
  activeAgents: [],
  presets: [],
  skillMeta: {},
  projects: [],
  defaultSync: 'symlink',
});
