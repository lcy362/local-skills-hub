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
export interface AgentView { key: string; name: string; globalDir: string; installed: boolean; sync: string; active: boolean; family?: string; shared?: string; layers?: string[] }
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[] }
export interface StateView { activeAgents: string[]; skills: SkillView[]; presets: PresetView[] }
export interface RepoView { id: string; path: string; layout: string }
export interface SourceView { id: string; name: string; path: string; layout: string; linked: boolean }
export interface ProjectView { path: string; tags: string[]; hasAgents?: boolean }
export interface Candidate { id: string; name: string; source: string; sourceLabel: string; dir: string; inRepo: boolean; description?: string }
export interface IntegrateGroup { name: string; candidates: Candidate[] }
export interface DiagItem { key: string; status: 'ok' | 'warn' | 'error'; message: string }
export interface ProjectSyncResult { project: string; copied: string[]; removed: string[]; agentLinks: { agent: string; created: string[] }[]; errors: string[] }
export interface ImportResult { source: string; imported: string[]; skipped: string[] }
