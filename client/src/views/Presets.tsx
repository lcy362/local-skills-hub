import { useState } from 'react';
import { api, type PresetView, type StateView } from '../api/types';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

export default function Presets() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const toast = useToast();
  const [edit, setEdit] = useState<PresetView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const preset = data?.presets ?? [];

  const remove = async (name: string) => {
    try {
      await api(`/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.push('已删除', 'good');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title="预设"
        sub={preset ? `共 ${preset.length} 组预设` : undefined}
        actions={<Button onClick={() => { setEdit(null); setCreateOpen(true); }}>新建预设</Button>}
      />
      <LoadingBoundary
        state={{ loading, error, data }}
        empty={{ title: '还没有预设', hint: '创建预设以固定一组技能，供 Agent 快速启用。', icon: '□' }}
      >
        {() => (
          <div className="panel" style={{ padding: 0 }}>
            <div className="skill-list" style={{ padding: 'var(--sp-4)' }}>
              {preset.map((p) => (
                <div key={p.name} className="skill-row">
                  <Switch checked={!!p.active} onChange={(v) => void toggle(p, v, reload, toast)} />
                  <div className="skill-row__main">
                    <div className="skill-row__title">
                      {p.name}
                      {p.active && <Badge tone="good">启用</Badge>}
                    </div>
                    <div className="skill-row__sub">
                      {p.skills.length} 个技能 · {p.tags.join(', ') || '无标签'}
                    </div>
                  </div>
                  <div className="skill-row__right">
                    <Button size="sm" onClick={() => setEdit(p)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(p.name)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </LoadingBoundary>

      <PresetModal
        preset={edit}
        open={createOpen || !!edit}
        onClose={() => { setEdit(null); setCreateOpen(false); }}
        onDone={() => { setEdit(null); setCreateOpen(false); reload(); }}
        toast={toast}
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

function PresetModal({
  preset,
  open,
  onClose,
  onDone,
  toast,
}: {
  preset: PresetView | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('');
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  if (open && preset && synced !== preset.name) {
    setSynced(preset.name);
    setName(preset.name);
    setSkills(preset.skills.join(','));
    setActive(!!preset.active);
  }
  if (!open && synced !== null) setSynced(null);

  const save = async () => {
    setSaving(true);
    const body = JSON.stringify({ name, skills: skills.split(',').map((s) => s.trim()).filter(Boolean), active });
    try {
      if (preset) await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'PUT', body });
      else await api('/presets', { method: 'POST', body });
      toast.push('已保存', 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={preset ? `编辑预设 · ${preset.name}` : '新建预设'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!name.trim()}>
            保存
          </Button>
        </>
      }
    >
      <FieldInput label="预设名称" value={name} onChange={(e) => setName(e.target.value)} readOnly={!!preset} />
      <FieldInput label="技能（逗号分隔）" placeholder="skill-a, skill-b" value={skills} onChange={(e) => setSkills(e.target.value)} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <Switch checked={active} onChange={setActive} />
        <span className="field-label" style={{ marginBottom: 0 }}>
          启用
        </span>
      </label>
    </Modal>
  );
}