import { useMemo, useState } from 'react';
import { api, type StateView, type RepoView, type SourceView, type SkillContent, type AgentCollectPreview, type AgentCollectItem, type ImportPreviewItem, type SkillAction } from '../api/types';
import { skillViewToCard } from '../components/skill/adapters';
import SkillList from '../components/skill/SkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import IntegrateWizard from '../components/integrate/IntegrateWizard';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Segment from '../components/ui/Segment';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Chip from '../components/ui/Chip';
import MultiSelect from '../components/ui/MultiSelect';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import SwitchLabel from '../components/ui/SwitchLabel';
import { PathField, PathListField } from '../components/ui/PathField';
import Switch from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { navigate, useQueryFlag, useQueryList, useQueryParam, useRoute } from '../state/router';

const DETAIL_ACTION: SkillAction[] = [{ kind: 'detail', label: '详情' }];

export default function Library() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const toast = useToast();
  const route = useRoute();
  const [integrateOpen, setIntegrateOpen] = useState(false);

  // 详情弹层与筛选条件都写进地址，刷新后可完整复原当前页面
  const detailId = route.sub;
  const openDetail = (id: string) => navigate({ ...route, sub: id });
  const closeDetail = () => navigate({ ...route, sub: null });
  const [facets, setFacets] = useQueryList('tag');
  const [q, setQ] = useQueryParam('q');
  const [srcs, setSrcs] = useQueryList('src');
  const [untaggedOnly, setUntaggedOnly] = useQueryFlag('untagged');
  const [viewMode, setViewMode] = useViewMode();

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

  /** 每个标签 / 来源下的技能数，供筛选器展示 */
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    data?.skills.forEach((s) => s.tags?.forEach((t) => { m[t] = (m[t] ?? 0) + 1; }));
    return m;
  }, [data]);

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    data?.skills.forEach((s) => { m[s.source] = (m[s.source] ?? 0) + 1; });
    return m;
  }, [data]);

  const cards = useMemo(() => (data?.skills ?? []).map((s) => skillViewToCard(s, DETAIL_ACTION)), [data]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter((c) => {
      // 多选条件之间为「或」：命中任一选中项即保留，与来源筛选保持一致
      if (facets.length > 0 && !facets.some((t) => c.tags.includes(t))) return false;
      if (srcs.length > 0 && !srcs.includes(c.source)) return false;
      if (untaggedOnly && c.tags.length > 0) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [cards, facets, q, srcs, untaggedOnly]);

  const hasFilter = !!(facets.length > 0 || srcs.length > 0 || untaggedOnly || q.trim());
  const clearFilters = () => {
    setQ(''); setSrcs([]); setFacets([]); setUntaggedOnly(false);
  };

  const detailTarget = detailId ? data?.skills.find((s) => s.id === detailId) : undefined;

  return (
    <>
      <PageHeader
        title="技能库"
        sub={data ? `共 ${data.skills.length} 个技能` : undefined}
        actions={<Button variant="ghost" onClick={() => setIntegrateOpen((v) => !v)}>整合向导</Button>}
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
              <MultiSelect
                label="来源"
                options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                selected={srcs}
                onChange={setSrcs}
                emptyHint="尚未登记任何仓库。"
              />
              <MultiSelect
                label="标签"
                options={allTags.map((t) => ({ label: t, value: t, count: tagCounts[t] }))}
                selected={facets}
                onChange={setFacets}
                emptyHint={`当前 ${data?.skills.length ?? 0} 个技能都还没有标签。打开任意技能卡片的「详情」，在标签区添加标签后即可在此按标签筛选。`}
              />
              <SwitchLabel checked={untaggedOnly} onChange={setUntaggedOnly}>只看未打标签</SwitchLabel>
            </>
          }
          hasFilters={hasFilter}
          onReset={clearFilters}
          view={{ value: viewMode, onChange: setViewMode }}
        />
      </div>

      <div className="panel">
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '技能库为空', hint: '尚未导入任何技能。先在下方登记自有仓库，再通过其「归集 / 导入」添加技能。', icon: '◈' }}
        >
          {() => (
            <SkillList
              title={`${hasFilter ? '筛选结果' : '全部技能'} · ${shown.length}${hasFilter ? ` / ${cards.length}` : ''}`}
              items={shown}
              onAction={(item) => openDetail(item.id)}
              onTag={(item) => openDetail(item.id)}
              onOpen={(item) => openDetail(item.id)}
              hideToggle
              collapsible
              storageKey="lsh.collapsed.library.skills"
            />
          )}
        </LoadingBoundary>
      </div>

      {data && (
        <div className="panel">
          <ReposAndSources repos={data.repos} sources={data.sources} reload={reload} />
        </div>
      )}

      <SkillDetailModal
        id={detailTarget ? detailId : null}
        skill={detailTarget}
        allTags={allTags}
        onClose={closeDetail}
        onSaved={() => { closeDetail(); reload(); }}
      />
    </>
  );
}

/** 卡片上定位到的一条仓库：kind 与 API 路由对齐（repo → /repos，source → /sources） */
type WarehouseTarget = (RepoView & { kind: 'repo' }) | (SourceView & { kind: 'source' });

/* 仓库管理。技能入库动作（归集 / 导入）挂在自有仓库上：第三方仓库作为独立仓库维护，
 * 但当其技能被自有仓库导入时，它只是数据源目录，无需任何登记。 */
function ReposAndSources({ repos, sources, reload }: { repos: RepoView[]; sources: SourceView[]; reload: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<RepoView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseTarget | null>(null);

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

  // 两类仓库统一展示：标题取名称（自有仓库以 id 兼作名称，第三方仓库用 name、缺省回落 id），
  // 副标题取磁盘路径，类型与状态一律用徽标区分。
  const items: EntityItem[] = [
    ...repos.map((repo) => ({
      id: `repo:${repo.id}`,
      title: repo.name || repo.id,
      sub: <span className="mono">{repo.path}{repo.root ? ` · ${repo.root}` : ''}</span>,
      status: <Badge tone="info">自有仓库</Badge>,
      badges: <Badge tone="neutral">{repo.layout}</Badge>,
      actions: (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...repo, kind: 'repo' })}>编辑</Button>
          <Button size="sm" variant="primary" onClick={() => setAddFor(repo)} title="从已安装 Agent 归集，或从外部目录导入（如第三方库，仅作数据源）">
            添加技能
          </Button>
          <Button size="sm" variant="danger" loading={busy === `del:${repo.id}`} onClick={() => remove('repos', repo.id)}>删除</Button>
        </>
      ),
    })),
    ...sources.map((s) => ({
      id: `source:${s.id}`,
      title: s.name || s.id,
      sub: <span className="mono">{s.path}</span>,
      status: <Badge tone="accent">第三方仓库</Badge>,
      badges: <Badge tone="neutral">{s.layout}</Badge>,
      actions: (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...s, kind: 'source' })}>编辑</Button>
          <Button size="sm" variant="danger" loading={busy === `del:${s.id}`} onClick={() => remove('sources', s.id)}>删除</Button>
        </>
      ),
    })),
  ];

  return (
    <>
      <EntityList
        title="仓库"
        items={items}
        toolbar={<Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>登记仓库</Button>}
        empty={<EmptyState title="暂无仓库" hint="点击「登记仓库」添加自有仓库或第三方仓库。" />}
        hideToggle
      />
      <WarehouseModal
        open={createOpen || !!editTarget}
        target={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onDone={() => { setCreateOpen(false); setEditTarget(null); reload(); }}
      />
      <AddSkillsModal repo={addFor} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); reload(); }} />
    </>
  );
}

/** 添加技能到自有仓库：归集（Agent 目录）与导入（外部数据源目录）的合并入口，进入后再选方式 */
function AddSkillsModal({ repo, onClose, onDone }: { repo: RepoView | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'collect' | 'import'>('collect');
  const [wasOpen, setWasOpen] = useState(false);
  if (!!repo !== wasOpen) {
    setWasOpen(!!repo);
    if (repo) setMode('collect');
  }
  return (
    <Modal open={!!repo} title={repo ? `添加技能到 ${repo.name || repo.id}` : ''} onClose={onClose} width={560}>
      {repo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <Segment
            options={[
              { label: '从 Agent 归集', value: 'collect' },
              { label: '从目录导入', value: 'import' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {/* key 保证切换方式时重置面板内部状态 */}
          {mode === 'collect'
            ? <CollectPanel key="collect" repo={repo} onClose={onClose} onDone={onDone} />
            : <ImportPanel key="import" repo={repo} onClose={onClose} onDone={onDone} />}
        </div>
      )}
    </Modal>
  );
}

/** 确认页候选里的「仓库内版本」占位 agentKey（保持现状，不写入） */
const REPO_KEY = '__repo__';

/**
 * 从 Agent 归集（IM-01）：两步流程（面板，由 AddSkillsModal 承载）。
 * 第一步按 Agent 分组（默认折叠）展示 skill 清单，标注存储形态与 Agent 接管状态；
 * 已接管但外链指向非仓库位置的 skill 可一键「调整」改指仓库本体；
 * 第二步确认页按名字分组，仓库内版本与各 agent 版本一起作为候选（仓库已有同名时）：
 * 选仓库版本保持现状，选 agent 版本则覆盖仓库副本；逐项展示写入路径后由用户确认。
 */
function CollectPanel({ repo, onClose, onDone }: { repo: RepoView; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  /** agentKey → 已勾选的 skill 名 */
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  /** 确认页：每个技能名采纳哪个 agent 的版本 */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { data, loading, reload } = useAsync<AgentCollectPreview[]>(
    () => api(`/repos/${encodeURIComponent(repo.id)}/collect/preview`),
    [repo.id]
  );

  const agents = data ?? [];
  /** 可直接调整：已是软链但指向仓库之外，且仓库内已有同名副本 */
  const adjustable = (it: AgentCollectItem) => it.symlink && !it.inRepo && it.exists;

  /** Agent 接管状态：所有 skill 均为指向仓库的软链 = 已接管 */
  const takeoverStatus = (a: AgentCollectPreview): { tone: 'good' | 'accent' | 'neutral'; label: string } => {
    const linked = a.items.filter((it) => it.symlink && it.inRepo).length;
    if (a.items.length > 0 && linked === a.items.length) return { tone: 'good', label: '已接管' };
    if (linked > 0) return { tone: 'accent', label: '部分接管' };
    return { tone: 'neutral', label: '未接管' };
  };

  const toggleSkill = (agentKey: string, name: string) =>
    setPicked((p) => {
      const cur = p[agentKey] ?? [];
      return { ...p, [agentKey]: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] };
    });

  const toggleAgent = (a: AgentCollectPreview) => {
    const names = a.items.map((it) => it.name);
    setPicked((p) => {
      const cur = p[a.agentKey] ?? [];
      const all = names.length > 0 && names.every((n) => cur.includes(n));
      return { ...p, [a.agentKey]: all ? [] : names };
    });
  };

  /** 把指向外部的软链改指仓库本体（takeover：软链源直接替换，原位置不受影响） */
  const adjust = async (agentKey: string, name: string) => {
    setAdjusting(`${agentKey}:${name}`);
    try {
      const res = await api<{ linked: boolean; reason?: string }>(
        `/repos/${encodeURIComponent(repo.id)}/takeover`,
        { method: 'POST', body: JSON.stringify({ agentKey, name, confirm: true }) }
      );
      if (res.linked) toast.push(`${name} 已改指仓库本体`, 'good');
      else toast.push(res.reason ?? '调整失败', 'bad');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setAdjusting(null); }
  };

  const selections = agents
    .map((a) => ({ agent: a, names: picked[a.agentKey] ?? [] }))
    .filter((s) => s.names.length > 0);
  const totalPicked = selections.reduce((n, s) => n + s.names.length, 0);

  /** 确认页按名字分组：同名技能可能勾选自多个 agent；仓库已有同名时，仓库内版本也作为候选 */
  const selectedGroups = useMemo(() => {
    const m = new Map<string, { agent: AgentCollectPreview; item: AgentCollectItem }[]>();
    for (const s of selections) {
      for (const name of s.names) {
        const item = s.agent.items.find((it) => it.name === name);
        if (item) (m.get(name) ?? m.set(name, []).get(name)!).push({ agent: s.agent, item });
      }
    }
    return [...m.entries()];
  }, [data, picked]);

  /** 每个名字的候选与采纳结果：仓库版本默认选中（保持现状），选 agent 版本则覆盖仓库副本 */
  const repoRootDisplay = repo.root ?? `${repo.path}/skills`;
  const plan = selectedGroups.map(([name, cands]) => {
    const exists = cands[0].item.exists;
    const options = [
      ...(exists ? [{ label: '仓库内版本（保持现状）', value: REPO_KEY }] : []),
      ...cands.map((c) => ({ label: c.agent.agentName, value: c.agent.agentKey })),
    ];
    let chosen = choices[name];
    if (!chosen || !options.some((o) => o.value === chosen)) chosen = exists ? REPO_KEY : cands[0].agent.agentKey;
    return { name, cands, exists, options, chosen };
  });
  const writePlans = plan.filter((p) => p.chosen !== REPO_KEY);
  const keepCount = plan.length - writePlans.length;
  const overwriteCount = writePlans.filter((p) => p.exists).length;

  const run = async () => {
    setBusy(true);
    try {
      const byAgent: Record<string, string[]> = {};
      const replaceNames: string[] = [];
      for (const p of plan) {
        if (p.chosen === REPO_KEY) continue;
        (byAgent[p.chosen] ??= []).push(p.name);
        if (p.exists) replaceNames.push(p.name);
      }
      const sels = Object.entries(byAgent).map(([agentKey, names]) => ({ agentKey, names }));
      if (sels.length === 0) {
        toast.push('全部保持仓库现状，未写入任何文件', 'good');
        onDone();
        return;
      }
      const res = await api<{ collected: string[]; skipped: string[] }>(
        `/repos/${encodeURIComponent(repo.id)}/collect`,
        { method: 'POST', body: JSON.stringify({ selections: sels, replaceNames }) }
      );
      toast.push(`已归集 ${res.collected.length} 个技能${res.skipped.length ? `，跳过 ${res.skipped.length}` : ''}`, 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  if (step === 'confirm') {
    return (
      <>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>
          将把 <strong>{writePlans.length}</strong> 个技能写入 <span className="mono">{repo.name || repo.id}</span>
          （新增 {writePlans.length - overwriteCount} · 覆盖仓库副本 {overwriteCount}），
          {keepCount} 个保持仓库现状；已勾选 {totalPicked} 项，按名字合并为 {selectedGroups.length} 个：
        </div>
        <EntityList
          mode="list"
          toggle={false}
          items={plan.map((p) => {
            const adoptingRepo = p.chosen === REPO_KEY;
            const cand = p.cands.find((c) => c.agent.agentKey === p.chosen);
            const dest = `${repoRootDisplay}/${p.name}`;
            return {
              id: p.name,
              title: p.name,
              sub: adoptingRepo ? (
                <span className="mono">仓库内版本 · {dest}</span>
              ) : (
                <span className="mono">
                  {cand!.agent.agentName} · {cand!.item.dir}
                  {cand!.item.symlink ? '（软链）' : ''}
                </span>
              ),
              desc: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  {p.options.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>采纳版本：</span>
                      <Chip
                        options={p.options}
                        selected={[p.chosen]}
                        onChange={(arr) => { const v = arr[0]; if (v) setChoices((prev) => ({ ...prev, [p.name]: v })); }}
                      />
                    </div>
                  )}
                  {!adoptingRepo && (
                    <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-2)' }}>
                      写入：{cand!.item.dir} → {dest}
                    </div>
                  )}
                </div>
              ),
              status: adoptingRepo ? (
                <Badge tone="info" title="不写入任何文件，仓库副本保持现状">保持现状</Badge>
              ) : p.exists ? (
                <Badge tone="warn" title={`将覆盖仓库现有副本：${dest}`}>覆盖仓库副本</Badge>
              ) : (
                <Badge tone="good">新增</Badge>
              ),
            };
          })}
        />
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          agent 目录始终保持不动；「覆盖仓库副本」会先删除 <span className="mono">{repoRootDisplay}</span> 下的同名目录再写入所选版本。
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStep('select')}>返回</Button>
          <Button variant="primary" loading={busy} onClick={run}>确认归集</Button>
        </div>
      </>
    );
  }

  return (
    <>
      {loading && <span style={{ color: 'var(--c-ink-3)' }}>扫描中…</span>}
      {!loading && agents.length === 0 && <EmptyState title="没有已安装的 Agent 可归集" />}
      {agents.map((a) => {
        const st = takeoverStatus(a);
        const cur = picked[a.agentKey] ?? [];
        const selectedCount = a.items.filter((it) => cur.includes(it.name)).length;
        const allSelected = a.items.length > 0 && selectedCount === a.items.length;
        return (
          <EntityList
            key={a.agentKey}
            mode="list"
            toggle={false}
            collapsible
            defaultCollapsed
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                {a.agentName}
                <Badge tone={st.tone} title={st.label === '未接管' ? 'skill 本体仍在 agent 目录，未替换为指向仓库的软链' : st.label === '部分接管' ? '部分 skill 已指向仓库本体' : '所有 skill 均已指向仓库本体'}>{st.label}</Badge>
                <span className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
                  {a.agentKey} · {a.items.length} 项
                </span>
              </span>
            }
            toolbar={
              <>
                {st.label === '未接管' && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
                    未接管：归集入库后可执行「接管」，把本目录替换为指向仓库的软链
                  </span>
                )}
                {a.items.length > 0 && (
                  <SwitchLabel checked={allSelected} onChange={() => toggleAgent(a)}>
                    全选（{selectedCount}/{a.items.length}）
                  </SwitchLabel>
                )}
              </>
            }
            items={a.items.map((it) => ({
              id: it.name,
              title: it.name,
              sub: <span className="mono">{it.symlink ? `软链 → ${it.linkTarget ?? '(悬空)'}` : '真实目录'}</span>,
              desc: it.description,
              status: it.exists ? (
                <Badge tone="neutral" title="仓库已有同名技能，归集时将自动去重跳过">已在仓库</Badge>
              ) : it.symlink && it.inRepo ? (
                <Badge tone="info" title={`软链指向仓库本体：${it.linkTarget}`}>仓库本体</Badge>
              ) : it.symlink ? (
                <Badge tone="accent">软链</Badge>
              ) : undefined,
              toggle: (
                <Switch
                  aria-label={`归集 ${it.name}`}
                  checked={cur.includes(it.name)}
                  onChange={() => toggleSkill(a.agentKey, it.name)}
                />
              ),
              actions: adjustable(it) ? (
                <Button
                  size="sm"
                  loading={adjusting === `${a.agentKey}:${it.name}`}
                  onClick={() => adjust(a.agentKey, it.name)}
                  title="此软链当前指向外部位置；仓库内已有同名副本，点击后改为指向仓库本体（原外部链接将被替换）"
                >
                  改指仓库
                </Button>
              ) : undefined,
            }))}
          />
        );
      })}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>关闭</Button>
        <Button variant="primary" disabled={totalPicked === 0} onClick={() => setStep('confirm')}>下一步：确认</Button>
      </div>
    </>
  );
}

/** 仓库表单草稿：两类仓库共用同一套字段 */
interface WarehouseDraft {
  kind: 'repo' | 'source';
  id: string;
  name: string;
  path: string;
  layout: string;
  root: string;
}

const EMPTY_DRAFT: WarehouseDraft = { kind: 'repo', id: '', name: '', path: '', layout: 'auto', root: '' };

/** 自有仓库缺省扫描 <路径>/skills */
function skillsRootOf(p: string): string {
  const t = p.trim();
  return t ? `${t.replace(/\/+$/, '')}/skills` : '';
}

function draftFrom(target: WarehouseTarget | null | undefined): WarehouseDraft {
  if (!target) return EMPTY_DRAFT;
  if (target.kind === 'source') {
    return { kind: 'source', id: target.id, name: target.name ?? '', path: target.path, layout: target.layout, root: '' };
  }
  return { kind: 'repo', id: target.id, name: target.name ?? '', path: target.path, layout: target.layout, root: target.root ?? '' };
}

/**
 * 登记 / 编辑仓库（自有与第三方共用一套表单）。
 *
 * 编辑既有仓库时可切换「自有 / 第三方」定位。两类仓库的扫描根不同
 * （自有 = root ?? <路径>/skills，第三方 = 路径本身），因此切换类型时同步换算路径，
 * 保证改定位后扫描根不变、技能不会「消失」：
 * - 自有 → 第三方：把当前扫描根写进路径（root 的语义被吸收）
 * - 第三方 → 自有：把当前路径同时记为 root，显式声明扫描根就是该目录
 */
function WarehouseModal({
  open,
  target,
  onClose,
  onDone,
}: {
  open: boolean;
  target?: WarehouseTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const editing = !!target;
  const [d, setD] = useState<WarehouseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // 每次打开时载入目标值（新建则重置），避免残留上一次的输入
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setD(draftFrom(target));
  }

  const set = <K extends keyof WarehouseDraft>(k: K, v: WarehouseDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const switchKind = (k: 'repo' | 'source') => {
    if (k === d.kind) return;
    setD((prev) => {
      const p = prev.path.trim();
      if (k === 'source') {
        return { ...prev, kind: k, path: prev.root.trim() || skillsRootOf(p), root: '' };
      }
      return { ...prev, kind: k, root: p };
    });
  };

  // 把真实扫描根摊开给用户看，避免「改了定位却扫不到技能」
  const scanRoot = d.kind === 'repo' ? (d.root.trim() || skillsRootOf(d.path) || '—') : (d.path.trim() || '—');

  const submit = async () => {
    setBusy(true);
    try {
      if (!d.id.trim() || !d.path.trim()) throw new Error('标识与路径必填');
      const id = d.id.trim();
      if (d.kind === 'repo') {
        const body = { name: d.name.trim() || undefined, path: d.path.trim(), layout: d.layout, root: d.root.trim() || undefined };
        if (editing) {
          await api(`/repos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...body, kind: 'repo' }) });
        } else {
          await api('/repos', { method: 'POST', body: JSON.stringify({ id, ...body }) });
        }
      } else {
        const name = d.name.trim() || id;
        const path = d.path.trim();
        if (editing) {
          await api(`/sources/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify({ name, path, layout: d.layout, root: d.root.trim() || undefined, kind: 'source' }),
          });
        } else {
          await api('/sources', { method: 'POST', body: JSON.stringify({ id, name, path, layout: d.layout }) });
        }
      }
      toast.push(editing ? '仓库已更新' : `已登记${d.kind === 'repo' ? '自有仓库' : '第三方仓库'} ${id}`, 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? '编辑仓库' : '登记仓库'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={!d.id.trim() || !d.path.trim()} onClick={submit}>
            {editing ? '保存' : '登记'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div>
          <span className="field-label">类型</span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            {(['repo', 'source'] as const).map((k) => (
              <Button key={k} size="sm" variant={d.kind === k ? 'primary' : 'ghost'} onClick={() => switchKind(k)}>
                {k === 'repo' ? '自有仓库' : '第三方仓库'}
              </Button>
            ))}
          </div>
          {editing && target && d.kind !== target.kind && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)', lineHeight: 1.6 }}>
              从{target.kind === 'repo' ? '自有仓库' : '第三方仓库'}改为{d.kind === 'repo' ? '自有仓库' : '第三方仓库'}。
              标识 <span className="mono">{target.id}</span> 保持不变，技能引用（标签 / 预设 / 项目）不受影响；路径已按新类型的扫描规则自动换算。
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput
            label="标识 ID"
            placeholder="my-lib"
            value={d.id}
            readOnly={editing}
            hint={editing ? '不可修改：参与技能标识 name@id' : undefined}
            onChange={(e) => set('id', e.target.value)}
          />
          <FieldInput
            label="名称"
            placeholder="缺省与 ID 相同"
            value={d.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <PathField label="路径" placeholder="/path/to/library" value={d.path} onChange={(v) => set('path', v)} />

        <FieldSelect label="布局" value={d.layout} onChange={(e) => set('layout', e.target.value)}>
          <option value="auto">auto（自动检测）</option>
          <option value="nested">nested（嵌套分类）</option>
          <option value="flat">flat（扁平）</option>
        </FieldSelect>

        {d.kind === 'repo' && (
          <FieldInput
            label="root（可选）"
            hint="skills 根目录，缺省 <路径>/skills"
            placeholder="skills"
            value={d.root}
            onChange={(e) => set('root', e.target.value)}
          />
        )}

        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          技能扫描根：<span className="mono">{scanRoot}</span>
        </div>
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
            <div style={{ marginTop: 'var(--sp-2)' }}>
              {/* 库内已有标签 + 本次新增的标签，一并作为可多选的候选项 */}
              <Chip
                options={[...allTags, ...tags.filter((t) => !allTags.includes(t))].map((t) => ({ label: t, value: t }))}
                selected={tags}
                multiple
                onChange={setTags}
              />
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

/**
 * 仓库级批量导入（EK-02）：把外部目录里的 skill 拷贝进指定自有仓库（面板，由 AddSkillsModal 承载）。
 * 目录仅作为本次导入的数据源（如第三方库的 skills 目录），不会登记进系统；
 * 同名 skill 已在目标仓库则去重跳过，导入的技能带来源追溯（origin=源目录）。
 */
function ImportPanel({ repo, onClose, onDone }: { repo: RepoView; onClose: () => void; onDone: () => void }) {
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
      const res = await api<{ source: string; imported: string[]; skipped: string[] }[]>('/import', { method: 'POST', body: JSON.stringify({ dirs, repoId: repo.id }) });
      const imported = res.reduce((n, r) => n + r.imported.length, 0);
      const skipped = res.reduce((n, r) => n + r.skipped.length, 0);
      toast.push(`已导入 ${imported} 个技能${skipped ? `，去重跳过 ${skipped}` : ''}`, 'good');
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
    <>
      <PathListField
        label="数据源目录（每行一个，支持扁平/嵌套/带索引清单三类结构）"
        placeholder={'/path/to/skills\n/path/to/third-party-lib/skills'}
        rows={4}
        value={text}
        onChange={setText}
      />
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'calc(-1 * var(--sp-2))' }}>
        目录仅作为导入的数据源，不会登记进系统；同名技能已存在时自动跳过。
      </div>
      {preview && (
        <EntityList items={items} title={`识别结果（${items.length}）`} toggle={false} />
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>关闭</Button>
        <Button size="sm" onClick={runPreview} loading={busy} disabled={dirs.length === 0}>识别</Button>
        <Button variant="primary" loading={busy} disabled={!preview} onClick={runImport}>开始导入</Button>
      </div>
    </>
  );
}
