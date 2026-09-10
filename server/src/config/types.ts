/** 标签来源方式 */
export type TagsMode = 'auto' | 'frontmatter' | 'repo-file' | 'external-file';
/** 目录布局 */
export type Layout = 'flat' | 'nested' | 'auto';
/** 安装方式 */
export type SyncMode = 'symlink' | 'copy';
/** Agent 管理模式 */
export type AgentManageMode = 'preset' | 'manual';

/** 仓库标签来源配置；缺省=沿用 config.skillMeta */
export interface RepoTags {
  mode: TagsMode;
  /** repo-file: 仓库内相对/绝对标签文件；external-file: 仓库外绝对路径 */
  file?: string;
}

/** 个人 skill 资产库仓库 */
export interface Repo {
  id: string;
  path: string;
  /** 真实 skills 根目录，缺省 <path>/skills */
  root?: string;
  layout: Layout;
  tags?: RepoTags;
}

/** 第三方 skill 库（开放内容库） */
export interface ForeignSource {
  id: string;
  name: string;
  path: string;
  layout: Layout;
  /** true=只读关联（不拷贝本体）；false=已收编（拷贝进仓库） */
  linked: boolean;
  /** 两套标签体系各自的启用开关：仓库自带(frontmatter) 与 hub 管理(仓库内/外文件) */
  tagSystems?: { upstream?: boolean; hub?: boolean };
}

export interface AgentOverride {
  globalDir?: string;
  projectDir?: string;
  sync?: SyncMode;
  mode?: AgentManageMode;
  preset?: string;
  explicitOn?: string[];
  explicitOff?: string[];
}

export interface Preset {
  name: string;
  /** skill id（name@来源） */
  skills: string[];
  tags: string[];
  active?: boolean;
}

export interface SkillMeta {
  tags: string[];
  /** 合并仲裁后保留来源（POST /skills/merge 记录归属） */
  mergeSource?: string;
}

export interface ProjectLink {
  path: string;
  /** 标签=投放策略 */
  tags: string[];
  explicitOn?: string[];
  explicitOff?: string[];
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
  /** 首启向导是否已完成 */
  onboarded?: boolean;
}

export const emptyConfig = (): HubConfig => ({
  schemaVersion: 2,
  repos: [],
  foreignSources: [],
  agents: {},
  activeAgents: [],
  presets: [],
  skillMeta: {},
  projects: [],
  defaultSync: 'symlink',
  onboarded: false,
});