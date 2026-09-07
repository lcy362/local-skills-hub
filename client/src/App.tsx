import { useEffect, useState } from 'react';
import { api, StateView, AgentView, PresetView, SkillView, SyncResult, RepoView, SourceView, ProjectView, ProjectSyncResult, ImportResult, ImportPreviewItem } from './api';
import { HealthView } from './HealthView';

type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'health';

const NAV: { id: Tab; label: string; note: string }[] = [
  { id: 'library', label: '资产库', note: '全部 skill，可筛选、打标签' },
  { id: 'agents', label: 'Agent 目录', note: '把 skill 投给各 AI 编程工具' },
  { id: 'presets', label: '技能预设', note: 'skill 套餐，解放活的 agent' },
  { id: 'projects', label: '项目', note: '某代码项目专属可用的 skill' },
  { id: 'health', label: '体检中心', note: '检查配置与目录是否健康一致' },
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
            <span className="rail__link-name">
              {n.label}
              {n.id === 'library' && state && <span className="count">{state.skills.length}</span>}
              {n.id === 'agents' && <span className="count">{active.length}·活跃</span>}
            </span>
            <span className="rail__desc">{n.note}</span>
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
            <button className="btn" onClick={reload} title="重读配置与目录，只刷新页面数据，不改动任何文件">刷新</button>
            <button className="btn btn--primary" onClick={runSync} title="把资产库的 skill 立即投放到各活跃 Agent 的目录，让改动立刻生效">立即同步</button>
          </div>
        </header>
        <div className="topbar__tips">
          <span><b>刷新</b>：重读配置与目录，只刷新页面数据，不改动任何文件。</span>
          <span><b>立即同步</b>：把资产库启用的 skill 马上投放到各活跃 Agent 的目录，让改动立刻生效。</span>
        </div>
        <div className="content">
          {msg && <div className="msgbar">{msg}</div>}
          {tab === 'library' && <Library state={state} onLoad={reload} onMsg={setMsg} />}
          {tab === 'agents' && <AgentsView agents={agents} onLoad={reload} />}
          {tab === 'presets' && <PresetsView state={state} onLoad={reload} />}
          {tab === 'projects' && <ProjectsView onMsg={setMsg} />}
          {tab === 'health' && <HealthView onMsg={setMsg} refreshGlobal={reload} />}
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

async function pickFile(set: (v: string) => void) {
  try {
    const r = await api<{ path: string }>('/filesystem/pick-file', { method: 'POST' });
    if (r.path) set(r.path);
  } catch (e) { window.alert((e as Error).message); }
}

function tabDesc(t: Tab, s: StateView | null, a: AgentView[]): string {
  switch (t) {
    case 'library': return `${s?.skills.length ?? 0} 个 skill · ${new Set(s?.skills.map((x) => x.source)).size ?? 0} 个来源`;
    case 'agents': return `${a.length} 内建 agent · ${a.filter((x) => x.installed).length} 已检测`;
    case 'presets': return `${s?.presets.length ?? 0} 个预设 · ${s?.presets.filter((p) => p.active).length ?? 0} 激活`;
    case 'health': return '综合体检：Agent / 同步 / 重复 Skill / 失效软链 / 仓库 / 项目 / 标签来源';
    default: return '';
  }
}

/* ================= Library ================= */
function Library({ state, onLoad, onMsg }: { state: StateView | null; onLoad: () => void; onMsg: (m: string) => void }) {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [nId, setNId] = useState(''); const [nPath, setNPath] = useState(''); const [nIdT, setNIdT] = useState(false);
  const [iIdT, setIIdT] = useState(false);
  const idOf = (p: string) => p.trim().replace(/\/$/, '').replace(/\/skills$/, '').split(/[/\\]/).filter(Boolean).pop() ?? '';
  const [iId, setIId] = useState(''); const [iPath, setIPath] = useState(''); const [iDet, setIDet] = useState<{ layout: string; count: number; root?: string } | null>(null); const [iLayout, setILayout] = useState('flat'); const [impNote, setImpNote] = useState('');
  const [tMode, setTMode] = useState<'auto' | 'frontmatter' | 'repo-file' | 'external-file'>('auto');
  const [tFile, setTFile] = useState('');
  const tagOpts: { v: typeof tMode; label: string; desc: string }[] = [
    { v: 'auto', label: '自动', desc: '沿用仓库自带标签（SKILL.md 或 marketplace.json）；无自带则为空' },
    { v: 'frontmatter', label: 'skill 文件', desc: '（推荐）在每个 SKILL.md frontmatter 顶层 tags 里维护' },
    { v: 'repo-file', label: '仓库内文件', desc: '仓库内单独标签文件（默认 .claude-plugin/marketplace.json，走 Claude Plugin 的 plugins/keywords 结构，可另填路径）' },
    { v: 'external-file', label: '仓库外文件', desc: '仓库外单独标签文件，同样走 Claude Plugin 的 plugins/keywords 结构，需填写绝对路径' },
  ];
  const buildTags = (): { mode: 'frontmatter' | 'repo-file' | 'external-file'; file?: string } | undefined => tMode === 'auto' ? undefined : { mode: tMode, file: tFile.trim() || undefined };
  const [tagDraft, setTagDraft] = useState<Record<string, { mode: string; file: string }>>({});
  const tagModeLabel: Record<string, string> = { 'auto': '自动', 'frontmatter': 'skill 文件', 'repo-file': '仓库内文件', 'external-file': '仓库外文件' };
  const saveRepoTags = async (repoId: string) => {
    const d = tagDraft[repoId] ?? { mode: 'auto', file: '' };
    const tags = d.mode === 'auto' ? null : { mode: d.mode, file: d.file.trim() || undefined };
    await api(`/repos/${encodeURIComponent(repoId)}`, { method: 'PUT', body: JSON.stringify({ tags }) });
    refreshRepos(); onLoad();
  };
  const clearRepoTags = async (repoId: string) => { await api(`/repos/${encodeURIComponent(repoId)}`, { method: 'PUT', body: JSON.stringify({ tags: null }) }); refreshRepos(); onLoad(); };
  const [imp, setImp] = useState<Record<string, string>>({});
  const [showRepos, setShowRepos] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<'list' | 'card'>('card');
  const [srcSel, setSrcSel] = useState<string[]>([]);
  const [tagSel, setTagSel] = useState<string[]>([]);
  const [srcSingle, setSrcSingle] = useState(false);
  const [tagSingle, setTagSingle] = useState(false);
  const toggleSel = (sel: string[], v: string, single: boolean) =>
    sel.includes(v) ? (single ? [] : sel.filter((x) => x !== v)) : (single ? [v] : [...sel, v]);
  const refreshRepos = async () => { await api<RepoView[]>('/repos').then(setRepos); onLoad(); };
  useEffect(() => { api<RepoView[]>('/repos').then(setRepos); }, []);
  const setTags = async (id: string, tags: string[]) => {
    const s = state?.skills.find((x) => x.id === id);
    const repo = s ? repos.find((r) => r.id === s.source) : undefined;
    if (repo && !repo.tags) {
      onMsg(`仓库「${repo.id}」尚未配置标签管理方式，标签将仅存本地（config）。建议到「已有仓库」中为该仓库配置标签来源，才能持久化到仓库载体。`);
    }
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
  const createRepo = async () => { const id = nId.trim() || idOf(nPath); if (!id || !nPath.trim()) { onMsg('请填写仓库路径'); return; } try { await api('/repos', { method: 'POST', body: JSON.stringify({ id, path: nPath.trim(), layout: 'flat', tags: buildTags() }) }); setNId(''); setNPath(''); setNIdT(false); refreshRepos(); } catch (e) { onMsg((e as Error).message); } };
  const detect = async () => { if (!iPath.trim()) { setImpNote('请先填写目录路径'); return; } setImpNote('识别中…'); setIDet(null); try { const r = await api<{ layout: string; count: number; root: string }>('/repos/detect', { method: 'POST', body: JSON.stringify({ path: iPath.trim() }) }); setIDet(r); setILayout(r.layout); setImpNote(r.count ? `已识别 <b>${r.layout}</b> 布局，含 ${r.count} 个 skill` : '该目录未发现 skill，请确认路径'); } catch (e) { setImpNote((e as Error).message); } };
  const importRepo = async () => { if (!iDet) { setImpNote('请先点击「识别布局」并确认后再导入'); return; } const id = iId.trim() || idOf(iPath); if (!id || !iPath.trim()) { setImpNote('请填写目录路径'); return; } try { await api('/repos', { method: 'POST', body: JSON.stringify({ id, path: iPath.trim(), layout: iLayout, root: iDet.root, tags: buildTags() }) }); onMsg(`已导入仓库 ${id}（layout: ${iLayout}）`); setIId(''); setIPath(''); setIIdT(false); setIDet(null); setImpNote(''); refreshRepos(); } catch (e) { setImpNote((e as Error).message); } };
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
  const sources = Array.from(new Set(skills.map((s) => s.source)));
  const allTags = Array.from(new Set(skills.flatMap((s) => s.tags))).sort();
  const filtered = skills.filter((s) =>
    (srcSel.length === 0 || srcSel.includes(s.source)) &&
    (tagSel.length === 0 || tagSel.some((t) => s.tags.includes(t)))
  );
  const skillMeta = (s: SkillView) => (
    <>
      <div className="row__title">{s.name}<span className="badge badge--off">@{s.source}</span></div>
      <div className="row__note">{s.description || '（无描述）'}</div>
      <div className="skill-tags">
        {s.tags.map((t) => <button key={t} className="tag" onClick={() => delTag(s.id, t)}>{t} ✕</button>)}
        <QuickTag onAdd={(t) => addTag(s.id, t)} />
      </div>
    </>
  );
  return (
    <>
      {/* 资产列表 = 页面主体 */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">资产 <em className="count">{filtered.length}</em></h2>
          <span className="panel__hint">你掌握的 skill 全集：可切换 列表/卡片，按来源与标签筛选</span>
          <div className="seg" role="group" aria-label="展示样式">
            <button className={`seg__opt${view === 'list' ? ' is-on' : ''}`} onClick={() => setView('list')}>☰ 列表</button>
            <button className={`seg__opt${view === 'card' ? ' is-on' : ''}`} onClick={() => setView('card')}>▦ 卡片</button>
          </div>
          <div className="panel__actions">
            <button className="btn" onClick={() => setShowRepos(true)}>已有仓库{repos.length > 0 && ` · ${repos.length}`}</button>
            <button className="btn btn--primary" onClick={() => setShowAdd(true)}>＋ 新增仓库</button>
          </div>
        </div>
        <div className="filterbar">
          <div className="facet">
            <div className="facet__head">
              <span className="facet__label">来源</span>
              <div className="seg seg--sm" role="group" aria-label="来源选择模式">
                <button className={`seg__opt${srcSingle ? ' is-on' : ''}`} onClick={() => setSrcSingle(true)}>单选</button>
                <button className={`seg__opt${!srcSingle ? ' is-on' : ''}`} onClick={() => setSrcSingle(false)}>多选</button>
              </div>
            </div>
            <div className="facet__opts">
              <button className={`chip${srcSel.length === 0 ? ' is-on' : ''}`} onClick={() => setSrcSel([])}>全部</button>
              {sources.map((s) => (
                <button key={s} className={`chip${srcSel.includes(s) ? ' is-on' : ''}`} onClick={() => setSrcSel((prev) => toggleSel(prev, s, srcSingle))}>{s}</button>
              ))}
            </div>
          </div>
          <div className="facet">
            <div className="facet__head">
              <span className="facet__label">标签</span>
              <div className="seg seg--sm" role="group" aria-label="标签选择模式">
                <button className={`seg__opt${tagSingle ? ' is-on' : ''}`} onClick={() => setTagSingle(true)}>单选</button>
                <button className={`seg__opt${!tagSingle ? ' is-on' : ''}`} onClick={() => setTagSingle(false)}>多选</button>
              </div>
            </div>
            <div className="facet__opts">
              <button className={`chip${tagSel.length === 0 ? ' is-on' : ''}`} onClick={() => setTagSel([])}>全部</button>
              {allTags.map((t) => (
                <button key={t} className={`chip${tagSel.includes(t) ? ' is-on' : ''}`} onClick={() => setTagSel((prev) => toggleSel(prev, t, tagSingle))}>{t}</button>
              ))}
            </div>
          </div>
        </div>
        {filtered.length === 0 && <div className="empty">没有匹配的 skill。可调整筛选，或点右上角「＋ 新增仓库」新建/导入仓库；已有 skill 可用「收编」合并进来。</div>}
        {view === 'list' && filtered.map((s) => (
          <div className="row" key={s.id}>
            <div className="row__main">{skillMeta(s)}</div>
          </div>
        ))}
        {view === 'card' && (
          <div className="grid-card">
            {filtered.map((s) => (
              <div className="card" key={s.id}>
                <div className="card__inner">{skillMeta(s)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已有仓库 - 弹窗 */}
      {showRepos && (
        <Modal title="已有仓库" hint="SKILL 唯一事实源" onClose={() => setShowRepos(false)}>
          <div style={{ margin: '0 0 10px', padding: '8px 10px', background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--accent)' }}>🛡 关于标签管理</b><br />
            <b style={{ color: 'var(--accent)' }}>推荐：用 Skill 文件顶层 tags。</b>
            标签写在每个 SKILL.md 的 frontmatter 顶层，被 Claude Code、agentskills.io 等 40+ 工具原生读取，随 skill 随 git 一并版本化，可移植性最好。<br />
            <b style={{ color: 'var(--accent)' }}>也允许：仓库内/仓库外文件（Claude Plugin 方式）。</b>
            两者都走 plugins/keywords 结构、理由一致——把你自己对 skill 的管理信息与外部 skill 库本体分离开（例如 GitHub 下载的仓库 SKILL.md 是别人的内容，不宜写入自己的归类）。仓库内文件默认 .claude-plugin/marketplace.json 就近归档；仓库外文件可任意选址、彻底分开存放。<br />
            <span style={{ opacity: 0.8 }}>未配置的仓库，标签仅存本地 config，不落盘到仓库载体。</span>
          </div>
          {repos.length === 0 && <div className="empty">尚未配置仓库。点「＋ 新增仓库」新建或导入。</div>}
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
              {(() => { const d = tagDraft[r.id] ?? { mode: r.tags?.mode ?? 'auto', file: r.tags?.file ?? '' }; const editing = tagDraft[r.id] !== undefined; return (
                <div className="repo__tags">
                  <div className="formline" style={{ margin: '8px 0 0', alignItems: 'center' }}>
                    <span className="repo__import-label" style={{ margin: 0 }}>标签来源：</span>
                    <span className="badge">{r.tags ? tagModeLabel[r.tags.mode] : '未配置（存本地 config）'}</span>
                    {!editing && (
                      <button className="btn btn--ghost btn--sm" onClick={() => setTagDraft({ ...tagDraft, [r.id]: d })}>{r.tags ? '修改' : '配置'}</button>
                    )}
                  </div>
                  {editing && (
                    <>
                      <div className="formline" style={{ marginTop: 6 }}>
                        {tagOpts.map((o) => (
                          <button key={o.v} className={`chip${d.mode === o.v ? ' is-on' : ''}`} onClick={() => setTagDraft({ ...tagDraft, [r.id]: { ...d, mode: o.v } })}>{o.label}</button>
                        ))}
                      </div>
                      {(d.mode === 'repo-file' || d.mode === 'external-file') && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input className="field" style={{ flex: 1 }} placeholder={d.mode === 'external-file' ? '仓库外标签文件绝对路径（Claude Plugin plugins/keywords 结构）' : '仓库内标签文件（JSON 留空默认 .claude-plugin/marketplace.json）'} value={d.file} onChange={(e) => setTagDraft({ ...tagDraft, [r.id]: { ...d, file: e.target.value } })} />
                          {d.mode === 'external-file' && <button className="btn btn--ghost" onClick={() => pickFile((v) => setTagDraft({ ...tagDraft, [r.id]: { ...d, file: v } }))}>📁 选择文件…</button>}
                        </div>
                      )}
                      <div className="formline" style={{ marginTop: 8 }}>
                        <button className="btn btn--primary btn--sm" onClick={() => { saveRepoTags(r.id); setTagDraft((p) => { const c = { ...p }; delete c[r.id]; return c; }); }}>保存</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => clearRepoTags(r.id)}>清除配置</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setTagDraft((p) => { const c = { ...p }; delete c[r.id]; return c; })}>取消</button>
                      </div>
                    </>
                  )}
                </div>
              ); })()}
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
        </Modal>
      )}

      {/* 新增仓库 - 弹窗 */}
      {showAdd && (
        <Modal title="新增仓库" hint="新建空仓库，或导入已有目录 / 第三方库" onClose={() => setShowAdd(false)}>
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
          {/* 标签管理方式（仅仓库未自带时需手动指定） */}
          <div className="subcard">
            <div className="subcard__head"><span className="step">★</span>标签管理方式<span className="panel__hint">选择标签的唯一来源；选「自动」则沿用仓库自带（若无自带则为空）</span></div>
            <div className="formline">
              {tagOpts.map((o) => (
                <button key={o.v} className={`chip${tMode === o.v ? ' is-on' : ''}`} onClick={() => setTMode(o.v)}>{o.label}</button>
              ))}
            </div>
            <div className="panel__hint" style={{ marginTop: 6, opacity: 0.8 }}>{tagOpts.find((o) => o.v === tMode)!.desc}</div>
            {(tMode === 'repo-file' || tMode === 'external-file') && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="field" style={{ flex: 1 }} placeholder={tMode === 'external-file' ? '仓库外标签文件绝对路径（必填，Claude Plugin plugins/keywords 结构）' : '仓库内标签文件（JSON 留空默认 .claude-plugin/marketplace.json）'} value={tFile} onChange={(e) => setTFile(e.target.value)} />
                {tMode === 'external-file' && <button className="btn btn--ghost" onClick={() => pickFile(setTFile)}>📁 选择文件…</button>}
              </div>
            )}
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--accent)' }}>🛡 推荐：用 Skill 文件顶层 tags。</b>
              这是最贴合开源生态、也最有希望统一生态的方式：标签写在每个 SKILL.md 的 frontmatter 顶层，会被 Claude Code、agentskills.io 等 40+ 工具原生读取，随 skill 目录移动、随 git 一并版本化，可移植性最好，不依赖任何特定平台。
              <br /><b style={{ color: 'var(--accent)' }}>也允许：仓库内/仓库外文件（采用 Claude Plugin 方式）。</b>
              两者都走 Claude 生态的 plugins/keywords 结构、理由一致——<b>把你自己对 skill 的管理信息，与外部 skill 库本体分离开</b>。例如从 GitHub 下载一个 skill 仓库时，里面的 SKILL.md 是别人的内容、还会随上游更新；你对这批 skill 的归类分类不想写进那些文件。放到<b>仓库内</b>文件（默认 .claude-plugin/marketplace.json，Claude 生态也在用）就近归档；或放到<b>仓库外</b>的任意文件，让标签与仓库本体彻底分开存放。本地归类与外部本体互不干扰。
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, hint, onClose, children }: { title: string; hint?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          {hint && <span className="panel__hint">{hint}</span>}
          <button className="btn btn--ghost btn--sm modal__close" onClick={onClose}>✕ 关闭</button>
        </div>
        <div className="modal__body">{children}</div>
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
        <h2 className="panel__title">Agent 目录</h2>
        <span className="panel__hint">你在资产库激活的 skill 会被投放/软链到这些 AI 编程工具自己的 skill 目录。活跃 {agents.filter((a) => a.active).length} · 已检测 {agents.filter((a) => a.installed).length} / 内建 {agents.length}</span>
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
            <button className="btn btn--ghost btn--sm" onClick={() => toggleMode(a.key, a.sync)}
              title={a.sync === 'symlink'
                ? '当前为软链：每个 skill 在 agent 目录建一个目录软链，指向资产库本体，改动即时生效且不占多余空间'
                : '当前为复制：把每个 skill 本体复制到 agent 目录，独立可改、但复制多份'} >
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
        <h2 className="panel__title">技能预设</h2>
        <span className="panel__hint">把一组常用 skill 打包成「套餐」，激活后立即投放到活跃的 Agent</span>
        <div className="panel__actions"><button className="btn" onClick={add}>＋ 新建套餐</button></div>
      </div>
      {state?.presets.map((p) => (
          <div className={`row${p.active ? ' is-active' : ''}`} key={p.name}>
            <div className="row__main">
              <div className="row__title">
                {p.name}
                {p.active ? <span className="badge badge--state">激活中</span> : <span className="badge badge--off">未激活</span>}
                <span className="row__note">{p.skills.length} 个 skill</span>
              </div>
              <div className="row__note">{p.skills.join('、') || '（空套餐：勾选下方 skill 加入）'}</div>
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
    onMsg(`复制 ${r.copied.join(',') || '—'} · 移除 ${r.removed.length} · 共享软链 ${r.agentLinks.filter((x) => x.created.length).length} 个 agent（每个 agent 将项目 skill 目录整体软链指向 .agents/skills）`);
    reload();
  };
  const toggleTag = async (i: number, t: string) => {
    const pv = projects[i]; if (!pv) return;
    const tags = pv.tags.includes(t) ? pv.tags.filter((x) => x !== t) : [...pv.tags, t];
    await api(`/projects/${i}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }); reload();
  };
  return (
    <div className="panel">
      <div className="panel__head"><h2 className="panel__title">项目</h2><span className="panel__hint">登记某个代码项目路径 + 标签后，带相同标签的 skill 会被复制进项目的 .agents，实现"只在这项目里可用"</span></div>
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
          <div className="row__actions"><button className="btn btn--sm" onClick={() => sync(i)} title="把匹配标签的 skill 复制到本项目 .agents/skills，并将各 agent 的项目 skill 目录整体软链指向它（每个 agent 仅一条目录级软链）">同步 .agents</button></div>
        </div>
      ))}
    </div>
  );
}
