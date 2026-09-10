import { useMemo, useState } from 'react';
import { api, type StateView, type RepoView } from '../api/types';
import { skillViewToCard } from '../components/skill/adapters';
import SkillList from '../components/skill/SkillList';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Chip from '../components/ui/Chip';
import EmptyState from '../components/ui/EmptyState';
import Segment from '../components/ui/Segment';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput, FieldSelect, FieldTextarea } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

export default function Library() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const toast = useToast();
  const [tagEdit, setTagEdit] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  const [facet, setFacet] = useState<string | undefined>(undefined);
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [untaggedOnly, setUntaggedOnly] = useState(false);

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

  const cards = useMemo(
    () => (data?.skills ?? []).map(skillViewToCard),
    [data]
  );
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

  const editTarget = tagEdit ? cards.find((c) => c.id === tagEdit) : undefined;

  return (
    <>
      <PageHeader
        title="技能库"
        sub={data ? `共 ${data.skills.length} 个技能` : undefined}
        actions={
          <>
            {allTags.length > 0 && <Button variant="ghost" onClick={() => setTagMgrOpen(true)}>标签管理</Button>}
            <Button onClick={() => setImportOpen(true)}>导入</Button>
          </>
        }
      />

      <div className="panel" style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <FieldInput label="搜索" placeholder="名称 / 描述" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ minWidth: 160 }}>
          <FieldSelect label="来源" value={src ?? ''} onChange={(e) => setSrc(e.target.value || undefined)}>
            <option value="">全部来源</option>
            {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
          </FieldSelect>
        </div>
        <label className="switch" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={untaggedOnly} onChange={(e) => setUntaggedOnly(e.target.checked)} />
          <span className="switch__track" />
          <span style={{ marginLeft: 'var(--sp-2)', color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>仅未打标签</span>
        </label>
      </div>

      <div className="panel">
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '技能库为空', hint: '尚未导入任何技能。点击「导入」从仓库导入，或在下方管理来源跟Agent。', icon: '◈' }}
        >
          {() => (
            <SkillList
              title={(`${facet ? `标签：#${facet}` : '全部技能'} · ${shown.length}`)}
              items={shown}
              onAction={(item) => setTagEdit(item.id)}
              onTag={(item) => setTagEdit(item.id)}
            />
          )}
        </LoadingBoundary>
      </div>

      {data && data.skills.length > 0 && !facet && (
        <div className="panel">
          <PageHeaderSmall title="按标签浏览" />
          <Chip
            options={allTags.map((t) => ({ label: t, value: t }))}
            value={facet}
            onChange={(v) => setFacet(v === facet ? undefined : v)}
            allowDeselect
          />
        </div>
      )}

      {data && (
        <div className="panel">
          <PageHeaderSmall title="来源与仓库" />
          <ReposSection repos={data.repos} reload={reload} toast={toast} />
        </div>
      )}

      <TagEditorModal
        open={!!editTarget}
        onClose={() => setTagEdit(null)}
        item={editTarget}
        allTags={allTags}
        onSave={async (tags) => {
          if (!editTarget) return;
          await api(`/skills/${encodeURIComponent(editTarget.id)}`, { method: 'PATCH', body: JSON.stringify({ tags }) });
          toast.push('标签已更新', 'good');
          setTagEdit(null);
          reload();
        }}
      />

      <TagManagerModal open={tagMgrOpen} onClose={() => setTagMgrOpen(false)} onDone={reload} toast={toast} allTags={allTags} />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} toast={toast} />
    </>
  );
}

function PageHeaderSmall({ title }: { title: string }) {
  return (
    <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
      {title}
    </div>
  );
}

function ReposSection({ repos, reload, toast }: { repos: RepoView[]; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const runCollect = async (repo: RepoView) => {
    setBusy(repo.id);
    try {
      const preview = await api<{ candidate?: unknown }>(`/repos/${encodeURIComponent(repo.id)}/collect/preview`).catch(() => null);
      if (preview) {
        await api(`/repos/${encodeURIComponent(repo.id)}/collect`, { method: 'POST' }).catch(() => undefined);
      }
      toast.push(`仓库 ${repo.path} 已收集`, 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(null);
      reload();
    }
  };
  if (repos.length === 0) {
    return <EmptyState title="暂无仓库" hint="在后端添加仓库，或通过导入流程创建仓库。" />;
  }
  return (
    <div className="skill-list">
      {repos.map((repo) => (
        <div key={repo.id} className="skill-row">
          <div className="skill-row__main">
            <div className="skill-row__title">{repo.path}</div>
            <div className="skill-row__sub mono">
              {repo.layout} · {repo.root ?? 'root'}
            </div>
          </div>
          <div className="skill-row__right">
            <Button size="sm" variant="primary" loading={busy === repo.id} onClick={() => runCollect(repo)}>
              收集
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TagEditorModal({
  open,
  onClose,
  item,
  allTags,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  item?: { id: string; tags: string[] };
  allTags: string[];
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  // sync when opened
  const [openedId, setOpenedId] = useState<string | null>(null);
  if (open && item && openedId !== item.id) {
    setOpenedId(item.id);
    setTags(item.tags);
    setNewTag('');
  }
  if (!open && openedId !== null) setOpenedId(null);

  const toggle = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const addNew = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setNewTag('');
  };

  return (
    <Modal
      open={open}
      title={`编辑标签 · ${item?.id ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={async () => { setSaving(true); try { await onSave(tags); } finally { setSaving(false); } }}>
            保存
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <div style={{ flex: 1 }}>
            <FieldInput placeholder="新标签" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} />
          </div>
          <Button onClick={addNew}>添加</Button>
        </div>
        <div className="skill-toolbar__filters">
          {allTags.length === 0 && <span style={{ color: 'var(--c-ink-3)', fontSize: 'var(--fs-13)' }}>暂无可用标签</span>}
          {allTags.map((t) => (
            <button key={t} type="button" className={`chip ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
          {tags.filter((t) => !allTags.includes(t)).map((t) => (
            <button key={t} type="button" className="chip is-on" onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TagManagerModal({
  open,
  onClose,
  onDone,
  toast,
  allTags,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: ReturnType<typeof useToast>;
  allTags: string[];
}) {
  const [mode, setMode] = useState<'rename' | 'merge'>('rename');
  const [oldTag, setOldTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [target, setTarget] = useState('');
  const [absorb, setAbsorb] = useState('');
  const [issues, setIssues] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const runConsistency = async () => {
    setBusy(true);
    try {
      const res = await api<{ issues: { scope: string; skill: string; message: string }[] }>('/tags/consistency');
      setIssues(res.issues.map((i) => `[${i.scope}] ${i.skill}: ${i.message}`));
      toast.push(`一致性检查完成：${res.issues.length} 项`, res.issues.length ? 'info' : 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'rename') {
        if (!oldTag || !newTag) throw new Error('请输入旧/新标签');
        await api('/tags/rename', { method: 'POST', body: JSON.stringify({ oldTag, newTag }) });
        toast.push(`已重命名「${oldTag}」→「${newTag}」`, 'good');
        setOldTag(''); setNewTag('');
      } else {
        if (!target || !absorb) throw new Error('请输入目标/被合并标签');
        await api('/tags/merge', { method: 'POST', body: JSON.stringify({ target, absorb }) });
        toast.push(`已将「${absorb}」并入「${target}」`, 'good');
        setTarget(''); setAbsorb('');
      }
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
      title="标签管理"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={runConsistency} loading={busy}>一致性检查</Button>
          <Button variant="primary" onClick={submit} loading={busy}>执行</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <Segment
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { label: '重命名', value: 'rename' },
            { label: '合并', value: 'merge' },
          ]}
        />
        {mode === 'rename' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <FieldSelect label="旧标签" value={oldTag} onChange={(e) => setOldTag(e.target.value)}>
              <option value="">选择旧标签</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </FieldSelect>
            <FieldInput label="新标签" placeholder="输入新标签" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <FieldInput label="保留标签" placeholder="目标标签" value={target} onChange={(e) => setTarget(e.target.value)} />
            <FieldInput label="被合并标签" placeholder="将被合并进保留标签" value={absorb} onChange={(e) => setAbsorb(e.target.value)} />
          </div>
        )}
        {issues !== null && issues.length > 0 && (
          <div className="skill-list">
            {issues.map((m, i) => (
              <div key={i} style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--c-line)', color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }} className="mono">
                {m}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone, toast }: { open: boolean; onClose: () => void; onDone: () => void; toast: ReturnType<typeof useToast> }) {
  const [path, setPath] = useState('');
  const [preview, setPreview] = useState<{ source: string; layout: string; count: number }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await api<{ source: string; layout: string; count: number }[]>(`/import/preview?path=${encodeURIComponent(path)}`).catch((e) => {
        throw e;
      });
      setPreview(res);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="导入技能"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!preview}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/import', { method: 'POST', body: JSON.stringify({ path }) }).catch(() => undefined);
                toast.push('导入完成', 'good');
                onClose();
                onDone();
              } catch (e) {
                toast.push(e instanceof Error ? e.message : String(e), 'bad');
              } finally {
                setBusy(false);
              }
            }}
          >
            开始导入
          </Button>
        </>
      }
    >
      <FieldTextarea label="仓库路径" placeholder="/path/to/skills" value={path} onChange={(e) => setPath(e.target.value)} />
      <Button size="sm" onClick={runPreview} loading={busy}>
        预览
      </Button>
      {preview && (
        <div className="skill-list">
          {preview.map((p) => (
            <div key={p.source} className="skill-row">
              <div className="skill-row__main">
                <div className="skill-row__title mono">{p.source}</div>
                <div className="skill-row__sub mono">{p.layout}</div>
              </div>
              <div className="skill-row__right">
                <span className="badge badge--accent">{p.count} 项</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}