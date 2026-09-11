export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/* ---------- 基础数据契约 ---------- */
export interface SkillView {
  id: string; // name@来源
  name: string;
  source: string;
  dir: string;
  description?: string;
  version?: string;
  tags: string[];
  /** 来源追溯：收编自哪个 Agent / 外部目录（IM-04） */
  origin?: string;
}
export interface PresetView { name: string; skills: string[]; tags: string[]; active?: boolean }
export interface AgentView {
  key: string; name: string; globalDir: string; installed: boolean;
  sync: 'symlink' | 'copy'; active: boolean; mode: 'preset' | 'manual'; preset?: string;
  skillSync?: Record<string, 'symlink' | 'copy'>;
  family?: string; sharedWith: string[]; alsoUsedBy?: string[]; shared?: string; custom?: boolean;
  project?: string;
}
export interface CustomAgentView { key: string; name: string; globalDir: string; projectDir?: string; recursive?: boolean }
export interface SettingsView { defaultSync: 'symlink' | 'copy'; watchers: boolean }
export interface StateView {
  activeAgents: string[];
  skills: SkillView[];
  presets: PresetView[];
  repos: RepoView[];
  sources: SourceView[];
  customAgents: CustomAgentView[];
  settings: SettingsView;
}
export interface RepoView { id: string; path: string; layout: string; root?: string }
export interface SourceView { id: string; name: string; path: string; layout: string; linked: boolean }

/* ---------- 统一技能展示契约（三处上下文共用） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
/** detail 仅客户端使用：技能库里打开技能详情 */
export type SkillActionKind = 'toggle' | 'collect' | 'merge' | 'delete' | 'detail';
export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason;
  store: SkillStore;
  /** 缺省表示该上下文没有启用/停用语义（如技能库资产池），此时不展示状态徽标 */
  state?: 'on' | 'off' | 'own-in-use';
  offOverride?: boolean;
  linkTarget?: string;
  preset?: string;
  actions: SkillAction[];
}
export interface AddableSkill { id: string; name: string; repo: string }
export interface AgentSkillsResp { skills: SkillCardView[]; addable: AddableSkill[]; active: boolean }
export interface ProjectSkillsResp { skills: SkillCardView[]; addable: AddableSkill[] }

/* ---------- 同步/诊断 ---------- */
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[]; warnings?: string[] }
export enum DiagStatus { ok = 'ok', warn = 'warn', error = 'error' }
export interface DiagItem { key: string; status: DiagStatus; message: string; detail?: unknown }
export interface DiagnoseResult { config: string; summary: Record<string, { total: number; ok: number; warn: number; error: number }>; groups: Record<string, DiagItem[]>; items: DiagItem[] }
export interface ProjectSyncResult { project: string; copied: string[]; removed: string[]; agentLinks: { agent: string; created: string[] }[]; errors: string[] }
export interface ProjectPushResult { project: string; repo: string; pushed: string[]; skipped: string[]; errors: string[] }

/* ---------- 导入/收集/合并 ---------- */
export interface ImportPreviewItem { source: string; layout: string; count: number; tags?: string[]; error?: string }
export interface ImportResult { source: string; imported: string[]; skipped: string[] }
export interface MergeCandidate { name: string; source: string; sourceLabel: string; description?: string; version?: string; dir: string; existing: boolean }
export interface MergeGroup { name: string; candidates: MergeCandidate[] }
/** /integrate/preview 出参（IM-02 去重确认） */
export interface IntegrateCandidate { id: string; name: string; source: string; sourceLabel: string; dir: string; inRepo: boolean; description?: string }
export interface IntegrateGroup { name: string; candidates: IntegrateCandidate[] }
export interface AgentCollectItem { name: string; description?: string; tags: string[]; exists: boolean }
export interface AgentCollectPreview { agentKey: string; agentName: string; installedDir: string; items: AgentCollectItem[] }
export interface CollectResult { collected: string[]; skipped: string[] }
export interface SkillContent { id: string; dir: string; content: string; files: string[] }
