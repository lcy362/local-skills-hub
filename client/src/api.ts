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
export interface AgentView { key: string; name: string; globalDir: string; installed: boolean; sync: string; active: boolean; family?: string; shared?: string }
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[] }
export interface StateView { activeAgents: string[]; skills: SkillView[]; presets: PresetView[] }
