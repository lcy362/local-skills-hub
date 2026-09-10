/** 目录布局 */
export type Layout = 'flat' | 'nested' | 'auto';
/** 安装方式 */
export type SyncMode = 'symlink' | 'copy';
/** Agent 管理模式 */
export type AgentManageMode = 'preset' | 'manual';

/** 个人 skill 资产库仓库 */
export interface Repo {
  id: string;
  path: string;
  /** 真实 skills 根目录，缺省 <path>/skills */
  root?: string;
  layout: Layout;
}

/** 第三方 skill 库（开放内容库） */
export interface ForeignSource {
  id: string;
  name: string;
  path: string;
  layout: Layout;
  /** true=只读关联（不拷贝本体）；false=已收编（拷贝进仓库） */
  linked: boolean;
}

/** 自定义 Agent（AG-03）：内置清单之外由用户新增的任意工具 */
export interface CustomAgent {
  key: string;
  name: string;
  /** 全局 skill 目录（绝对路径或 ~/ 开头） */
  globalDir: string;
  /** 项目级相对目录，可空 */
  projectDir?: string;
  /** 目录为嵌套分类结构，需递归发现 SKILL.md */
  recursive?: boolean;
}

export interface AgentOverride {
  globalDir?: string;
  projectDir?: string;
  sync?: SyncMode;
  /** 每条 (skill, Agent) 关系的同步策略覆盖，键为 skill 名（SY-01） */
  skillSync?: Record<string, SyncMode>;
  mode?: AgentManageMode;
  preset?: string;
  explicitOn?: string[];
  explicitOff?: string[];
}

export interface Preset {
  name: string;
  /** skill id（name@来源） */
  skills: string[];
  /** 关联标签：打有这些标签的 skill 一并纳入本预设（PR-05） */
  tags: string[];
  active?: boolean;
}

export interface SkillMeta {
  tags: string[];
  /** 合并仲裁后保留来源（POST /skills/merge 记录归属） */
  mergeSource?: string;
  /** 来源追溯：收编自哪个 Agent / 外部目录（IM-04） */
  origin?: string;
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
  /** 用户自定义 Agent（AG-03） */
  customAgents: CustomAgent[];
  agents: Record<string, AgentOverride>;
  activeAgents: string[];
  presets: Preset[];
  skillMeta: Record<string, SkillMeta>;
  projects: ProjectLink[];
  defaultSync: SyncMode;
  /** 复制模式下的目录级 watcher 开关（SY-04）；PRD 要求可选、默认关闭 */
  watchers: boolean;
}

export const emptyConfig = (): HubConfig => ({
  schemaVersion: 3,
  repos: [],
  foreignSources: [],
  customAgents: [],
  agents: {},
  activeAgents: [],
  presets: [],
  skillMeta: {},
  projects: [],
  defaultSync: 'symlink',
  watchers: false,
});
