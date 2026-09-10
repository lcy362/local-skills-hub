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
}
export interface PresetView { name: string; skills: string[]; tags: string[]; active?: boolean }
export interface AgentView {
  key: string; name: string; globalDir: string; installed: boolean;
  sync: 'symlink' | 'copy'; active: boolean; mode?: 'preset' | 'manual'; preset?: string;
  explicitOn?: string[]; explicitOff?: string[]; project?: string; projectDir?: string;
}
export interface StateView { onboarded: boolean; activeAgents: string[]; skills: SkillView[]; presets: PresetView[]; repos: RepoView[]; sources: SourceView[] }
export interface RepoView { id: string; path: string; layout: string; root?: string; tags?: { mode: string; file?: string } }
export interface SourceView { id: string; name: string; path: string; layout: string; linked: boolean; tagSystems?: { upstream?: boolean; hub?: boolean } }

/* ---------- 统一技能展示契约（三处上下文共用） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'tag' | 'index';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
export type SkillActionKind = 'toggle' | 'enable' | 'disable' | 'collect' | 'merge' | 'delete' | 'clean' | 'noop';
export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason;
  store: SkillStore;
  state: 'on' | 'wanted-pending' | 'off' | 'off-override' | 'residual' | 'own-in-use';
  offOverride?: boolean;
  linkTarget?: string;
  preset?: string;
  actions: SkillAction[];
}
export interface AddableSkill { id: string; name: string; repo: string }
export interface AgentSkillsResp { skills: SkillCardView[]; addable: AddableSkill[]; active: boolean }
export interface ProjectSkillsResp { skills: SkillCardView[]; addable: AddableSkill[] }

/* ---------- 同步/诊断 ---------- */
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[] }
export enum DiagStatus { ok = 'ok', warn = 'warn', error = 'error' }
export interface DiagItem { key: string; status: DiagStatus; message: string; detail?: unknown }
export interface DiagnoseResult { config: string; summary: Record<string, { total: number; ok: number; warn: number; error: number }>; groups: Record<string, DiagItem[]>; items: DiagItem[] }
export interface ProjectSyncResult { project: string; copied: string[]; removed: string[]; agentLinks: { agent: string; created: string[] }[]; errors: string[] }

/* ---------- 导入/收集/合并 ---------- */
export interface ImportPreviewItem { source: string; layout: string; count: number; error?: string }
export interface ImportResult { source: string; imported: string[]; skipped: string[] }
export interface MergeCandidate { name: string; source: string; sourceLabel: string; description?: string; version?: string; dir: string; existing: boolean }
export interface MergeGroup { name: string; candidates: MergeCandidate[] }
export interface AgentCollectItem { name: string; description?: string; tags: string[]; exists: boolean }
export interface AgentCollectPreview { agentKey: string; agentName: string; installedDir: string; items: AgentCollectItem[] }
export interface CollectResult { collected: string[]; skipped: string[] }
export interface OnboardState { step: 'ask' | 'import' | 'collect' | 'done'; needsSetup: boolean; agents: { key: string; name: string }[] }