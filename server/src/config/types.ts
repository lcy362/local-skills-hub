export type Layout = 'flat' | 'nested' | 'auto';
export type SyncMode = 'symlink' | 'copy';

/** 标签来源方式 */
export type TagsMode = 'auto' | 'frontmatter' | 'repo-file' | 'external-file';

/** 仓库标签来源配置；不配置该项时沿用旧行为（读 config.skillMeta） */
export interface RepoTags {
  mode: TagsMode;
  /** repo-file: 仓库内相对/绝对标签文件；external-file: 仓库外绝对路径 */
  file?: string;
}

export interface Repo {
  id: string;
  path: string;
  /** 真实 skills 根目录，默认 <path>/skills；导入现有目录时指向其本体 */
  root?: string;
  layout: Layout;
  /** 可选：标签来源配置 */
  tags?: RepoTags;
}

export interface ForeignSource {
  id: string;
  name: string;
  path: string;
  layout: Layout;
  /** true=只读关联(不拷贝本体), false=已收编(拷贝进仓库) */
  linked: boolean;
}

export type AgentManageMode = 'preset' | 'manual';

export interface AgentOverride {
  globalDir?: string;
  projectDir?: string;
  sync?: SyncMode;
  /** 技能管理模式；缺省 = 'manual'（手动挑选） */
  mode?: AgentManageMode;
  /** mode=preset 时的基准套餐名；缺省则跟随全局激活 presets */
  preset?: string;
  /** 显式开启的 skill id（name@来源）：manual=全部依赖此；preset=基准之上额外开启 */
  explicitOn?: string[];
  /** 显式关闭的 skill id（仅 preset 模式下在基准之上裁剪某些成员） */
  explicitOff?: string[];
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
  /** 项目支持的 agent key 列表；省略 = 全部支持 */
  agents?: string[];
  /** 项目内逐个开启的 skill id（name@来源）：在标签命中之外显式补入 */
  explicitOn?: string[];
  /** 项目内逐个关闭的 skill id：从期望集里裁剪（仅标签命中成员可按此关闭） */
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
