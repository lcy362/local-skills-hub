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

export interface SkillView { id: string; name: string; source: string; dir: string; description?: string; version?: string; tags: string[] }
export interface PresetView { name: string; skills: string[]; tags: string[]; active?: boolean }
export interface AgentView { key: string; name: string; globalDir: string; installed: boolean; sync: string; active: boolean; family?: string; shared?: string; layers?: string[]; sharedWith: string[]; alsoUsedBy?: string[]; mode?: 'preset' | 'manual'; preset?: string; explicitOn?: string[]; explicitOff?: string[]; project?: string }
export interface AgentSkillView { skillId?: string; name: string; title?: string; description?: string; source: 'managed' | 'owned'; wanted: boolean; present: boolean; store: 'symlink' | 'copy' | 'own' | 'pending'; linkTarget?: string; reason: 'preset' | 'manual' | 'own'; offOverride?: boolean; preset?: string; repo?: string; dir?: string; link?: boolean; disableVia?: 'off' | 'on' }
export interface AddableSkill { id: string; name: string; repo: string }
export interface AgentSkillsResp { skills: AgentSkillView[]; addable: AddableSkill[]; active: boolean }
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[] }
export interface StateView { activeAgents: string[]; skills: SkillView[]; presets: PresetView[] }
export interface RepoView { id: string; path: string; layout: string; root?: string; tags?: { mode: 'auto' | 'frontmatter' | 'repo-file' | 'external-file'; file?: string } }
export interface SourceView { id: string; name: string; path: string; layout: string; linked: boolean }
export interface ProjectView { path: string; tags: string[]; agents?: string[]; explicitOn?: string[]; explicitOff?: string[]; hasAgents?: boolean }
export interface ProjectSkillView { skillId?: string; name: string; title?: string; description?: string; source: 'managed' | 'owned'; wanted: boolean; present: boolean; store: 'copy' | 'pending' | 'own'; reason: 'tag' | 'manual' | 'own'; offOverride?: boolean; disableVia?: 'off' | 'on'; repo?: string; dir?: string }
export interface ProjectSkillsResp { skills: ProjectSkillView[]; addable: AddableSkill[] }
export interface Candidate { id: string; name: string; source: string; sourceLabel: string; dir: string; inRepo: boolean; description?: string }
export interface IntegrateGroup { name: string; candidates: Candidate[] }
export interface SyncDiff { agent: string; desiredNames: string[]; missing: string[]; extra: string[]; brokenLink: string[] }
export type DiagStatus = 'ok' | 'warn' | 'error';
export interface DiagItem { key: string; status: DiagStatus; message: string; detail?: unknown }
export type DiagDimension = 'agent' | 'sync' | 'dup' | 'durability' | 'config' | 'repo' | 'project' | 'tags';
export interface DiagSummary { total: number; ok: number; warn: number; error: number }
export interface DiagGroups {
  agent: DiagItem[]; sync: DiagItem[]; dup: DiagItem[]; durability: DiagItem[];
  config: DiagItem[]; repo: DiagItem[]; project: DiagItem[]; tags: DiagItem[];
}
export interface DiagnoseResult {
  config: string;
  summary: Record<DiagDimension, DiagSummary>;
  groups: DiagGroups;
  items: DiagItem[];
}
export interface ProjectSyncResult { project: string; copied: string[]; removed: string[]; agentLinks: { agent: string; created: string[] }[]; errors: string[] }
export interface ImportResult { source: string; imported: string[]; skipped: string[] }
export interface ImportPreviewItem { source: string; layout: string; count: number; error?: string }
export interface AgentCollectItem { name: string; description?: string; tags: string[]; exists: boolean }
export interface AgentCollectPreview { agentKey: string; agentName: string; installedDir: string; items: AgentCollectItem[] }
export interface CollectResult { collected: string[]; skipped: string[] }
