import { useEffect, useState } from 'react';
import { api, StateView, AgentView, PresetView, SkillView, SyncResult, RepoView, SourceView, ProjectView, IntegrateGroup, Candidate, DiagItem, ProjectSyncResult, ImportResult, ImportPreviewItem } from './api';

type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'integrate' | 'diag';

const NAV: { id: Tab; label: string }[] = [
  { id: 'library', label: '资产库' },
  { id: 'agents', label: 'Agents' },
  { id: 'presets', label: 'Presets' },
  { id: 'projects', label: '项目' },
  { id: 'integrate', label: '收编' },
  { id: 'diag', label: '诊断' },
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
          {tab === 'library' && <Library state={state} onLoad={reload} onMsg={setMsg} />}
          {tab === 'agents' && <AgentsView agents={agents} onLoad={reload} />}
          {tab === 'presets' && <PresetsView state={state} onLoad={reload} />}
          {tab === 'projects' && <ProjectsView onMsg={setMsg} />}
          {tab === 'integrate' && <IntegrateView onMsg={setMsg} />}
          {tab === 'diag' && <DiagView />}
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
function Library({ state, onLoad, onMsg }: { state: StateView | null; onLoad: () => void; onMsg: (m: string) => void }) {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [filter, setFilter] = useState('');
  const [nId, setNId] = useState(''); const [nPath, setNPath] = useState(''); const [nIdT, setNIdT] = useState(false);
  const [iIdT, setIIdT] = useState(false);
  const idOf = (p: string) => p.trim().replace(/\/$/, '').replace(/\/skills$/, '').split(/[/\\]/).filter(Boolean).pop() ?? '';
  const [iId, setIId] = useState(''); const [iPath, setIPath] = useState(''); const [iDet, setIDet] = useState<{ layout: string; count: number; root?: string } | null>(null); const [iLayout, setILayout] = useState('flat'); const [impNote, setImpNote] = useState('');
  const [imp, setImp] = useState<Record<string, string>>({});
  const refreshRepos = async () => { await api<RepoView[]>('/repos').then(setRepos); onLoad(); };
  useEffect(() => { api<RepoView[]>('/repos').then(setRepos); }, []);
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
  const createRepo = async () => { const id = nId.trim() || idOf(nPath); if (!id || !nPath.trim()) { onMsg('请填写仓库路径'); return; } try { await api('/repos', { method: 'POST', body: JSON.stringify({ id, path: nPath.trim(), layout: 'flat' }) }); setNId(''); setNPath(''); setNIdT(false); refreshRepos(); } catch (e) { onMsg((e as Error).message); } };
  const detect = async () => { if (!iPath.trim()) { setImpNote('请先填写目录路径'); return; } setImpNote('识别中…'); setIDet(null); try { const r = await api<{ layout: string; count: number; root: string }>('/repos/detect', { method: 'POST', body: JSON.stringify({ path: iPath.trim() }) }); setIDet(r); setILayout(r.layout); setImpNote(r.count ? `已识别 <b>${r.layout}</b> 布局，含 ${r.count} 个 skill` : '该目录未发现 skill，请确认路径'); } catch (e) { setImpNote((e as Error).message); } };
  const importRepo = async () => { if (!iDet) { setImpNote('请先点击「识别布局」并确认后再导入'); return; } const id = iId.trim() || idOf(iPath); if (!id || !iPath.trim()) { setImpNote('请填写目录路径'); return; } try { await api('/repos', { method: 'POST', body: JSON.stringify({ id, path: iPath.trim(), layout: iLayout, root: iDet.root }) }); onMsg(`已导入仓库 ${id}（layout: ${iLayout}）`); setIId(''); setIPath(''); setIIdT(false); setIDet(null); setImpNote(''); refreshRepos(); } catch (e) { setImpNote((e as Error).message); } };
  const runImp = async (repoId: string) => {
    const dirs = (imp[repoId] ?? '').split('\n').map((x) => x.trim()).filter(Boolean); if (!dirs.length) return;
    const r = await api<ImportResult[]>('/import', { method: 'POST', body: JSON.stringify({ dirs, repoId }) });
    const imported = r.reduce((n, x) => n + x.imported.length, 0);
    const skipped = r.reduce((n, x) => n + x.skipped.length, 0);
    const detail = r.map((x) => `${x.source}：新增 ${x.imported.length} · 去重跳过 ${x.skipped.length}`).join('  ·  ');
    onMsg(`导入完成 ✓ 共新增 ${imported} 个 skill${skipped ? `，去重跳过 ${skipped} 个` : ''}　${detail}`);
    setImp({ ...imp, [repoId]: '' }); setImpPrev({ ...impPrev, [repoId]: null });
    refreshRepos();
  };
  const [impPrev, setImpPrev] = useState<Record<string, ImportPreviewItem[] | null>>({});
  const [impBusy, setImpBusy] = useState<Record<string, boolean>>({});
  const detectImp = async (repoId: string) => {
    const dirs = (imp[repoId] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!dirs.length) { setImpPrev({ ...impPrev, [repoId]: null }); onMsg('请先填写至少一个要导入的目录路径'); return; }
    setImpBusy({ ...impBusy, [repoId]: true }); setImpPrev({ ...impPrev, [repoId]: null });
    try {
      const pre = await api<ImportPreviewItem[]>('/import/preview', { method: 'POST', body: JSON.stringify({ dirs }) });
      setImpPrev({ ...impPrev, [repoId]: pre });
      const bad = pre.filter((x) => x.error || x.count === 0);
      onMsg(bad.length ? `${bad.length} 个路径未发现可导入 skill，请确认后重试` : `${pre.reduce((n, x) => n + x.count, 0)} 个 skill 待导入，确认后执行复制`);
    } catch (e) { setImpPrev({ ...impPrev, [repoId]: null }); onMsg((e as Error).message); }
    setImpBusy({ ...impBusy, [repoId]: false });
  };
  const resetImp = (repoId: string) => { setImp({ ...imp, [repoId]: '' }); setImpPrev({ ...impPrev, [repoId]: null }); };
  const skills = state?.skills ?? [];
  const filtered = filter ? skills.filter((s) => s.source === filter) : skills;
  const sources = Array.from(new Set(skills.map((s) => s.source)));
  return (
    <>
      {/* ===== 已有仓库 ===== */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">已有仓库</h2>
          {repos.length > 0 && <span className="badge badge--off">{repos.length} 个</span>}
          <span className="panel__hint">SKILL 唯一事实源</span>
        </div>
        {repos.length === 0 && <div className="empty">尚未配置仓库。在下方向下「新增仓库」新建空仓库，或导入已有目录。</div>}
        {repos.map((r) => (
          <div className="repo" key={r.id}>
            <div className="repo__top">
              <div className="repo__main">
                <div className="repo__title">
                  {r.id}
                  <span className="badge badge--off">[{r.layout}]</span>
                  <span className="repo__path">{r.path}</span>
                </div>
              </div>
              <button className="btn btn--danger btn--sm" onClick={async () => { await api(`/repos/${r.id}`, { method: 'DELETE' }); refreshRepos(); }}>删除</button>
            </div>
            <div className="repo__import">
              <div className="repo__import-label">向此仓库导入其他目录的 skill（每行一个目录，可含子分类）</div>
              <div className="formline">
                <textarea className="field field--area" style={{ flex: 1, minHeight: 54 }} placeholder="每行一个目录路径，可含子分类" value={imp[r.id] ?? ''} onChange={(e) => { setImp({ ...imp, [r.id]: e.target.value }); setImpPrev({ ...impPrev, [r.id]: null }); }} />
                <button className="btn btn--ghost" onClick={() => pickDir((v) => { const cur = (imp[r.id] ?? '').trim(); setImp({ ...imp, [r.id]: cur ? cur + '\n' + v : v }); setImpPrev({ ...impPrev, [r.id]: null }); })}>📁 文件夹…</button>
                <button className="btn btn--ghost" disabled={impBusy[r.id]} onClick={() => detectImp(r.id)}>① 识别</button>
              </div>
              {impPrev[r.id] && (
                <div className="repo__detect">
                  {impPrev[r.id]!.map((p) => (
                    <div className="repo__detect-row" key={p.source}>
                      <span className="repo__detect-path">{p.source}</span>
                      {p.error || p.count === 0
                        ? <span className="repo__detect-status is-bad">{p.error || '未发现 skill'}</span>
                        : <span className="repo__detect-status is-ok">{p.layout} · {p.count} 个</span>}
                    </div>
                  ))}
                  <div className="formline" style={{ margin: '8px 0 0' }}>
                    <button className="btn btn--primary" onClick={() => runImp(r.id)}>② 确认导入</button>
                    <button className="btn btn--ghost" onClick={() => resetImp(r.id)}>清空 &amp; 重填</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ===== 新增仓库 ===== */}
      <div className="panel panel--new">
        <div className="panel__head">
          <h2 className="panel__title">新增仓库</h2>
          <span className="panel__hint">新建空仓库，或导入已有目录 / 第三方库</span>
        </div>
        <div className="subcard">
          <div className="subcard__head"><span className="step">1</span>新建空仓库<span className="panel__hint">标准 flat 布局</span></div>
          <div className="formline">
            <input className="field" style={{ width: 110 }} placeholder="id（默认=目录名）" value={nId} onChange={(e) => { setNId(e.target.value); setNIdT(true); }} />
            <input className="field" style={{ flex: 1, minWidth: 180 }} placeholder="仓库路径（可留空取目录名）" value={nPath} onChange={(e) => { setNPath(e.target.value); if (!nIdT) setNId(idOf(e.target.value)); }} />
            <button className="btn btn--ghost" onClick={() => pickDir((v) => { setNPath(v); if (!nIdT) setNId(idOf(v)); })}>📁 文件夹…</button>
            <button className="btn btn--primary" onClick={createRepo}>＋ 新建仓库</button>
          </div>
        </div>
        <div className="subcard">
          <div className="subcard__head"><span className="step">2</span>导入已有目录 / 第三方库<span className="panel__hint">识别布局 → 确认导入</span></div>
          <div className="formline">
            <input className="field" style={{ width: 110 }} placeholder="id（默认=目录名）" value={iId} onChange={(e) => { setIId(e.target.value); setIIdT(true); }} />
            <input className="field" style={{ flex: 1, minWidth: 180 }} placeholder="已有 skill 的目录路径" value={iPath} onChange={(e) => { setIPath(e.target.value); if (!iIdT) setIId(idOf(e.target.value)); if (iDet) { setIDet(null); setImpNote('路径已变更，请重新识别布局'); } }} />
            <button className="btn btn--ghost" onClick={() => pickDir((v) => { setIPath(v); if (!iIdT) setIId(idOf(v)); if (iDet) { setIDet(null); setImpNote('路径已变更，请重新识别布局'); } })}>📁 文件夹…</button>
            <button className="btn btn--primary" onClick={detect}>① 识别布局</button>
          </div>
          <div className="formline" style={{ marginTop: 8 }}>
            {iDet ? (
              <div className="formline" style={{ margin: 0, alignItems: 'center', gap: 8 }}>
                <span className="panel__hint">已识别：<b>{iDet.layout}</b> · {iDet.count} 个 skill，布局可改：</span>
                <select className="field" style={{ width: 110 }} value={iLayout} onChange={(e) => setILayout(e.target.value)}>
                  <option value="flat">flat</option><option value="nested">nested</option>
                </select>
                <button className="btn btn--primary" onClick={importRepo}>② 导入为仓库</button>
              </div>
            ) : (
              <span className="panel__hint" style={{ opacity: 0.75 }}>→ 请先填写 id 与路径，点击「① 识别布局」完成确认后方可导入</span>
            )}
          </div>
          {impNote && <div className="panel__hint" style={{ marginTop: 8, fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: impNote }} />}
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">资产 {filtered.length}</h2>
          <select className="field" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部来源</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {filtered.length === 0 && <div className="empty">暂无 skill。先在「新增仓库」新建或导入仓库；已有 skill 可用「收编」合并进来。</div>}
        {filtered.map((s) => (
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
    </>
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
