import { useEffect, useState } from 'react';
import { api, StateView, AgentView, PresetView, SkillView, SyncResult, RepoView, SourceView, ProjectView, IntegrateGroup, Candidate, DiagItem, ProjectSyncResult, ImportResult } from './api';

type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'integrate' | 'diag' | 'settings';

const fmt: Record<Tab, string> = { library: '资产库', agents: 'Agents', presets: 'Presets', projects: '项目', integrate: '收编', diag: '诊断', settings: '设置' };

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [state, setState] = useState<StateView | null>(null);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [msg, setMsg] = useState('');
  const err = msg;

  const reload = async () => {
    try {
      const [s, a] = await Promise.all([api<StateView>('/state'), api<AgentView[]>('/agents')]);
      setState(s); setAgents(a); setMsg('');
    } catch (e) { setMsg((e as Error).message); }
  };
  useEffect(() => { reload(); }, []);

  const runSync = async () => {
    const res = await api<SyncResult[]>('/sync', { method: 'POST', body: JSON.stringify({}) });
    setMsg(res.map((x) => `${x.agent} 新建:${x.created.length} 移除:${x.removed.length} 失败:${x.failed.length}`).join(' | ') || '无活跃 agent');
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1120, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 2 }}>Skills Hub</h1>
      <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>你的技能，一处沉淀，切到即用</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(Object.keys(fmt) as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', fontWeight: tab === t ? 700 : 400 }}>{fmt[t]}</button>
        ))}
        <button onClick={runSync} style={{ marginLeft: 'auto', padding: '6px 14px' }}>立即同步</button>
        <button onClick={reload} style={{ padding: '6px 14px' }}>刷新</button>
      </div>
      {err && <pre style={{ background: '#fde', padding: 8 }}>{err}</pre>}
      {tab === 'library' && <Library state={state} onLoad={reload} />}
      {tab === 'agents' && <AgentsView agents={agents} onLoad={reload} />}
      {tab === 'presets' && <PresetsView state={state} onLoad={reload} />}
      {tab === 'projects' && <ProjectsView onLoad={setMsg} />}
      {tab === 'integrate' && <IntegrateView onMsg={setMsg} />}
      {tab === 'diag' && <DiagView />}
      {tab === 'settings' && <SettingsView onMsg={setMsg} />}
    </div>
  );
}

/* ---------- Library ---------- */
function Library({ state, onLoad }: { state: StateView | null; onLoad: () => void }) {
  const setTags = async (id: string, tags: string[]) => {
    await api(`/skills/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tags }) });
    onLoad();
  };
  const addTag = async (id: string, tag: string) => {
    const s = state?.skills.find((x) => x.id === id); if (!s) return;
    setTags(id, s.tags.includes(tag) ? s.tags : [...s.tags, tag]);
  };
  const delTag = async (id: string, tag: string) => {
    const s = state?.skills.find((x) => x.id === id); if (!s) return;
    setTags(id, s.tags.filter((t) => t !== tag));
  };
  return (
    <div>
      <h3>资产库（{state?.skills.length ?? 0}）</h3>
      {state?.skills.map((s) => (
        <div key={s.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <b>{s.name}</b> <span style={{ color: '#888' }}>@{s.source}</span>
          <div style={{ fontSize: 13, color: s.description ? '#555' : '#aaa' }}>{s.description ?? '（无描述）'}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {s.tags.map((t) => <span key={t} style={{ background: '#def', padding: '1px 6px', borderRadius: 8, marginRight: 6, cursor: 'pointer' }} onClick={() => delTag(s.id, t)}>{t} ✕</span>)}
            <TagAdder onAdd={(t) => addTag(s.id, t)} />
          </div>
        </div>
      ))}
    </div>
  );
}
function TagAdder({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return (<span>
    <input value={v} placeholder="+标签" style={{ width: 70, fontSize: 12 }} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} />
  </span>);
}

/* ---------- Agents ---------- */
function AgentsView({ agents, onLoad }: { agents: AgentView[]; onLoad: () => void }) {
  const setActive = async (key: string) => {
    const cur = await api<string[]>('/activeAgents');
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    await api(`/activeAgents`, { method: 'PUT', body: JSON.stringify(next) });
    onLoad();
  };
  const toggleMode = async (key: string, sync: string) => {
    await api(`/agents/${key}`, { method: 'PUT', body: JSON.stringify({ sync: sync === 'symlink' ? 'copy' : 'symlink' }) });
    onLoad();
  };
  return (
    <div>
      <h3>Agents（活跃 {agents.filter((a) => a.active).length}）</h3>
      {agents.map((a) => (
        <div key={a.key} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8, background: a.active ? '#efe' : undefined }}>
          <b>{a.name}</b>
          {a.family && <span style={{ color: '#888', marginLeft: 8 }}>家族: {a.family}</span>}
          {a.shared && <span style={{ color: '#a60', marginLeft: 8, background: '#ffe', padding: '0 5px', borderRadius: 4 }}>共享 ~/{a.shared}</span>}
          {!a.installed && <span style={{ color: '#aaa', marginLeft: 8 }}>未安装</span>}
          <div style={{ fontSize: 12, color: '#555' }}>{a.globalDir} · 模式: {a.sync}</div>
          <button onClick={() => setActive(a.key)} style={{ marginTop: 4 }}>{a.active ? '取消活跃' : '设为活跃'}</button>
          <button onClick={() => toggleMode(a.key, a.sync)} style={{ marginLeft: 8 }}>切 {a.sync === 'symlink' ? '复制' : '软链'}</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Presets ---------- */
function PresetsView({ state, onLoad }: { state: StateView | null; onLoad: () => void }) {
  const add = async () => {
    const name = prompt('preset 名称'); if (!name) return;
    await api('/presets', { method: 'POST', body: JSON.stringify({ name }) }); onLoad();
  };
  const activate = async (name: string, active: boolean) => {
    await api(`/presets/${encodeURIComponent(name)}/activate`, { method: 'POST', body: JSON.stringify({ active }) }); onLoad();
  };
  const member = async (name: string, skillId: string, add: boolean) => {
    const p = state?.presets.find((x) => x.name === name); if (!p) return;
    const skills = add ? (p.skills.includes(skillId) ? p.skills : [...p.skills, skillId]) : p.skills.filter((s) => s !== skillId);
    await api(`/presets/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ skills }) }); onLoad();
  };
  return (
    <div>
      <h3>Presets <button onClick={add}>+ 新建</button></h3>
      {state?.presets.map((p) => (
        <div key={p.name} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8, background: p.active ? '#efe' : undefined }}>
          <b>{p.name}</b> {p.active && <span style={{ color: '#070' }}>● 已激活</span>}
          <button onClick={() => activate(p.name, !p.active)} style={{ marginLeft: 8 }}>{p.active ? '取消激活' : '激活'}</button>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{p.skills.join('、') || '（空，可在下方勾选 skill）'}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            可选:
            {state?.skills.slice(0, 200).map((s) => (
              <label key={s.id} style={{ marginRight: 8 }}>
                <input type="checkbox" checked={p.skills.includes(s.id)} onChange={(e) => member(p.name, s.id, e.target.checked)} />{s.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Projects ---------- */
function ProjectsView({ onLoad }: { onLoad: (m: string) => void }) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [skills, setSkills] = useState<SkillView[]>([]);
  const [path, setPath] = useState(''); const [tag, setTag] = useState('');
  const reload = async () => {
    const [p, s] = await Promise.all([api<ProjectView[]>('/projects'), api<StateView>('/state').then((x) => x.skills)]);
    setProjects(p); setSkills(s);
  };
  useEffect(() => { reload(); }, []);
  const add = async () => {
    if (!path.trim()) return;
    await api('/projects', { method: 'POST', body: JSON.stringify({ path: path.trim(), tags: tag.trim() ? tag.split(',').map((t) => t.trim()) : [] }) });
    setPath(''); setTag(''); reload();
  };
  const sync = async (i: number) => {
    const r = await api<ProjectSyncResult>(`/projects/${i}/sync`, { method: 'POST', body: JSON.stringify({}) });
    onLoad(`复制:${r.copied.join(',') || '无'} 移除:${r.removed.length} 代理软链:${r.agentLinks.filter((x) => x.created.length).length} 个`);
    reload();
  };
  const toggleTag = async (i: number, t: string) => {
    const pv = projects[i]; if (!pv) return;
    const tags = pv.tags.includes(t) ? pv.tags.filter((x) => x !== t) : [...pv.tags, t];
    await api(`/projects/${i}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
    reload();
  };
  return (
    <div>
      <h3>项目级 Skill（标签关联）</h3>
      <div style={{ marginBottom: 10 }}>
        <input placeholder="项目绝对路径" value={path} style={{ width: 420 }} onChange={(e) => setPath(e.target.value)} />
        <input placeholder="标签(逗号分隔)" value={tag} style={{ width: 200, marginLeft: 6 }} onChange={(e) => setTag(e.target.value)} />
        <button onClick={add} style={{ marginLeft: 6 }}>登记项目</button>
      </div>
      {projects.map((p, i) => (
        <div key={p.path} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <b>{p.path}</b> {p.hasAgents && <span style={{ color: '#070' }}>已有 .agents</span>}
          <div style={{ marginTop: 4 }}>
            标签:{p.tags.map((t) => <span key={t} style={{ background: '#efd', padding: '1px 6px', borderRadius: 8, marginRight: 6, cursor: 'pointer' }} onClick={() => toggleTag(i, t)}>{t} ✕</span>)}
            {skills.filter((s) => s.tags.some((t) => p.tags.includes(t))).map((s) => (
              <span key={s.id} style={{ background: '#eef', padding: '1px 6px', borderRadius: 8, marginRight: 6 }}>✓ {s.name}</span>
            ))}
          </div>
          <button onClick={() => sync(i)} style={{ marginTop: 6 }}>同步 .agents</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Integrate ---------- */
function IntegrateView({ onMsg }: { onMsg: (m: string) => void }) {
  const [groups, setGroups] = useState<IntegrateGroup[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const load = async () => {
    const r = await api<{ groups: IntegrateGroup[] }>('/integrate/preview', { method: 'POST', body: JSON.stringify({}) });
    setGroups(r.groups);
    const init: Record<string, string> = {};
    for (const g of r.groups) {
      if (g.candidates.some((c) => c.inRepo)) {
        init[g.name] = g.candidates.find((c) => c.inRepo)!.id;
      } else if (g.candidates.length > 0) init[g.name] = g.candidates[0].id;
    }
    setSel(init);
  };
  useEffect(() => { load(); }, []);
  const apply = async () => {
    const decisions = groups.map((g) => sel[g.name] ? { name: g.name, selectId: sel[g.name] } : { name: g.name, skip: true });
    const r = await api<{ results: { name: string; adopted: boolean; reason?: string }[] }>('/integrate', { method: 'POST', body: JSON.stringify({ decisions }) });
    onMsg(`收编完成: ${r.results.filter((x) => x.adopted).length} 个，跳过 ${r.results.filter((x) => !x.adopted).length} 个`);
    load();
  };
  return (
    <div>
      <h3>技能收编（合并各来源到仓库）</h3>
      <p style={{ color: '#888', fontSize: 13 }}>同一名称存在多个来源时，选择要保留的。区分名采用 name@来源。</p>
      <button onClick={apply} style={{ marginBottom: 10 }}>应用所选收编</button>{' '}
      <button onClick={load}>刷新预览</button>
      {groups.map((g) => (
        <div key={g.name} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <b>{g.name}</b>（{g.candidates.length} 个来源）
          {g.candidates.map((c) => (
            <label key={c.id} style={{ display: 'block', fontSize: 13, margin: 2 }}>
              <input type="radio" name={g.name} checked={sel[g.name] === c.id}
                onChange={() => setSel({ ...sel, [g.name]: c.id })} />
              {c.sourceLabel} {c.inRepo ? '（已在仓库）' : '（需收编）'} · {c.dir}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Diagnostics ---------- */
function DiagView() {
  const [items, setItems] = useState<DiagItem[]>([]);
  const [config, setConfig] = useState('');
  useEffect(() => {
    api<{ config: string; items: DiagItem[] }>('/diagnose').then((d) => { setItems(d.items); setConfig(d.config); });
  }, []);
  const color = { ok: '#070', warn: '#a60', error: '#c00' };
  return (
    <div>
      <h3>诊断</h3>
      <div style={{ fontSize: 13, color: '#888' }}>config: {config}</div>
      {items.map((it) => (
        <div key={it.key} style={{ fontSize: 13, padding: 4, borderBottom: '1px solid #eee', color: color[it.status] }}>● {it.message}</div>
      ))}
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsView({ onMsg }: { onMsg: (m: string) => void }) {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [newId, setNewId] = useState(''); const [newPath, setNewPath] = useState(''); const [newLayout, setNewLayout] = useState('auto');
  const [impDirs, setImpDirs] = useState(''); const [impRepo, setImpRepo] = useState('');
  useEffect(() => {
    api<RepoView[]>('/repos').then(setRepos);
    api<SourceView[]>('/sources').then(setSources);
  }, []);
  const addRepo = async () => {
    await api('/repos', { method: 'POST', body: JSON.stringify({ id: newId, path: newPath, layout: newLayout }) });
    setNewId(''); setNewPath(''); api<RepoView[]>('/repos').then(setRepos);
  };
  const delRepo = async (id: string) => { await api(`/repos/${id}`, { method: 'DELETE' }); api<RepoView[]>('/repos').then(setRepos); };
  const addSource = async () => {
    await api('/sources', { method: 'POST', body: JSON.stringify({ id: newId + '-ext', name: newId, path: newPath, layout: 'nested', linked: true }) });
    setNewId(''); setNewPath(''); api<SourceView[]>('/sources').then(setSources);
  };
  const delSource = async (id: string) => { await api(`/sources/${id}`, { method: 'DELETE' }); api<SourceView[]>('/sources').then(setSources); };
  const runImport = async () => {
    const dirs = impDirs.split('\n').map((x) => x.trim()).filter(Boolean);
    const r = await api<ImportResult[]>('/import', { method: 'POST', body: JSON.stringify({ dirs, repoId: impRepo || undefined }) });
    onMsg(r.map((x) => `${x.source}: 导入${x.imported.length}, 跳过${x.skipped.length}`).join(' | '));
  };
  return (
    <div>
      <h3>仓库</h3>
      {repos.map((r) => <div key={r.id} style={{ fontSize: 13 }}><b>{r.id}</b> {r.path} [{r.layout}] <button onClick={() => delRepo(r.id)}>删除</button></div>)}
      <div style={{ marginTop: 6 }}>
        <input placeholder="id" value={newId} style={{ width: 90 }} onChange={(e) => setNewId(e.target.value)} />
        <input placeholder="路径(~/../skills)" value={newPath} style={{ width: 320, marginLeft: 4 }} onChange={(e) => setNewPath(e.target.value)} />
        <select value={newLayout} onChange={(e) => setNewLayout(e.target.value)}><option value="auto">auto</option><option value="flat">flat</option><option value="nested">nested</option></select>
        <button onClick={addRepo}>+ 仓库</button>
      </div>

      <h3 style={{ marginTop: 18 }}>外部来源（读取其他异构 skill 集）</h3>
      {sources.map((s) => <div key={s.id} style={{ fontSize: 13 }}><b>{s.name}</b> {s.path} [{s.layout}] {s.linked ? '(只读关联)' : ''} <button onClick={() => delSource(s.id)}>删除</button></div>)}
      <div style={{ marginTop: 6 }}>
        <input placeholder="名称" value={newId} style={{ width: 120 }} onChange={(e) => setNewId(e.target.value)} />
        <input placeholder="路径" value={newPath} style={{ width: 320, marginLeft: 4 }} onChange={(e) => setNewPath(e.target.value)} />
        <button onClick={addSource}>+ 来源</button>
      </div>

      <h3 style={{ marginTop: 18 }}>批量导入</h3>
      <textarea placeholder="每行一个 skill 目录(可含子分类)" value={impDirs} style={{ width: 520, height: 60 }} onChange={(e) => setImpDirs(e.target.value)} />
      <div>
        <input placeholder="目标仓库 id(留空用第一个)" value={impRepo} onChange={(e) => setImpRepo(e.target.value)} />
        <button onClick={runImport}>导入</button>
      </div>
    </div>
  );
}
