import { useEffect, useState } from 'react';
import { api, StateView, AgentView, PresetView, SkillView, SyncResult, RepoView, SourceView, ProjectView, IntegrateGroup, Candidate, DiagItem, ProjectSyncResult, ImportResult } from './api';

type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'integrate' | 'diag' | 'settings';

const NAV: { id: Tab; label: string }[] = [
  { id: 'library', label: '资产库' },
  { id: 'agents', label: 'Agents' },
  { id: 'presets', label: 'Presets' },
  { id: 'projects', label: '项目' },
  { id: 'integrate', label: '收编' },
  { id: 'diag', label: '诊断' },
  { id: 'settings', label: '设置' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [state, setState] = useState<StateView | null>(null);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [msg, setMsg] = useState('');

  const reload = async () => {
    try {
      const [s, a] = await Promise.all([api<StateView>('/state'), api<AgentView[]>('/agents')]);
      setState(s); setAgents(a); setMsg('');
    } catch (e) { setMsg((e as Error).message); }
  };
  useEffect(() => { reload(); }, []);

  const runSync = async () => {
    setMsg('同步中…');
    try {
      const res = await api<SyncResult[]>('/sync', { method: 'POST', body: JSON.stringify({}) });
      setMsg(res.map((x) => `${x.agent} +${x.created.length} −${x.removed.length} ✕${x.failed.length}`).join('  ·  ') || '无活跃 agent');
    } catch (e) { setMsg((e as Error).message); }
    reload();
  };

  const active = state?.activeAgents ?? [];
  return (
    <div className="hub">
      <nav className="rail">
        <div className="rail__brand"><span className="rail__mark">Skills<b>Hub</b></span><span className="rail__tag">local</span></div>
        {NAV.map((n) => (
          <button key={n.id} className={`rail__link${tab === n.id ? ' is-active' : ''}`} onClick={() => setTab(n.id)}>
            {n.label}
            {n.id === 'library' && state && <span className="count">{state.skills.length}</span>}
            {n.id === 'agents' && <span className="count">{active.length}·活跃</span>}
          </button>
        ))}
        <div className="rail__foot">
          <span><span className={`stagedot${active.length ? '' : ' is-paused'}`} /> {active.length ? `${active.length} agent 活跃` : '未设活跃 agent'}</span>
          <span>server 8787 · cfg ~/.skills-hub</span>
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="topbar__title">{NAV.find((n) => n.id === tab)?.label}</h1>
            <div className="topbar__sub">{tabDesc(tab, state, agents)}</div>
          </div>
          <div className="topbar__actions">
            <button className="btn" onClick={reload}>刷新</button>
            <button className="btn btn--primary" onClick={runSync}>立即同步</button>
          </div>
        </header>
        <div className="content">
          {msg && <div className="msgbar">{msg}</div>}
          {tab === 'library' && <Library state={state} onLoad={reload} />}
          {tab === 'agents' && <AgentsView agents={agents} onLoad={reload} />}
          {tab === 'presets' && <PresetsView state={state} onLoad={reload} />}
          {tab === 'projects' && <ProjectsView onMsg={setMsg} />}
          {tab === 'integrate' && <IntegrateView onMsg={setMsg} />}
          {tab === 'diag' && <DiagView />}
          {tab === 'settings' && <SettingsView onMsg={setMsg} />}
        </div>
      </main>
    </div>
  );
}

async function pickDir(set: (v: string) => void) {
  try {
    const r = await api<{ path: string }>('/filesystem/pick', { method: 'POST' });
    if (r.path) set(r.path);
  } catch (e) { window.alert((e as Error).message); }
}

function tabDesc(t: Tab, s: StateView | null, a: AgentView[]): string {
  switch (t) {
    case 'library': return `${s?.skills.length ?? 0} 个 skill · ${new Set(s?.skills.map((x) => x.source)).size ?? 0} 个来源`;
    case 'agents': return `${a.length} 内建 agent · ${a.filter((x) => x.installed).length} 已检测`;
    case 'presets': return `${s?.presets.length ?? 0} 个预设 · ${s?.presets.filter((p) => p.active).length ?? 0} 激活`;
    case 'integrate': return '按名归并各来源 skill 到仓库';
    default: return '';
  }
}

/* ================= Library ================= */
function Library({ state, onLoad }: { state: StateView | null; onLoad: () => void }) {
  const setTags = async (id: string, tags: string[]) => {
    await api(`/skills/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tags }) }); onLoad();
  };
  const addTag = async (id: string, tag: string) => {
    const s = state?.skills.find((x) => x.id === id); if (!s) return;
    if (tag && !s.tags.includes(tag)) setTags(id, [...s.tags, tag]);
  };
  const delTag = async (id: string, tag: string) => {
    const s = state?.skills.find((x) => x.id === id); if (!s) return;
    setTags(id, s.tags.filter((t) => t !== tag));
  };
  if (!state || state.skills.length === 0) return <div className="empty">仓库为空。到「设置」添加仓库，再到「收编」合并现有 skill。</div>;
  return (
    <div className="grid2">
      <div>
        <div className="panel__hint" style={{ marginBottom: 8 }}>{state.skills.length} SKILLS</div>
        {state.skills.map((s) => (
          <div className="row" key={s.id}>
            <div className="row__main">
              <div className="row__title">{s.name}<span className="badge badge--off">@{s.source}</span></div>
              <div className="row__note">{s.description || '（无描述）'}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {s.tags.map((t) => <button key={t} className="tag" onClick={() => delTag(s.id, t)}>{t} ✕</button>)}
                <QuickTag onAdd={(t) => addTag(s.id, t)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function QuickTag({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return <input className="field" style={{ width: 90 }} placeholder="+标签" value={v}
    onChange={(e) => setV(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} />;
}

/* ================= Agents ================= */
function AgentsView({ agents, onLoad }: { agents: AgentView[]; onLoad: () => void }) {
  const [only, setOnly] = useState<'all' | 'detected'>('all');
  const shown = only === 'all' ? agents : agents.filter((a) => a.installed);
  const setActive = async (key: string) => {
    const cur = await api<string[]>('/activeAgents');
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    await api(`/activeAgents`, { method: 'PUT', body: JSON.stringify(next) }); onLoad();
  };
  const toggleMode = async (key: string, sync: string) => {
    await api(`/agents/${key}`, { method: 'PUT', body: JSON.stringify({ sync: sync === 'symlink' ? 'copy' : 'symlink' }) }); onLoad();
  };
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Agents</h2>
        <span className="panel__hint">活跃 {agents.filter((a) => a.active).length} · 已检测 {agents.filter((a) => a.installed).length} / 内建 {agents.length}</span>
        <div className="panel__actions">
          <button className={`btn btn--sm${only === 'all' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => setOnly('all')}>全部</button>
          <button className={`btn btn--sm${only === 'detected' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => setOnly('detected')}>已检测 {agents.filter((a) => a.installed).length}</button>
        </div>
      </div>
      {shown.map((a) => (
        <div className={`row${a.active ? ' is-active' : ''}`} key={a.key}>
          <div className="row__main">
            <div className="row__title">
              {a.name}
              {a.active && <span className="dot dot--good" />}
              {a.sharedWith.length > 0 && <span className="badge badge--shared" title={`此目录被 ${a.sharedWith.join('、')} 共用`}>共用目录：{a.sharedWith.join('、')}</span>}
              {a.alsoUsedBy && a.alsoUsedBy.length > 0 && <span className="badge badge--family" title={`同一目录亦被 ${a.alsoUsedBy.join('、')} 读取`}>亦用于：{a.alsoUsedBy.join('、')}</span>}
              {!a.installed && <span className="badge badge--off">未安装</span>}
            </div>
            <div className="row__meta">{a.globalDir} · {a.sync}</div>
          </div>
          <div className="row__actions">
            <button className={`btn ${a.active ? 'btn--primary' : ''} btn--sm`} onClick={() => setActive(a.key)}>
              {a.active ? '取消活跃' : '设为活跃'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => toggleMode(a.key, a.sync)}>
              {a.sync === 'symlink' ? '切换为复制' : '切换为软链'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= Presets ================= */
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
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Presets</h2>
        <span className="panel__hint">激活后实时同步到活跃 agent</span>
        <div className="panel__actions"><button className="btn" onClick={add}>＋ 新建</button></div>
      </div>
      {state?.presets.map((p) => (
        <div className={`row${p.active ? ' is-active' : ''}`} key={p.name}>
          <div className="row__main">
            <div className="row__title">
              {p.name}
              {p.active ? <span className="badge badge--state">激活中</span> : <span className="badge badge--off">未激活</span>}
              <span className="row__note">{p.skills.length} skills</span>
            </div>
            <div className="row__note">{p.skills.join('、') || '（空，在下框勾选 skill）'}</div>
            <div className="checklist" style={{ marginTop: 8 }}>
              {state?.skills.slice(0, 300).map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={p.skills.includes(s.id)} onChange={(e) => member(p.name, s.id, e.target.checked)} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="row__actions">
            <button className={`btn ${p.active ? 'btn--ghost' : 'btn--primary'} btn--sm`} onClick={() => activate(p.name, !p.active)}>
              {p.active ? '取消激活' : '激活'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= Projects ================= */
function ProjectsView({ onMsg }: { onMsg: (m: string) => void }) {
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
    onMsg(`复制 ${r.copied.join(',') || '—'} · 移除 ${r.removed.length} · 代理软链 ${r.agentLinks.filter((x) => x.created.length).length} 个`);
    reload();
  };
  const toggleTag = async (i: number, t: string) => {
    const pv = projects[i]; if (!pv) return;
    const tags = pv.tags.includes(t) ? pv.tags.filter((x) => x !== t) : [...pv.tags, t];
    await api(`/projects/${i}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }); reload();
  };
  return (
    <div className="panel">
      <div className="panel__head"><h2 className="panel__title">项目级 Skill</h2><span className="panel__hint">标签关联 · 复制本体入 .agents</span></div>
      <div className="formline">
        <input className="field" style={{ flex: 1, minWidth: 240 }} placeholder="项目绝对路径" value={path} onChange={(e) => setPath(e.target.value)} />
        <button className="btn btn--ghost" onClick={() => pickDir((v) => { setPath(v); })} title="系统选择文件夹">📁 文件夹…</button>
        <input className="field" style={{ width: 180 }} placeholder="标签(逗号分隔)" value={tag} onChange={(e) => setTag(e.target.value)} />
        <button className="btn btn--primary" onClick={add}>登记项目</button>
      </div>
      {projects.map((p, i) => (
        <div className="row" key={p.path} style={{ marginTop: 10 }}>
          <div className="row__main">
            <div className="row__title">{p.path}{p.hasAgents && <span className="badge badge--state">.agents</span>}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.tags.map((t) => <button key={t} className="tag" onClick={() => toggleTag(i, t)}>{t} ✕</button>)}
              {skills.filter((s) => s.tags.some((t) => p.tags.includes(t))).map((s) =>
                <span key={s.id} className="tag tag--matched">✓ {s.name}</span>)}
            </div>
          </div>
          <div className="row__actions"><button className="btn btn--sm" onClick={() => sync(i)}>同步 .agents</button></div>
        </div>
      ))}
    </div>
  );
}

/* ================= Integrate ================= */
function IntegrateView({ onMsg }: { onMsg: (m: string) => void }) {
  const [groups, setGroups] = useState<IntegrateGroup[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const load = async () => {
    const r = await api<{ groups: IntegrateGroup[] }>('/integrate/preview', { method: 'POST', body: JSON.stringify({}) });
    setGroups(r.groups);
    const init: Record<string, string> = {};
    for (const g of r.groups) {
      if (g.candidates.some((c) => c.inRepo)) init[g.name] = g.candidates.find((c) => c.inRepo)!.id;
      else if (g.candidates.length > 0) init[g.name] = g.candidates[0].id;
    }
    setSel(init);
  };
  useEffect(() => { load(); }, []);
  const apply = async () => {
    const decisions = groups.map((g) => sel[g.name] ? { name: g.name, selectId: sel[g.name] } : { name: g.name, skip: true });
    const r = await api<{ results: { name: string; adopted: boolean; reason?: string }[] }>('/integrate', { method: 'POST', body: JSON.stringify({ decisions }) });
    onMsg(`收编 ${r.results.filter((x) => x.adopted).length} · 跳过 ${r.results.filter((x) => !x.adopted).length}`);
    load();
  };
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__title">技能收编</h2>
        <span className="panel__hint">{groups.length} 组 · 同名多来源需选保留项</span>
        <div className="panel__actions">
          <button className="btn" onClick={load}>刷新预览</button>
          <button className="btn btn--primary" onClick={apply}>应用所选收编</button>
        </div>
      </div>
      {groups.map((g) => (
        <div className="igroup" key={g.name}>
          <div className="igroup__name">{g.name}<span className="badge badge--off">{g.candidates.length} 来源</span></div>
          <div className="igroup__opts">
            {g.candidates.map((c) => (
              <label key={c.id} className={`igroup__opt${sel[g.name] === c.id ? ' is-sel' : ''}`}>
                <input type="radio" name={g.name} checked={sel[g.name] === c.id} onChange={() => setSel({ ...sel, [g.name]: c.id })} />
                {c.sourceLabel} {c.inRepo ? '· 已在仓库' : '· 需收编'}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= Diagnostics ================= */
function DiagView() {
  const [items, setItems] = useState<DiagItem[]>([]);
  const [config, setConfig] = useState('');
  useEffect(() => { api<{ config: string; items: DiagItem[] }>('/diagnose').then((d) => { setItems(d.items); setConfig(d.config); }); }, []);
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__title">诊断</h2>
        <span className="panel__hint">{config}</span>
      </div>
      {items.map((it) => (
        <div className="diagrow" key={it.key}>
          <span className={`dot dot--${it.status === 'ok' ? 'good' : it.status === 'warn' ? 'warn' : 'bad'}`} />
          <span className={`status-${it.status}`}>{it.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ================= Settings ================= */
function SettingsView({ onMsg }: { onMsg: (m: string) => void }) {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [newId, setNewId] = useState(''); const [newPath, setNewPath] = useState(''); const [newLayout, setNewLayout] = useState('auto');
  const [impDirs, setImpDirs] = useState(''); const [impRepo, setImpRepo] = useState('');
  useEffect(() => { api<RepoView[]>('/repos').then(setRepos); api<SourceView[]>('/sources').then(setSources); }, []);
  const addRepo = async (kind: 'repo' | 'source') => {
    if (!newId || !newPath) return;
    if (kind === 'repo') {
      await api('/repos', { method: 'POST', body: JSON.stringify({ id: newId, path: newPath, layout: newLayout }) });
      api<RepoView[]>('/repos').then(setRepos);
    } else {
      await api('/sources', { method: 'POST', body: JSON.stringify({ id: newId + '-ext', name: newId, path: newPath, layout: 'nested', linked: true }) });
      api<SourceView[]>('/sources').then(setSources);
    }
    setNewId(''); setNewPath('');
  };
  const runImport = async () => {
    const dirs = impDirs.split('\n').map((x) => x.trim()).filter(Boolean);
    const r = await api<ImportResult[]>('/import', { method: 'POST', body: JSON.stringify({ dirs, repoId: impRepo || undefined }) });
    onMsg(r.map((x) => `${x.source}：导入 ${x.imported.length} · 跳过 ${x.skipped.length}`).join('  ·  '));
  };
  return (
    <div className="grid2">
      <div className="panel">
        <div className="panel__head"><h2 className="panel__title">仓库</h2><span className="panel__hint">SKILL 本体唯一事实源</span></div>
        {repos.map((r) => <div className="row" key={r.id}><div className="row__main"><div className="row__title">{r.id}<span className="badge badge--off">[{r.layout}]</span></div><div className="row__meta">{r.path}</div></div><div className="row__actions"><button className="btn btn--danger btn--sm" onClick={async () => { await api(`/repos/${r.id}`, { method: 'DELETE' }); api<RepoView[]>('/repos').then(setRepos); }}>删除</button></div></div>)}
        <div className="formblock">
          <div className="formline">
            <input className="field" style={{ width: 110 }} placeholder="id" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <input className="field" style={{ flex: 1, minWidth: 200 }} placeholder="路径 (含 skills/)"
              value={newPath} onChange={(e) => setNewPath(e.target.value)} />
            <button className="btn btn--ghost" onClick={() => pickDir((v) => setNewPath(v))} title="系统选择文件夹">📁 文件夹…</button>
            <select className="field" value={newLayout} onChange={(e) => setNewLayout(e.target.value)}>
              <option value="auto">auto</option><option value="flat">flat</option><option value="nested">nested</option>
            </select>
            <button className="btn btn--primary" onClick={() => addRepo('repo')}>＋ 仓库</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head"><h2 className="panel__title">外部来源</h2><span className="panel__hint">读取异构库 · 只读关联</span></div>
        {sources.map((s) => (
          <div className="row" key={s.id}>
            <div className="row__main"><div className="row__title">{s.name}{s.linked && <span className="badge badge--state">只读</span>}</div><div className="row__meta">{s.path} · [{s.layout}]</div></div>
            <div className="row__actions"><button className="btn btn--danger btn--sm" onClick={async () => { await api(`/sources/${s.id}`, { method: 'DELETE' }); api<SourceView[]>('/sources').then(setSources); }}>删除</button></div>
          </div>
        ))}
        <div className="formblock">
          <div className="formline">
            <input className="field" style={{ width: 120 }} placeholder="名称" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <input className="field" style={{ flex: 1, minWidth: 200 }} placeholder="路径" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
            <button className="btn btn--ghost" onClick={() => pickDir((v) => setNewPath(v))} title="系统选择文件夹">📁 文件夹…</button>
            <button className="btn btn--primary" onClick={() => addRepo('source')}>＋ 来源</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head"><h2 className="panel__title">批量导入</h2><span className="panel__hint">嵌套目录 → 仓库</span></div>
        <textarea className="field field--area" style={{ width: '100%', minHeight: 90 }} placeholder="每行一个 skill 目录（可含子分类）" value={impDirs} onChange={(e) => setImpDirs(e.target.value)} />
        <div className="formline">
          <input className="field" style={{ width: 180 }} placeholder="目标仓库 id（留空=第一个）" value={impRepo} onChange={(e) => setImpRepo(e.target.value)} />
          <button className="btn btn--primary" onClick={runImport}>导入</button>
        </div>
      </div>
    </div>
  );
}
