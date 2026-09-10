import { useState } from 'react';
import { api, type SourceView } from '../api/types';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

export default function Sources() {
  const { data, loading, error, reload } = useAsync<SourceView[]>(() => api('/sources'));
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const toggleSystem = async (s: SourceView, system: 'upstream' | 'hub', v: boolean) => {
    try {
      const body: Record<string, unknown> = { upstream: s.tagSystems?.upstream ?? true, hub: s.tagSystems?.hub ?? false };
      body[system] = v;
      await api(`/sources/${encodeURIComponent(s.id)}/tags`, { method: 'PUT', body: JSON.stringify(body) });
      toast.push(`已${v ? '启用' : '停用'}「${system}」标签`, 'good');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.push('已删除', 'good');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title="第三方 skill 库"
        sub={data ? `共 ${data.length} 个库` : undefined}
        actions={<Button onClick={() => setAddOpen(true)}>登记库</Button>}
      />
      <LoadingBoundary
        state={{ loading, error, data }}
        empty={{ title: '尚未登记第三方库', hint: '登记开放内容库以统一浏览其技能与标签。', icon: '◈' }}
      >
        {(sources) => (
          <div className="skill-list">
            {sources.map((s) => {
              const det = (s as SourceView & { detected?: { tagSystems: { upstream: boolean; hub: boolean } } }).detected?.tagSystems;
              return (
                <div key={s.id} className="skill-row">
                  <div className="skill-row__main">
                    <div className="skill-row__title">{s.name || s.id}</div>
                    <div className="skill-row__sub mono">{s.path}</div>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      {s.linked ? <Badge tone="info">{s.layout} · 只读关联</Badge> : <Badge tone="accent">{s.layout} · 已收编</Badge>}
                      {det?.upstream && <Badge tone="good">自带标签可探测</Badge>}
                      {det?.hub && <Badge tone="info">hub 标签可探测</Badge>}
                      {!det?.upstream && !det?.hub && <Badge tone="neutral">无自带标签</Badge>}
                    </div>
                  </div>
                  <div className="skill-row__right" style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', alignItems: 'center' }}>
                      <span className="field-label">自带</span>
                      <Switch checked={s.tagSystems?.upstream ?? true} onChange={(v) => void toggleSystem(s, 'upstream', v)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', alignItems: 'center' }}>
                      <span className="field-label">hub</span>
                      <Switch checked={s.tagSystems?.hub ?? false} onChange={(v) => void toggleSystem(s, 'hub', v)} />
                    </div>
                    <Button size="sm" variant="danger" onClick={() => void remove(s.id)}>删除</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </LoadingBoundary>

      <AddSourceModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />
    </>
  );
}

function AddSourceModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [layout, setLayout] = useState('nested');
  const [linked, setLinked] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (!id.trim() || !path.trim()) throw new Error('id 与路径必填');
      await api('/sources', { method: 'POST', body: JSON.stringify({ id: id.trim(), name: name.trim() || id.trim(), path: path.trim(), layout, linked }) });
      toast.push('已登记库', 'good');
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
      title="登记第三方 skill 库"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={submit}>登记</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput label="ID（唯一）" placeholder="my-lib" value={id} onChange={(e) => setId(e.target.value)} />
          <FieldInput label="名称" placeholder="第三方库" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <FieldInput label="路径" placeholder="/path/to/library" value={path} onChange={(e) => setPath(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--sp-3)', alignItems: 'flex-end' }}>
          <FieldSelect label="布局" value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="nested">nested</option>
            <option value="flat">flat</option>
          </FieldSelect>
          <label className="switch" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            <span className="switch__track" />
            <span style={{ marginLeft: 'var(--sp-2)', color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>只读关联</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}