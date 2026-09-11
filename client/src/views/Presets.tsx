import { useMemo, useState } from 'react';
import { api, type PresetView, type StateView, type SkillCardView, type SkillAction, type SkillView } from '../api/types';
import SkillList from '../components/skill/SkillList';
import { skillViewToCard } from '../components/skill/adapters';
import EntityList, { type EntityItem } from '../components/common/EntityList';
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
  onBack,
  onChanged,
}: {
  preset: PresetView;
  skills: SkillView[];
  allTags: string[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [newTag, setNewTag] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  /** 统一保存入口：PUT 覆盖 skills/tags 并刷新 */
  const save = async (patch: { skills?: string[]; tags?: string[]; active?: boolean }) => {
    try {
      await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'PUT', body: JSON.stringify(patch) });
      toast.push('已保存', 'good');
      onChanged();
    } catch (e) {
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

  const addSkill = (skill: SkillView) => {
    if (!preset.skills.includes(skill.id)) void save({ skills: [...preset.skills, skill.id] });
  };

  // 显式关联的技能（来自条目本身）
  const explicitIds = new Set(preset.skills);
  const explicitCards: SkillCardView[] = preset.skills
    .map((id) => skills.find((s) => s.id === id))
    .filter((s): s is SkillView => !!s)
    .map((s) => skillViewToCard(s, [{ kind: 'delete', label: '移除' }]));

  // 因打有预设标签而自动纳入、且未显式枚举的技能（PR-05）
  const autoCards: SkillCardView[] = skills
    .filter((s) => preset.tags.length > 0 && !explicitIds.has(s.id) && s.tags.some((t) => preset.tags.includes(t)))
    .map((s) => skillViewToCard(s));

  const handleSkillAction = (item: SkillCardView, action: SkillAction) => {
    if (action.kind === 'delete') void save({ skills: preset.skills.filter((id) => id !== item.id) });
  };

  // 可添加的技能：全库中尚未显式关联的
  const addable = skills.filter((s) => !explicitIds.has(s.id));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{preset.name}</h2>
        <Badge tone={preset.active ? 'good' : 'neutral'} dot={preset.active ? 'good' : 'neutral'}>
          {preset.active ? '启用' : '未启用'}
        </Badge>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {preset.skills.length} 个显式技能 · {preset.tags.length} 个标签
          {autoCards.length > 0 ? ` · 另 ${autoCards.length} 个按标签纳入` : ''}
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
        <SkillList
          title={`显式关联技能（${explicitCards.length}）`}
          items={explicitCards}
          onAction={handleSkillAction}
          toolbar={<Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>添加技能</Button>}
          empty={<EmptyState title="还没有显式技能" hint="点击「添加技能」从技能库选择，或在上方关联标签按标签自动纳入。" />}
        />
      </div>

      {autoCards.length > 0 && (
        <div className="panel">
          <SkillList
            title={`按标签自动纳入（${autoCards.length}）`}
            items={autoCards}
            empty={undefined}
            hideToggle
            collapsible
            storageKey={`lsh.collapsed.preset.auto.${preset.name}`}
          />
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)' }}>
            这些技能因打有本预设的关联标签而自动生效，不在此处显式枚举；无需改动时保持现状，如需精确控制请在上方调整标签或点开「显式关联技能」添加。
          </div>
        </div>
      )}

      <AddSkillsModal
        open={addOpen}
        presetName={preset.name}
        items={addable}
        onAdd={addSkill}
        onClose={() => setAddOpen(false)}
      />
    </>
  );
}

/** 从技能库选择技能加入预设 */
function AddSkillsModal({ open, presetName, items, onAdd, onClose }: { open: boolean; presetName: string; items: SkillView[]; onAdd: (s: SkillView) => void; onClose: () => void }) {
  if (!open) return null;
  const entities: EntityItem[] = items.map((s) => ({
    id: s.id,
    title: s.name,
    sub: <span className="mono">{s.source}</span>,
    desc: s.description,
    tags: (s.tags ?? []).map((t) => ({ label: t })),
    actions: <Button size="sm" variant="primary" onClick={() => onAdd(s)}>添加</Button>,
  }));
  return (
    <Modal open={open} title={`添加技能 · ${presetName}`} width={560} onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}>
      <EntityList
        items={entities}
        title={`可添加（${items.length}）`}
        toggle={false}
        empty={<EmptyState title="技能库已全部纳入本预设" />}
      />
    </Modal>
  );
}