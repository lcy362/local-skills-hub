import { useMemo, useState } from 'react';
import { api, type StateView, type RepoView, type SkillContent, type AgentCollectPreview, type ImportPreviewItem, type SkillAction } from '../api/types';
import { skillViewToCard } from '../components/skill/adapters';
import SkillList from '../components/skill/SkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import IntegrateWizard from '../components/integrate/IntegrateWizard';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import SwitchLabel from '../components/ui/SwitchLabel';
import { PathField, PathListField } from '../components/ui/PathField';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { navigate, useQueryFlag, useQueryParam, useQueryValue, useRoute } from '../state/router';

const DETAIL_ACTION: SkillAction[] = [{ kind: 'detail', label: '详情' }];

export default function Library() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const toast = useToast();
  const route = useRoute();
  const [importOpen, setImportOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [integrateOpen, setIntegrateOpen] = useState(false);

  // 详情弹层与筛选条件都写进地址，刷新后可完整复原当前页面
  const detailId = route.sub;
  const openDetail = (id: string) => navigate({ ...route, sub: id });
  const closeDetail = () => navigate({ ...route, sub: null });
  const [facet, setFacet] = useQueryValue('tag');
  const [q, setQ] = useQueryParam('q');
  const [src, setSrc] = useQueryValue('src');
  const [untaggedOnly, setUntaggedOnly] = useQueryFlag('untagged');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => s.tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [data]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => set.add(s.source));
    return [...set].sort();
  }, [data]);

  /** 每个标签下的技能数，供筛选器展示 */
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    data?.skills.forEach((s) => s.tags?.forEach((t) => { m[t] = (m[t] ?? 0) + 1; }));
    return m;
  }, [data]);

  const cards = useMemo(() => (data?.skills ?? []).map((s) => skillViewToCard(s, DETAIL_ACTION)), [data]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (facet && !c.tags.includes(facet)) return false;
      if (src && c.source !== src) return false;
      if (untaggedOnly && c.tags.length > 0) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [cards, facet, q, src, untaggedOnly]);

  const hasFilter = !!(facet || src || untaggedOnly || q.trim());
  const clearFilters = () => {
    setQ(''); setSrc(undefined); setFacet(undefined); setUntaggedOnly(false);
  };

  const detailTarget = detailId ? data?.skills.find((s) => s.id === detailId) : undefined;

  return (
    <>
      <PageHeader
        title="技能库"
        sub={data ? `共 ${data.skills.length} 个技能` : undefined}
        actions={
          <>
            <Button variant="ghost" onClick={() => setIntegrateOpen((v) => !v)}>整合向导</Button>
            <Button onClick={() => setImportOpen(true)}>导入</Button>
          </>
        }
      />

      {integrateOpen && (
        <div className="panel">
          <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
            整合向导（IM-01 / IM-02）
          </div>
          <IntegrateWizard onDone={reload} />
        </div>
      )}

      <div className="panel">
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: '搜索技能名称 / 描述' }}
          controls={
            <>
              <div className="filterbar__field">
                <FieldSelect
                  aria-label="来源"
                  value={src ?? ''}
                  onChange={(e) => setSrc(e.target.value || undefined)}
                >
                  <option value="">全部来源</option>
                  {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
                </FieldSelect>
              </div>
              <SwitchLabel checked={untaggedOnly} onChange={setUntaggedOnly}>只看未打标签</SwitchLabel>
            </>
          }
          chipGroups={[
            {
              key: 'tags',
              label: '标签',
              options: allTags.map((t) => ({ label: t, value: t, count: tagCounts[t] })),
              value: facet,
              onChange: setFacet,
            },
          ]}
          chipsToggleLabel="按标签筛选"
          chipsEmptyHint={`当前 ${data?.skills.length ?? 0} 个技能都还没有标签。打开任意技能卡片的「详情」，在标签区添加标签后即可在此按标签筛选。`}
          hasFilters={hasFilter}
          onReset={clearFilters}
        />
      </div>

      <div className="panel">
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '技能库为空', hint: '尚未导入任何技能。点击「导入」从目录导入，或在下方登记仓库/来源。', icon: '◈' }}
        >
          {() => (
            <SkillList
              title={`${hasFilter ? '筛选结果' : '全部技能'} · ${shown.length}${hasFilter ? ` / ${cards.length}` : ''}`}
              items={shown}
              onAction={(item) => openDetail(item.id)}
              onTag={(item) => openDetail(item.id)}
              onOpen={(item) => openDetail(item.id)}
            />
          )}
        </LoadingBoundary>
      </div>

      {data && (
        <div className="panel">
          <ReposAndSources repos={data.repos} sources={data.sources} reload={reload} onRegister={() => setRegisterOpen(true)} />
        </div>
      )}

      <SkillDetailModal
        id={detailTarget ? detailId : null}
        skill={detailTarget}
        allTags={allTags}
        onClose={closeDetail}
        onSaved={() => { closeDetail(); reload(); }}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} onDone={reload} />
    </>
  );
}

/* 统一管理自有仓库 + 第三方库（不按来源切分技能管理，仅作概念区分） */
function ReposAndSources({ repos, sources, reload, onRegister }: { repos: RepoView[]; sources: StateView['sources']; reload: () => void; onRegister: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [collectFor, setCollectFor] = useState<RepoView | null>(null);

  const remove = async (kind: 'repos' | 'sources', id: string) => {
    try {
      await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.push('已删除', 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(null);
      reload();
    }
  };

  const adopt = async (id: string) => {
    setBusy(`adopt:${id}`);
    try {
      const res = await api<{ imported: string[]; skipped: string[] }>(`/sources/${encodeURIComponent(id)}/adopt`, { method: 'POST', body: JSON.stringify({}) });
      toast.push(`已收编 ${res.imported.length} 个技能`, 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(null);
      reload();
    }
  };

  const items: EntityItem[] = [
    ...repos.map((repo) => ({
      id: `repo:${repo.id}`,
      title: repo.path,
      sub: <span className="mono">{repo.layout} · {repo.root ?? 'root'}</span>,
      status: <Badge tone="info">自有仓库</Badge>,
      actions: (
        <>
          <Button size="sm" variant="primary" loading={busy === repo.id} onClick={() => setCollectFor(repo)} title="从已安装 Agent 归集 skill 到本仓库">
            归集
          </Button>
          <Button size="sm" variant="danger" loading={busy === `del:${repo.id}`} onClick={() => remove('repos', repo.id)}>删除</Button>
        </>
      ),
    })),
    ...sources.map((s) => ({
      id: `source:${s.id}`,
      title: s.name || s.id,
      sub: <span className="mono">{s.path} · {s.layout}</span>,
      status: <Badge tone={s.linked ? 'accent' : 'good'}>{s.linked ? '只读引用' : '已收编'}</Badge>,
      actions: (
        <>
          {s.linked && (
            <Button size="sm" variant="primary" loading={busy === `adopt:${s.id}`} onClick={() => adopt(s.id)} title="拷贝本体进仓库并接管后续版本（EK-03）">
              收编
            </Button>
          )}
          <Button size="sm" variant="danger" loading={busy === `del:${s.id}`} onClick={() => remove('sources', s.id)}>删除</Button>
        </>
      ),
    })),
  ];

  return (
    <>
      <EntityList
        title="来源与仓库"
        items={items}
        toolbar={<Button size="sm" variant="ghost" onClick={onRegister}>登记库</Button>}
        empty={<EmptyState title="暂无来源与仓库" hint="点击「登记库」添加自有仓库或第三方技能库。" />}
      />
      <CollectModal repo={collectFor} onClose={() => setCollectFor(null)} onDone={() => { setCollectFor(null); reload(); }} />
    </>
  );
}

/** 从 Agent 归集（IM-01）：选一个已安装 Agent，把其目录里的 skill 收进仓库 */
function CollectModal({ repo, onClose, onDone }: { repo: RepoView | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, loading } = useAsync<AgentCollectPreview[]>(
    () => (repo ? api(`/repos/${encodeURIComponent(repo.id)}/collect/preview`) : Promise.resolve([])),
    [repo?.id]
  );

  const run = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const res = await api<{ collected: string[]; skipped: string[] }>(
        `/repos/${encodeURIComponent(repo.id)}/collect`,
        { method: 'POST', body: JSON.stringify({ agentKeys: picked }) }
      );
      toast.push(`已归集 ${res.collected.length} 个技能`, 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  const items: EntityItem[] = (data ?? []).map((a) => ({
    id: a.agentKey,
    title: a.agentName,
    sub: <span className="mono">{a.installedDir} · {a.items.length} 项</span>,
    toggle: (
      <span onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={picked.includes(a.agentKey)}
          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.agentKey] : p.filter((k) => k !== a.agentKey)))}
        />
      </span>
    ),
    onClick: () =>
      setPicked((p) => (p.includes(a.agentKey) ? p.filter((k) => k !== a.agentKey) : [...p, a.agentKey])),
  }));

  return (
    <Modal
      open={!!repo}
      title={repo ? `归集到 ${repo.id}` : ''}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={picked.length === 0} onClick={run}>归集</Button>
        </>
      }
    >
      {loading && <span style={{ color: 'var(--c-ink-3)' }}>扫描中…</span>}
      {!loading && (data ?? []).length === 0 && <EmptyState title="没有已安装的 Agent 可归集" />}
      <EntityList items={items} toggle={false} empty={null} />
    </Modal>
  );
}

/* 登记自有仓库 / 第三方库 的统一入口 */
function RegisterModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<'repo' | 'source'>('repo');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [layout, setLayout] = useState('auto');
  const [root, setRoot] = useState('');
  const [linked, setLinked] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (!id || !path) throw new Error('ID 与路径必填');
      if (kind === 'repo') {
        await api('/repos', { method: 'POST', body: JSON.stringify({ id, path, layout, root: root || undefined }) });
        toast.push(`已登记自有仓库 ${id}`, 'good');
      } else {
        await api('/sources', { method: 'POST', body: JSON.stringify({ id, name, path, layout, linked }) });
        toast.push(`已登记第三方库 ${id}`, 'good');
      }
      setId(''); setName(''); setPath(''); setRoot(''); setLinked(true); setLayout('auto');
      onDone(); onClose();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="登记来源与仓库"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>登记</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {(['repo', 'source'] as const).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? 'primary' : 'ghost'} onClick={() => setKind(k)}>
              {k === 'repo' ? '自有仓库' : '第三方技能库'}
            </Button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput label="ID（唯一）" placeholder="my-lib" value={id} onChange={(e) => setId(e.target.value)} />
          {kind === 'source' ? (
            <FieldInput label="名称" placeholder="第三方库" value={name} onChange={(e) => setName(e.target.value)} />
          ) : (
            <FieldSelect label="布局" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="auto">auto（自动检测）</option>
              <option value="flat">flat（扁平）</option>
              <option value="nested">nested（嵌套分类）</option>
            </FieldSelect>
          )}
        </div>
        <PathField label="路径" placeholder="/path/to/library" value={path} onChange={setPath} />
        {kind === 'repo' ? (
          <FieldInput label="root（可选）" hint="skills 根目录，缺省 <path>/skills" placeholder="skills" value={root} onChange={(e) => setRoot(e.target.value)} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', alignItems: 'flex-end' }}>
            <FieldSelect label="布局" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="auto">auto（自动检测）</option>
              <option value="nested">nested（嵌套分类）</option>
              <option value="flat">flat（扁平）</option>
            </FieldSelect>
            <label className="switch" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
              <span className="switch__track" />
              <span style={{ marginLeft: 'var(--sp-2)', color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>只读关联</span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 技能详情：SKILL.md 预览 + 标签编辑 + 来源追溯（UI-03 / TG-01 / IM-04） */
function SkillDetailModal({
  id,
  skill,
  allTags,
  onClose,
  onSaved,
}: {
  id: string | null;
  skill?: StateView['skills'][number];
  allTags: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  if (id && skill && syncedId !== id) {
    setSyncedId(id);
    setTags(skill.tags ?? []);
    setNewTag('');
  }
  if (!id && syncedId !== null) setSyncedId(null);

  const { data: content, loading } = useAsync<SkillContent>(
    () => (id ? api(`/skills/${encodeURIComponent(id)}/content`) : Promise.resolve(null as unknown as SkillContent)),
    [id]
  );

  const toggle = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const addNew = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setNewTag('');
  };

  const save = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      await api(`/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', body: JSON.stringify({ tags }) });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={!!id}
      title={skill ? `技能详情 · ${skill.name}` : ''}
      width={720}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>关闭</Button><Button variant="primary" loading={saving} onClick={save}>保存标签</Button></>}
    >
      {skill && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <Badge tone="info">{skill.source}</Badge>
            {skill.version && <Badge tone="neutral">v{skill.version}</Badge>}
            {skill.origin && <Badge tone="accent" title="来源追溯（IM-04）">来自 {skill.origin}</Badge>}
          </div>
          <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{skill.dir}</div>
          {skill.description && <p style={{ color: 'var(--c-ink-2)' }}>{skill.description}</p>}

          <div>
            <span className="field-label">标签</span>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <div style={{ flex: 1 }}>
                <FieldInput placeholder="新标签" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} />
              </div>
              <Button onClick={addNew}>添加</Button>
            </div>
            <div className="filter-row" style={{ marginTop: 'var(--sp-2)' }}>
              {allTags.map((t) => (
                <button key={t} type="button" className={`chip ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => toggle(t)}>{t}</button>
              ))}
              {tags.filter((t) => !allTags.includes(t)).map((t) => (
                <button key={t} type="button" className="chip is-on" onClick={() => toggle(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <span className="field-label">SKILL.md 预览</span>
            {loading && <span style={{ color: 'var(--c-ink-3)' }}>加载中…</span>}
            {content && (
              <>
                <pre className="mono" style={{
                  maxHeight: 320, overflow: 'auto', padding: 'var(--sp-3)',
                  background: 'var(--c-bg-2)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-md)',
                  fontSize: 'var(--fs-12)', whiteSpace: 'pre-wrap',
                }}>
                  {content.content}
                </pre>
                {content.files.length > 0 && (
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)' }}>
                    附带文件：{content.files.join('、')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** 批量导入（EK-02）：每行一个目录 */
function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const dirs = text.split('\n').map((s) => s.trim()).filter(Boolean);

  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await api<ImportPreviewItem[]>('/import/preview', { method: 'POST', body: JSON.stringify({ dirs }) });
      setPreview(res);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      await api('/import', { method: 'POST', body: JSON.stringify({ dirs }) });
      toast.push('导入完成', 'good');
      setText(''); setPreview(null);
      onClose(); onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  const items: EntityItem[] = (preview ?? []).map((p) => ({
    id: p.source,
    title: <span className="mono">{p.source}</span>,
    sub: <span className="mono">{p.layout}{p.error ? ` · ${p.error}` : ''}</span>,
    status: <Badge tone="accent">{p.count} 项</Badge>,
  }));

  return (
    <Modal
      open={open}
      title="导入技能"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={runPreview} loading={busy} disabled={dirs.length === 0}>识别</Button>
          <Button variant="primary" loading={busy} disabled={!preview} onClick={runImport}>开始导入</Button>
        </>
      }
    >
      <PathListField
        label="目录（每行一个，支持扁平/嵌套/带索引清单三类结构）"
        placeholder={'/path/to/skills\n/path/to/ume-skills'}
        rows={4}
        value={text}
        onChange={setText}
      />
      {preview && (
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <EntityList items={items} title={`识别结果（${items.length}）`} toggle={false} />
        </div>
      )}
    </Modal>
  );
}
