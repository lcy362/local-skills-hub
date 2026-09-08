import { useEffect, useState } from 'react';
import { api, StateView, AgentView, AgentSkillView, AgentSkillsResp, AddableSkill, PresetView, SkillView, SyncResult, RepoView, SourceView, ProjectView, ProjectSyncResult, ImportResult, ImportPreviewItem, AgentCollectPreview, CollectResult } from './api';
import { HealthView } from './HealthView';

type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'health';

const NAV: { id: Tab; label: string; note: string }[] = [
  { id: 'library', label: '资产库', note: '全部 skill，可筛选、打标签' },
  { id: 'agents', label: 'AI 工具', note: '把技能装到各 AI 编程工具' },
  { id: 'presets', label: '技能套餐', note: '把一组技能打包，批量装给各 AI 工具' },
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
    setMsg('正在生效…');
    try {
      const res = await api<SyncResult[]>('/sync', { method: 'POST', body: JSON.stringify({}) });
      setMsg(res.map((x) => `${x.agent} 装上 ${x.created.length} · 移除 ${x.removed.length}${x.failed.length ? ` · 失败 ${x.failed.length}` : ''}`).join('  ·  ') || '没有已开启自动同步的 AI 工具');
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
            <button className="btn btn--primary" onClick={runSync} title="把技能库选中的技能，立即装到已开启自动同步的 AI 工具，让改动立刻生效">立即生效</button>
          </div>
        </header>
        <div className="topbar__tips">
          <span><b>刷新</b>：重新读取配置与目录清单，只更新页面数据，不改动任何文件。</span>
          <span><b>立即生效</b>：把技能库选中的技能马上装到已开启自动同步的 AI 工具，让改动立刻生效。</span>
        </div>
        <div className="content">
          {msg && <div className="msgbar">{msg}</div>}
          {tab === 'library' && <Library state={state} onLoad={reload} onMsg={setMsg} />}
          {tab === 'agents' && <AgentsView agents={agents} state={state} onLoad={reload} onMsg={setMsg} />}
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
    case 'agents': return `共支持 ${a.length} 个 AI 工具 · ${a.filter((x) => x.installed).length} 个已找到技能目录`;
    case 'presets': return `${s?.presets.length ?? 0} 个套餐 · ${s?.presets.filter((p) => p.active).length ?? 0} 个已开启`;
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
  const toggleSel = (sel: string[], v: string) =>
    sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
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
  // 从 agent 收集归拢 skill 到仓库（仅复制，不动 agent）
  const [collectOpen, setCollectOpen] = useState<Record<string, boolean>>({});
  const [collectPrev, setCollectPrev] = useState<Record<string, AgentCollectPreview[] | null>>({});
  const [collectBusy, setCollectBusy] = useState<Record<string, boolean>>({});
  const collectable = (a: AgentCollectPreview) => a.items.filter((x) => !x.exists).map((x) => x.name);
  const openCollect = async (repoId: string) => {
    setCollectOpen({ ...collectOpen, [repoId]: true });
    try {
      const v = await api<AgentCollectPreview[]>(`/repos/${encodeURIComponent(repoId)}/collect/preview`);
      setCollectPrev({ ...collectPrev, [repoId]: v });
    } catch (e) { onMsg((e as Error).message); }
  };
  const runCollect = async (repoId: string, agentKey: string) => {
    if (collectBusy[repoId]) return;
    const list = collectPrev[repoId]?.find((a) => a.agentKey === agentKey);
    if (!list) return;
    setCollectBusy({ ...collectBusy, [repoId]: true });
    try {
      const r = await api<CollectResult>(`/repos/${encodeURIComponent(repoId)}/collect`, { method: 'POST', body: JSON.stringify({ agentKey, names: collectable(list) }) });
      onMsg(`从 ${list.agentName} 收集完成 ✓ 新增 ${r.collected.length} 个${r.skipped.length ? `，去重跳过 ${r.skipped.length} 个` : ''}（agent 内的列表未改动）`);
      setCollectPrev({ ...collectPrev, [repoId]: null }); setCollectOpen({ ...collectOpen, [repoId]: false });
      refreshRepos();
    } catch (e) { onMsg((e as Error).message); }
    setCollectBusy({ ...collectBusy, [repoId]: false });
  };
  const skills = state?.skills ?? [];
  const sources = Array.from(new Set(skills.map((s) => s.source)));
  const allTags = Array.from(new Set(skills.flatMap((s) => s.tags))).sort();
  const tagConfigured = repos.filter((r) => r.tags).length;
  const tagUnconfigured = repos.length - tagConfigured;
  const srcOf = (src: string) => repos.find((r) => r.id === src);
  const tagSrcText = (m: string) => ({ frontmatter: 'skill 文件 frontmatter', ['repo-file']: '仓库内文件', ['external-file']: '仓库外文件' } as Record<string, string>)[m] ?? '自动';
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
      {(() => { const rp = srcOf(s.source); if (!rp) return null; const cfg = rp.tags; return (
        <button className={`skill-tsrc${cfg ? '' : ' is-warn'}`} onClick={() => setShowRepos(true)} title="点击为所属仓库配置标签管理方式">
          {cfg ? `标签源：${tagSrcText(cfg.mode)}` : '⚠ 标签暂存本地，点击配置标签来源'}
        </button>
      ); })()}
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
            <button className={`btn${tagUnconfigured ? ' is-warn' : ''}`} onClick={() => setShowRepos(true)}>★ 标签管理{repos.length ? ` ${tagConfigured}/${repos.length}` : ''}{tagUnconfigured ? ' · ⚠' : ''}</button>
            <button className="btn" onClick={() => setShowRepos(true)}>已有仓库{repos.length > 0 && ` · ${repos.length}`}</button>
            <button className="btn btn--primary" onClick={() => setShowAdd(true)}>＋ 新增仓库</button>
          </div>
        </div>
        <div className="filterbar">
          <div className="facet">
            <div className="facet__head">
              <span className="facet__label">来源</span>
              <span className="panel__hint">多选</span>
            </div>
            <div className="facet__opts">
              <button className={`chip${srcSel.length === 0 ? ' is-on' : ''}`} onClick={() => setSrcSel([])}>全部</button>
              {sources.map((s) => (
                <button key={s} className={`chip${srcSel.includes(s) ? ' is-on' : ''}`} onClick={() => setSrcSel((prev) => toggleSel(prev, s))}>{s}</button>
              ))}
            </div>
          </div>
          <div className="facet">
            <div className="facet__head">
              <span className="facet__label">标签</span>
              <span className="panel__hint">多选</span>
            </div>
            <div className="facet__opts">
              <button className={`chip${tagSel.length === 0 ? ' is-on' : ''}`} onClick={() => setTagSel([])}>全部</button>
              {allTags.map((t) => (
                <button key={t} className={`chip${tagSel.includes(t) ? ' is-on' : ''}`} onClick={() => setTagSel((prev) => toggleSel(prev, t))}>{t}</button>
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
              <div className="repo__import">
                <div className="repo__import-label">从 agent 收集归拢 skill（仅复制进仓库，不动 agent 里的列表）</div>
                {!collectOpen[r.id] ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => openCollect(r.id)}>⬇ 从 agent 收集…</button>
                ) : collectPrev[r.id] == null ? (
                  <span className="panel__hint">正在扫描已安装 agent…</span>
                ) : collectPrev[r.id]!.length === 0 ? (
                  <span className="panel__hint">未发现已安装的 agent / skill</span>
                ) : (
                  collectPrev[r.id]!.map((a) => {
                    const names = collectable(a);
                    return (
                      <div className="repo__collect" key={a.agentKey}>
                        <div className="formline" style={{ alignItems: 'center' }}>
                          <b>{a.agentName}</b>
                          <span className="panel__hint" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.installedDir}</span>
                          <button className="btn btn--primary btn--sm" disabled={collectBusy[r.id] || names.length === 0} onClick={() => runCollect(r.id, a.agentKey)}>收集 {names.length} 个</button>
                        </div>
                        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                          {a.items.map((it) => (
                            <li key={`${a.agentKey}:${it.name}`} className="repo__detect-row">
                              <span className="repo__detect-path">{it.name}</span>
                              {it.exists
                                ? <span className="repo__detect-status is-bad">已存在 · 去重跳过</span>
                                : <span className="repo__detect-status is-ok">可收集</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
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
function AgentDetail({ a, presets, onLoad, onMsg, onBack }: { a: AgentView; presets: PresetView[]; onLoad: () => void; onMsg: (m: string) => void; onBack: () => void }) {
  const [skills, setSkills] = useState<AgentSkillView[] | null>(null);
  const [addable, setAddable] = useState<AddableSkill[]>([]);
  const [active, setActive] = useState(a.active);
  const [mode, setMode] = useState<'preset' | 'manual'>(a.mode ?? 'manual');
  const [presetSel, setPresetSel] = useState(a.preset ?? '');
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [collTarget, setCollTarget] = useState('');
  const [view, setView] = useState<'list' | 'card'>('card');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, rs] = await Promise.all([
      api<AgentSkillsResp>(`/agents/${encodeURIComponent(a.key)}/skills`),
      api<RepoView[]>('/repos'),
    ]);
    setSkills(r.skills); setAddable(r.addable); setActive(r.active);
    setRepos(rs); if (!collTarget && rs.length) setCollTarget(rs[0].id);
  };
  useEffect(() => { load(); }, [a.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const refetch = async () => { onLoad(); await load(); };
  const putOver = (patch: Record<string, unknown>) => api(`/agents/${a.key}`, { method: 'PUT', body: JSON.stringify(patch) });
  const idOf = (s: AgentSkillView) => s.skillId ?? s.name;

  const saveMode = async (m: 'preset' | 'manual', preset?: string) => {
    setBusy(true); setMode(m);
    await putOver({ mode: m, preset: m === 'preset' ? (preset ?? presetSel) : undefined });
    setPresetSel(m === 'preset' ? (preset ?? presetSel) : presetSel);
    setBusy(false); onLoad(); await load();
    onMsg(m === 'manual' ? `${a.name}：已切换为「手动挑选」` : `${a.name}：已${preset ?? presetSel ? `改为跟随套餐「${preset ?? presetSel}」` : '改为跟随全局已选套餐'}`);
  };

  // 开关技能 = 增删「期望」。套餐基准成员关闭→记入 explicitOff；其余→直接从 explicitOn 移除
  const toggleSkill = async (s: AgentSkillView, on: boolean) => {
    const id = idOf(s); const name = s.name;
    setBusy(true);
    if (!on) {
      if (s.reason === 'preset' && s.disableVia === 'off') {
        const off = new Set(a.explicitOff ?? []); off.add(id);
        await putOver({ explicitOff: [...off] });
      } else {
        const onSet = new Set(a.explicitOn ?? []); onSet.delete(id); onSet.delete(name);
        await putOver({ explicitOn: [...onSet] });
      }
    } else if (s.reason === 'preset' && s.offOverride) {
      const off = new Set(a.explicitOff ?? []); off.delete(id); off.delete(name);
      await putOver({ explicitOff: [...off] });
    } else {
      const onSet = new Set(a.explicitOn ?? []); onSet.add(id);
      await putOver({ explicitOn: [...onSet] });
    }
    setBusy(false); await refetch();
  };

  const addFromLibrary = async (id: string) => {
    setBusy(true);
    const onSet = new Set(a.explicitOn ?? []); onSet.add(id);
    await putOver({ explicitOn: [...onSet] });
    setBusy(false);
    onMsg('已加入期望（额外开启），点「立即生效」即可部署到技能目录'); await refetch();
  };

  const doSync = async () => {
    setBusy(true);
    const r = await api<SyncResult>(`/agents/${a.key}/sync`, { method: 'POST', body: JSON.stringify({}) });
    setBusy(false);
    onMsg(`${a.name} 已生效：装上 ${r.created.length} · 移除 ${r.removed.length}${r.failed.length ? ` · 失败 ${r.failed.length}` : ''}`);
    await refetch();
  };

  const delSkill = async (s: AgentSkillView) => {
    const label = s.reason === 'own' ? 'AI 工具自带的技能' : '已不在计划内的技能（残留）';
    if (!confirm(`删除${label}「${s.name}」？\n\n将删除目录 ${a.globalDir}/${s.name}\n删除后需重新安装才能恢复。`)) return;
    await api(`/agents/${a.key}/skills/${encodeURIComponent(s.name)}`, { method: 'DELETE' });
    onMsg(`已删除技能：${s.name}`); await refetch();
  };

  const collect = async (s: AgentSkillView) => {
    if (!collTarget) { onMsg('请先选择一个目标资产库，再点「收编」'); return; }
    setBusy(true);
    const r = await api<CollectResult>(`/repos/${encodeURIComponent(collTarget)}/collect`, { method: 'POST', body: JSON.stringify({ agentKey: a.key, names: [s.name] }) });
    setBusy(false);
    onMsg(r.collected.length ? `已把「${s.name}」复制进资产库「${collTarget}」` : `「${s.name}」在资产库「${collTarget}」已存在`);
    await refetch();
  };
  const mergeDup = async (s: AgentSkillView) => {
    if (!collTarget) { onMsg('请先选择一个目标资产库，再点「合并去重」'); return; }
    setBusy(true);
    const r = await api<CollectResult>(`/repos/${encodeURIComponent(collTarget)}/collect`, { method: 'POST', body: JSON.stringify({ agentKey: a.key, names: [s.name] }) });
    await api(`/agents/${a.key}/skills/${encodeURIComponent(s.name)}`, { method: 'DELETE' });
    setBusy(false);
    onMsg(r.collected.length ? `已把「${s.name}」收编进资产库「${collTarget}」并删除本工具内的自带副本` : `资产库「${collTarget}」已有同名技能，已删除本工具内的自带副本`);
    await refetch();
  };

  const setActiveBtn = async () => {
    const cur = await api<string[]>('/activeAgents');
    const next = cur.includes(a.key) ? cur.filter((x) => x !== a.key) : [...cur, a.key];
    await api(`/activeAgents`, { method: 'PUT', body: JSON.stringify(next) });
    onMsg(next.includes(a.key) ? `${a.name} 已开启自动同步（改动套餐或手动挑选会自动生效）` : `${a.name} 已暂停自动同步（改动后需手动点「立即生效」才生效）`);
    await refetch();
  };

  const counts = skills ? {
    wanted: skills.filter((x) => x.wanted).length,
    pend: skills.filter((x) => x.wanted && !x.present).length,
    resid: skills.filter((x) => !x.wanted && x.present && x.source === 'managed').length,
    own: skills.filter((x) => x.reason === 'own').length,
  } : null;

  return (
    <div className="panel">
      <div className="panel__head">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← 返回</button>
        <h2 className="panel__title">{a.name}</h2>
        <span className="panel__hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.globalDir} · {active ? '自动同步中' : '未自动同步'} · 安装方式：{a.sync === 'symlink' ? '链接' : '复制'}</span>
        <div className="panel__actions">
          <button className={`btn btn--sm ${active ? 'btn--ghost' : 'btn--primary'}`} onClick={setActiveBtn}>{active ? '暂停自动同步' : '开启自动同步'}</button>
          <button className="btn btn--sm" onClick={doSync} disabled={busy}>立即生效</button>
        </div>
      </div>

      <div className="dict-block">
        <div className="dict-label">技能怎么来</div>
        <div className="seg">
          <button className={`btn btn--sm${mode === 'preset' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => saveMode('preset')} disabled={busy}>跟随技能套餐</button>
          <button className={`btn btn--sm${mode === 'manual' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => saveMode('manual')} disabled={busy}>手动挑选</button>
          <span className={`seg-hint${active ? '' : ' is-idle'}`}>{active ? '已开启自动同步：改动立即生效' : '未开启自动同步：改动后需点「立即生效」才生效'}</span>
        </div>
        {mode === 'preset' && (
          <div className="formline" style={{ marginTop: 8 }}>
            <select className="field" value={presetSel} onChange={(e) => saveMode('preset', e.target.value)} disabled={busy} title="跟随的套餐；留空则跟随所有已选中的套餐">
              <option value="">跟随全局已选中的技能套餐</option>
              {presets.map((p) => <option key={p.name} value={p.name}>{p.name}{p.active ? '（已开启）' : ''}</option>)}
            </select>
            <span className="panel__hint">套餐成员的技能会自动装上；你仍可在下方对个别技能单独开/关。</span>
          </div>
        )}
        {mode === 'manual' && (
          <div className="panel__hint" style={{ marginTop: 8 }}>手动挑选：下方勾选 = 装到技能目录，取消 = 移走。跟任何套餐无关。</div>
        )}
      </div>

      <div className="dict-block">
        <div className="dict-label">技能清单
          {counts && <span className="row__note">  · 期望 {counts.wanted} / 待部署 {counts.pend} / 残留 {counts.resid} / 自带 {counts.own}</span>}
        </div>
        <div className="formline" style={{ flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="展示样式">
            <button className={`seg__opt${view === 'list' ? ' is-on' : ''}`} onClick={() => setView('list')}>☰ 列表</button>
            <button className={`seg__opt${view === 'card' ? ' is-on' : ''}`} onClick={() => setView('card')}>▦ 卡片</button>
          </div>
          <select className="field" style={{ width: 200 }} value="" disabled={busy} onChange={(e) => { if (e.target.value) addFromLibrary(e.target.value); }} title="从资产库额外开启一个还没装的技能">
            <option value="">＋ 从资产库添加…</option>
            {addable.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.repo}）</option>)}
          </select>
        </div>
        <div className="formline" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {repos.length === 0
            ? <span className="panel__hint" style={{ margin: 0 }}>还没有资产库；自带技能的「收编 / 合并去重」需先到「资产库」新建。</span>
            : <>
              <span className="panel__hint" style={{ margin: 0 }}>自带技能可「收编到资产库」或「合并去重」，目标资产库：</span>
              <select className="field" style={{ width: 200 }} value={collTarget} onChange={(e) => setCollTarget(e.target.value)}>
                {repos.map((rp) => <option key={rp.id} value={rp.id}>{rp.id}</option>)}
              </select>
            </>}
        </div>
        {skills == null ? <span className="panel__hint">加载中…</span> : skills.length === 0 ? (
          <span className="panel__hint">这个 AI 工具的技能目录是空的，还没有任何技能。可从上方「从资产库添加」开始。</span>
        ) : view === 'list' ? (
          <div className="checklist" style={{ gridTemplateColumns: '1fr', maxHeight: 360 }}>
            {skills.map((s) => <AgentSkillRow key={s.name} s={s} busy={busy} onToggle={(on) => toggleSkill(s, on)} onCollect={() => collect(s)} onMerge={() => mergeDup(s)} onDel={() => delSkill(s)} />)}
          </div>
        ) : (
          <div className="grid-card" style={{ maxHeight: 440, overflow: 'auto', alignItems: 'start' }}>
            {skills.map((s) => <AgentSkillRow key={s.name} s={s} busy={busy} onToggle={(on) => toggleSkill(s, on)} onCollect={() => collect(s)} onMerge={() => mergeDup(s)} onDel={() => delSkill(s)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* 单个 agent 技能卡片：与资产库一致的 标题+描述 展示；软链展示目标。
   操作只由「状态 + 来源」决定，不再两两交叉判断 */
function AgentSkillRow({ s, busy, onToggle, onCollect, onMerge, onDel }: {
  s: AgentSkillView; busy: boolean;
  onToggle: (on: boolean) => void; onCollect: () => void; onMerge: () => void; onDel: () => void;
}) {
  const title = s.title || s.name;
  const reasonBadge =
    s.reason === 'own' ? <span className="badge badge--off">自带</span>
    : s.reason === 'preset'
      ? (s.offOverride ? <span className="badge badge--off">套餐·已停用</span> : <span className="badge badge--family">来自套餐{s.preset ? `「${s.preset}」` : ''}</span>)
      : <span className="badge badge--state">手动开启</span>;
  const storeBadge =
    s.store === 'pending' ? <span className="badge badge--off">待部署</span>
    : s.store === 'symlink' ? <span className="badge badge--shared" title={s.linkTarget ? `指向：${s.linkTarget}` : '软链，资产库更新即生效'}>软链</span>
    : s.store === 'copy' ? <span className="badge badge--off" title="把资产库技能复制了一份到该工具目录">复制到目录</span>
    : <span className="badge badge--off" title="技能本体就是该工具技能目录里的真实目录">本体目录</span>;
  const stateBadge =
    s.wanted && s.present ? <span className="badge badge--state">已启用</span>
    : s.wanted ? <span className="badge badge--warn">待部署</span>
    : s.offOverride ? <span className="badge badge--off">已停用</span>
    : s.source === 'owned' ? <span className="badge badge--state">在用</span>
    : <span className="badge badge--off">残留</span>;

  const actions = s.reason === 'own' ? (
    <>
      <button className="btn btn--ghost btn--sm" onClick={onCollect} disabled={busy} title="把这份技能复制进资产库">收编</button>
      <button className="btn btn--ghost btn--sm" onClick={onMerge} disabled={busy} title="复制进资产库并删除本目录副本，避免重复">合并去重</button>
      <button className="btn btn--ghost btn--sm" onClick={onDel} disabled={busy}>删除</button>
    </>
  ) : s.wanted ? (
    <label className="sw" title={s.present ? '关闭：从技能目录移除（移出期望）' : '取消：不再需要，移除期望'}>
      <input type="checkbox" checked disabled={busy} onChange={() => onToggle(false)} />
    </label>
  ) : s.offOverride ? (
    <>
      <button className="btn btn--ghost btn--sm" onClick={() => onToggle(true)} title="重新启用（移出停用列表）">重新启用</button>
      <button className="btn btn--ghost btn--sm" onClick={onDel} disabled={busy}>删除</button>
    </>
  ) : (
    <button className="btn btn--ghost btn--sm" onClick={onDel} disabled={busy} title="清理残留目录">清理</button>
  );

  return (
    <div className="ss-card" data-own={s.reason === 'own' || undefined}>
      <div className="ss-card__head">
        <span className="ss-card__title" title={s.dir}>{title}</span>
        <span className="ss-card__sub">@{s.name}{s.preset ? ` · ${s.preset}` : ''}</span>
      </div>
      <div className="skill-tags" style={{ border: 0, paddingTop: 0 }}>
        {reasonBadge}{storeBadge}{stateBadge}
      </div>
      <div className="ss-card__desc">{s.description || '（无描述）'}</div>
      {s.store === 'symlink' && (
        <code className="ss-card__link" title="软链目标：资产库技能源的位置">→ {s.linkTarget}</code>
      )}
      <div className="ss-card__foot">
        <span className="row__note">{s.reason === 'own' ? 'AI 工具自带，不随本程序管理' : s.present ? s.dir : '尚未部署，点「立即生效」装上'}</span>
        <div className="row__actions">{actions}</div>
      </div>
    </div>
  );
}

function AgentsView({ agents, state, onLoad, onMsg }: { agents: AgentView[]; state: StateView | null; onLoad: () => void; onMsg: (m: string) => void }) {
  const [only, setOnly] = useState<'all' | 'detected'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const shown = only === 'all' ? agents : agents.filter((a) => a.installed);
  const modeBadge = (a: AgentView) => (a.mode ?? 'manual') === 'manual' ? '手动挑选' : (a.preset ? `按套餐「${a.preset}」` : '跟随全局已选套餐');
  if (sel) {
    const a = agents.find((x) => x.key === sel);
    if (a) return <AgentDetail a={a} presets={state?.presets ?? []} onLoad={onLoad} onMsg={onMsg} onBack={() => setSel(null)} />;
  }
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__title">AI 工具</h2>
        <span className="panel__hint">技能库选中的技能会装到各 AI 工具自己的技能目录。已开启自动同步 {agents.filter((a) => a.active).length} 个 · 已找到目录 {agents.filter((a) => a.installed).length} / 共支持 {agents.length} 个 · 点卡片看它有哪些技能、是自带还是本程序装的</span>
        <div className="panel__actions">
          <button className={`btn btn--sm${only === 'all' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => setOnly('all')}>全部</button>
          <button className={`btn btn--sm${only === 'detected' ? ' btn--primary' : ' btn--ghost'}`} onClick={() => setOnly('detected')}>已找到目录 {agents.filter((a) => a.installed).length}</button>
        </div>
      </div>
      <div className="grid-card">
        {shown.map((a) => (
          <button key={a.key} className="card__inner agent-card" onClick={() => setSel(a.key)} aria-label={`查看 ${a.name} 的技能`}>
            <div className="row__title">
              {a.name}
              {a.active && <span className="dot dot--good" title="已开启自动同步" />}
            </div>
            <div className="row__note" style={{ minHeight: 'auto' }}>{a.installed ? '已找到技能目录' : <span className="badge badge--warn">未找到</span>} · 安装方式：{a.sync === 'symlink' ? '链接' : '复制'}</div>
            <div className="row__meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.globalDir}</div>
            <div className="skill-tags" style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
              <span className={`badge ${(a.mode ?? 'manual') === 'manual' ? 'badge--state' : 'badge--shared'}`}>{modeBadge(a)}</span>
              {!a.installed && <span className="badge badge--off">未找到目录</span>}
            </div>
          </button>
        ))}
        {shown.length === 0 && <span className="panel__hint">没有符合筛选的 AI 工具。</span>}
      </div>
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
        <h2 className="panel__title">技能套餐</h2>
        <span className="panel__hint">把一组常用技能打包成「套餐」，选中后立刻装到已开启自动同步的 AI 工具</span>
        <div className="panel__actions"><button className="btn" onClick={add}>＋ 新建套餐</button></div>
      </div>
      {state?.presets.map((p) => (
          <div className={`row${p.active ? ' is-active' : ''}`} key={p.name}>
            <div className="row__main">
              <div className="row__title">
                {p.name}
                {p.active ? <span className="badge badge--state">已开启</span> : <span className="badge badge--off">未开启</span>}
                <span className="row__note">{p.skills.length} 个技能</span>
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
              {p.active ? '关闭' : '开启'}
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
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [path, setPath] = useState(''); const [tag, setTag] = useState('');
  // 支持 project 目录的 agent 才是项目可投放对象
  const projectAgents = agents.filter((a) => a.project);
  const [addAgents, setAddAgents] = useState<string[]>([]);
  const [editingAgents, setEditingAgents] = useState<Record<number, { list: string[] } | undefined>>({});
  const reload = async () => {
    const [p, s, a] = await Promise.all([
      api<ProjectView[]>('/projects'),
      api<StateView>('/state').then((x) => x.skills),
      api<AgentView[]>('/agents'),
    ]);
    setProjects(p); setSkills(s); setAgents(a);
  };
  useEffect(() => { reload(); }, []);
  const toggle = (list: string[], key: string) => list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  const add = async () => {
    if (!path.trim()) return;
    await api('/projects', { method: 'POST', body: JSON.stringify({ path: path.trim(), tags: tag.trim() ? tag.split(',').map((t) => t.trim()) : [], agents: addAgents }) });
    setPath(''); setTag(''); setAddAgents([]); reload();
  };
  const sync = async (i: number) => {
    const r = await api<ProjectSyncResult>(`/projects/${i}/sync`, { method: 'POST', body: JSON.stringify({}) });
    onMsg(`复制 ${r.copied.join(',') || '—'} · 移除 ${r.removed.length} · 软链 ${r.agentLinks.map((x) => x.agent).join(',') || '—'} 个 agent（每个 agent 将项目 skill 目录整体软链指向 .agents/skills）`);
    reload();
  };
  const toggleTag = async (i: number, t: string) => {
    const pv = projects[i]; if (!pv) return;
    const tags = pv.tags.includes(t) ? pv.tags.filter((x) => x !== t) : [...pv.tags, t];
    await api(`/projects/${i}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }); reload();
  };
  const saveAgents = async (i: number) => {
    const d = editingAgents[i]; if (!d) return;
    await api(`/projects/${i}/agents`, { method: 'PUT', body: JSON.stringify({ agents: d.list }) });
    setEditingAgents((p) => { const c = { ...p }; delete c[i]; return c; });
    reload();
  };
  const setProjectAgents = async (i: number, list: string[]) => {
    // 空 = 全部支持；否则完整覆盖
    await api(`/projects/${i}/agents`, { method: 'PUT', body: JSON.stringify({ agents: list }) });
    reload();
  };
  const agentsLabel = (p: ProjectView) => {
    if (p.agents && p.agents.length) return p.agents.map((k) => agents.find((a) => a.key === k)?.name ?? k).join('、');
    return '全部 agent';
  };
  return (
    <div className="panel">
      <div className="panel__head"><h2 className="panel__title">项目</h2><span className="panel__hint">登记某个代码项目路径 + 标签后，带相同标签的 skill 会被复制进项目的 .agents，并软链到项目支持的 agent，实现"只在这项目里可用"</span></div>
      <div className="formline">
        <input className="field" style={{ flex: 1, minWidth: 240 }} placeholder="项目绝对路径" value={path} onChange={(e) => setPath(e.target.value)} />
        <button className="btn btn--ghost" onClick={() => pickDir((v) => { setPath(v); })} title="系统选择文件夹">📁 文件夹…</button>
        <input className="field" style={{ width: 180 }} placeholder="标签(逗号分隔)" value={tag} onChange={(e) => setTag(e.target.value)} />
        <button className="btn btn--primary" onClick={add}>登记项目</button>
      </div>
      {projectAgents.length > 0 && path.trim() !== '' && (
        <div className="formline" style={{ marginTop: 4, flexWrap: 'wrap' }}>
          <span className="panel__hint" style={{ margin: 0 }}>本项目投放给哪些 agent：</span>
          {projectAgents.map((a) => (
            <button key={a.key} className={`chip${addAgents.includes(a.key) ? ' is-on' : ''}`} onClick={() => setAddAgents((prev) => toggle(prev, a.key))}>{a.name}</button>
          ))}
          {addAgents.length > 0 && <span className="row__note">（未勾选的 agent 也会全部投放；勾选任一后只投放勾选项）</span>}
        </div>
      )}
      {projects.map((p, i) => {
        const editing = editingAgents[i] !== undefined;
        return (
        <div className="row" key={p.path} style={{ marginTop: 10 }}>
          <div className="row__main">
            <div className="row__title">{p.path}{p.hasAgents && <span className="badge badge--state">.agents</span>}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.tags.map((t) => <button key={t} className="tag" onClick={() => toggleTag(i, t)}>{t} ✕</button>)}
              {skills.filter((s) => s.tags.some((t) => p.tags.includes(t))).map((s) =>
                <span key={s.id} className="tag tag--matched">✓ {s.name}</span>)}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="row__note">投放：{agentsLabel(p)}</span>
              {editing && projectAgents.map((a) => (
                <button key={a.key} className={`chip${(editingAgents[i]!.list).includes(a.key) ? ' is-on' : ''}`} onClick={() => setEditingAgents((prev) => ({ ...prev, [i]: { list: toggle(prev[i]!.list, a.key) } }))}>{a.name}</button>
              ))}
              {!editing && (
                <>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditingAgents((prev) => ({ ...prev, [i]: { list: p.agents ?? [] } }))}>编辑</button>
                  {p.agents && p.agents.length > 0 && <button className="btn btn--ghost btn--sm" onClick={() => setProjectAgents(i, [])} title="恢复为投放给全部 agent">全部</button>}
                </>
              )}
              {editing && (
                <>
                  <button className="btn btn--primary btn--sm" onClick={() => saveAgents(i)}>保存</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditingAgents((prev) => { const c = { ...prev }; delete c[i]; return c; })}>取消</button>
                </>
              )}
            </div>
          </div>
          <div className="row__actions"><button className="btn btn--sm" onClick={() => sync(i)} title="把匹配标签的 skill 复制到本项目 .agents/skills，并将本项目支持的 agent 的项目 skill 目录整体软链指向它">同步 .agents</button></div>
        </div>
        );
      })}
    </div>
  );
}
