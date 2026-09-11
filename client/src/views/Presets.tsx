import { useMemo, useRef, useState } from 'react';
import { api, type PresetView, type StateView, type SkillCardView, type SkillView } from '../api/types';
import SkillList from '../components/skill/SkillList';
import { skillViewToCard } from '../components/skill/adapters';
import EntityList from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import MultiSelect from '../components/ui/MultiSelect';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import Chip from '../components/ui/Chip';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { navigate, useRoute } from '../state/router';

/**
 * 预设（PR-05）：先添加（只填名称），随后进入预设详情页
 * 增删显式关联技能、管理关联标签。标签命中的技能会自动纳入预设，
 * 与显式技能取并集。详情态由地址 sub 决定，可直达、可刷新复原。
 */
export default function Presets() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const toast = useToast();
  const route = useRoute();
  const [createOpen, setCreateOpen] = useState(false);

  const presets = data?.presets ?? [];

  const selectedName = route.sub;
  const selected = selectedName ? presets.find((p) => p.name === selectedName) : undefined;
  const open = (name: string) => navigate({ ...route, sub: name });
  const back = () => navigate({ ...route, sub: null });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => s.tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [data]);

  return (
    <>
      <PageHeader
        title="预设"
        sub={presets ? `共 ${presets.length} 组预设` : undefined}
        actions={<Button onClick={() => setCreateOpen(true)}>新建预设</Button>}
      />

      {selectedName && !selected && (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '未找到该预设', hint: `没有名为「${selectedName}」的预设。`, icon: '◉' }}
        >
          {() => null}
        </LoadingBoundary>
      )}

      {selected && (
        <PresetDetail
          preset={selected}
          skills={data?.skills ?? []}
          allTags={allTags}
          ownSources={(data?.repos ?? []).map((r) => r.id)}
          onBack={back}
          onChanged={reload}
        />
      )}

      {!selectedName && (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '还没有预设', hint: '先「新建预设」填个名称，再进入详情页添加技能、关联标签。', icon: '□' }}
        >
          {() => (
            <EntityList
              items={presets.map((p) => {
                const tagText = p.tags.length ? p.tags.map((t) => `#${t}`).join(' ') : '无标签';
                return {
                  id: p.name,
                  title: p.name,
                  sub: `${p.skills.length} 个显式技能 · ${tagText}`,
                  status: p.active ? <Badge tone="good" dot="good">启用</Badge> : <Badge tone="neutral" dot="neutral">未启用</Badge>,
                  toggle: (
                    <Switch
                      aria-label={`启用 ${p.name}`}
                      checked={!!p.active}
                      onChange={(v) => void toggle(p, v, reload, toast)}
                    />
                  ),
                  onClick: () => open(p.name),
                  muted: !p.active,
                };
              })}
              title={`全部预设（${presets.length}）`}
            />
          )}
        </LoadingBoundary>
      )}

      <CreatePresetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => { setCreateOpen(false); reload(); open(name); }}
      />
    </>
  );
}

async function toggle(p: PresetView, on: boolean, reload: () => void, toast: ReturnType<typeof useToast>) {
  try {
    await api(`/presets/${encodeURIComponent(p.name)}`, { method: 'PUT', body: JSON.stringify({ ...p, active: on }) });
    toast.push('已更新', 'good');
    reload();
  } catch (e) {
    toast.push(e instanceof Error ? e.message : String(e), 'bad');
  }
}

/** 新建预设：只填名称，创建后立即进入详情页做后续管理 */
function CreatePresetModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName('');
  }

  const create = async () => {
    setBusy(true);
    try {
      const res = await api<PresetView>('/presets', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      toast.push('已创建，进入详情页添加技能', 'good');
      onCreated(res.name);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title="新建预设"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>创建</Button>
        </>
      }
    >
      <FieldInput
        label="预设名称"
        placeholder="例如：前端效能组"
        hint="创建后进入详情页，再添加技能、关联标签"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && void create()}
      />
    </Modal>
  );
}

/** 预设详情：增删显式技能、管理关联标签、启停与删除 */
function PresetDetail({
  preset,
  skills,
  allTags,
  ownSources,
  onBack,
  onChanged,
}: {
  preset: PresetView;
  skills: SkillView[];
  allTags: string[];
  /** 自有仓库 id 列表；来源筛选默认只选中这些 */
  ownSources: string[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [newTag, setNewTag] = useState('');
  const [q, setQ] = useState('');
  /** 来源筛选默认只选中自有仓库 */
  const [srcs, setSrcs] = useState<string[]>(ownSources);
  const [facets, setFacets] = useState<string[]>([]);
  const [viewMode, setViewMode] = useViewMode();
  /** 技能名单的本地草稿：连点多个开关时不丢操作；保存失败或切换预设后回退到服务端数据 */
  const [draftSkills, setDraftSkills] = useState<string[] | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  if (preset.name !== synced) {
    setSynced(preset.name);
    setDraftSkills(null);
  }
  const current = draftSkills ?? preset.skills;
  /** 技能全量覆盖的 PUT 串行队列，避免连点开关时后发先至覆盖掉前面的操作 */
  const skillQueue = useRef<Promise<void>>(Promise.resolve());

  /** 统一保存入口：PUT 覆盖 skills/tags 并刷新；silent 用于开关这类高频操作 */
  const save = async (patch: { skills?: string[]; tags?: string[]; active?: boolean }, opts?: { silent?: boolean; noReload?: boolean }) => {
    try {
      await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'PUT', body: JSON.stringify(patch) });
      if (!opts?.silent) toast.push('已保存', 'good');
      if (!opts?.noReload) onChanged();
    } catch (e) {
      setDraftSkills(null);
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const removePreset = async () => {
    try {
      await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'DELETE' });
      toast.push('已删除', 'good');
      onChanged();
      onBack();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const setTags = (tags: string[]) => void save({ tags });
  const addTag = () => {
    const t = newTag.trim();
    setNewTag('');
    if (t && !preset.tags.includes(t)) void save({ tags: [...preset.tags, t] });
  };

  const toggleSkill = (id: string, on: boolean) => {
    const next = on ? [...current, id] : current.filter((x) => x !== id);
    setDraftSkills(next);
    // 不触发整页重载：UI 由本地草稿即时反映，队列保证提交顺序
    skillQueue.current = skillQueue.current.then(() => save({ skills: next }, { silent: true, noReload: true }));
  };

  // 因打有预设标签而自动纳入、且未显式枚举的技能：打「按标签纳入」徽标并锁定开关
  const autoIds = useMemo(() => {
    const set = new Set<string>();
    if (preset.tags.length === 0) return set;
    const ex = new Set(current);
    skills.forEach((s) => {
      if (!ex.has(s.id) && s.tags.some((t) => preset.tags.includes(t))) set.add(s.id);
    });
    return set;
  }, [skills, preset.tags, current]);

  // 全库技能统一成卡片：开关选中态 = 显式纳入或按标签纳入；按标签纳入的锁死不可关，并打「按标签纳入」徽标
  const cards = useMemo(() => {
    const ex = new Set(current);
    return skills.map((s) => {
      const card = skillViewToCard(s);
      const auto = autoIds.has(s.id);
      card.toggleOn = ex.has(s.id) || auto;
      card.toggleDisabled = auto;
      if (auto) {
        card.reason = 'preset';
        card.reasonLabel = '按标签纳入';
        card.reasonTitle = '该技能因打有本预设的关联标签而自动纳入，不可直接关闭；去掉对应标签即可停用';
      }
      return card;
    });
  }, [skills, autoIds, current]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => set.add(s.source));
    return [...set].sort();
  }, [skills]);

  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    skills.forEach((s) => s.tags?.forEach((t) => { m[t] = (m[t] ?? 0) + 1; }));
    return m;
  }, [skills]);

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    skills.forEach((s) => { m[s.source] = (m[s.source] ?? 0) + 1; });
    return m;
  }, [skills]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter((c) => {
      // 多选条件之间为「或」：命中任一选中项即保留，与技能库一致
      if (srcs.length > 0 && !srcs.includes(c.source)) return false;
      if (facets.length > 0 && !facets.some((t) => c.tags.includes(t))) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [cards, facets, q, srcs]);

  const hasFilter = !!(facets.length > 0 || srcs.length > 0 || q.trim());
  const clearFilters = () => {
    setQ(''); setSrcs([]); setFacets([]);
  };

  const autoCount = autoIds.size;
  const explicitCount = current.length;

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{preset.name}</h2>
        <Badge tone={preset.active ? 'good' : 'neutral'} dot={preset.active ? 'good' : 'neutral'}>
          {preset.active ? '启用' : '未启用'}
        </Badge>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {explicitCount} 个显式技能 · {preset.tags.length} 个标签
          {autoCount > 0 ? ` · 另 ${autoCount} 个按标签纳入` : ''}
        </span>
        <div className="detail-actions">
          <Button size="sm" variant={preset.active ? 'ghost' : 'primary'} onClick={() => void save({ active: !preset.active })}>
            {preset.active ? '停用' : '启用'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removePreset()}>删除</Button>
        </div>
      </div>

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>关联标签</div>
        <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 0 }}>
          打有这些标签的技能会自动纳入本预设，与下方显式技能取并集。点击候选即添加/移除，也可输入新标签并回车创建。
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
          <div style={{ flex: 1 }}>
            <FieldInput placeholder="新标签" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} />
          </div>
          <Button onClick={addTag}>添加</Button>
        </div>
        <Chip
          options={[...allTags, ...preset.tags.filter((t) => !allTags.includes(t))].map((t) => ({ label: t, value: t }))}
          selected={preset.tags}
          multiple
          onChange={setTags}
        />
      </div>

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>技能</div>
        <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 0 }}>
          开关控制该技能是否显式纳入本预设（已纳入 {explicitCount}）。打「按标签纳入」标记的技能由关联标签自动纳入，开关已锁定为开启，去掉对应标签即可停用。
        </p>
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: '搜索技能名称 / 描述' }}
          controls={
            <>
              <MultiSelect
                label="来源"
                options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                selected={srcs}
                onChange={setSrcs}
                emptyHint="尚无技能来源。"
              />
              <MultiSelect
                label="标签"
                options={allTags.map((t) => ({ label: t, value: t, count: tagCounts[t] }))}
                selected={facets}
                onChange={setFacets}
                emptyHint="技能都还没有标签。"
              />
            </>
          }
          hasFilters={hasFilter}
          onReset={clearFilters}
          view={{ value: viewMode, onChange: setViewMode }}
        />
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <SkillList
            title={`${hasFilter ? '筛选结果' : '全部技能'} · ${shown.length}${hasFilter ? ` / ${cards.length}` : ''}`}
            items={shown}
            onToggle={(item) => toggleSkill(item.id, !current.includes(item.id))}
            hideToggle
            empty={hasFilter ? <EmptyState title="没有匹配的技能" /> : <EmptyState title="技能库为空" hint="先在技能库登记并导入技能。" />}
          />
        </div>
      </div>
    </>
  );
}
