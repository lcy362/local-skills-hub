import { useMemo, useState } from 'react';
import { api, type AgentView, type CustomAgentView, type SettingsView } from '../api/types';
import EntityList from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import SwitchLabel from '../components/ui/SwitchLabel';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import { PathField } from '../components/ui/PathField';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { useQueryFlag, useQueryParam } from '../state/router';

/**
 * 设置（UI-03）：活跃 Agent 集合、Agent 目录覆盖、仓库路径、默认同步策略、watcher 开关、自定义 Agent。
 */
export default function Settings() {
  const { data: agents, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const { data: settings, reload: reloadSettings } = useAsync<SettingsView>(() => api('/settings'));
  const { data: customs, reload: reloadCustoms } = useAsync<CustomAgentView[]>(() => api('/agents/custom'));
  const { data: activeRes, reload: reloadActive } = useAsync<string[]>(() => api('/activeAgents'));
  const toast = useToast();
  // 筛选条件随地址持久化，刷新后保持当前页面的查看状态
  const [q, setQ] = useQueryParam('q');
  const [onlyInstalled, setOnlyInstalled] = useQueryFlag('installed');
  const [addOpen, setAddOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activeSet = useMemo(() => new Set(activeRes ?? []), [activeRes]);
  const [viewMode, setViewMode] = useViewMode();

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (agents ?? []).filter((a) => {
      if (onlyInstalled && !a.installed) return false;
      if (!kw) return true;
      return `${a.name} ${a.key} ${a.globalDir}`.toLowerCase().includes(kw);
    });
  }, [agents, q, onlyInstalled]);

  /** 加入/移出活跃集合即刻触发同步（AA-04） */
  const setActive = async (key: string, on: boolean) => {
    const next = on
      ? [...(activeRes ?? []), key]
      : (activeRes ?? []).filter((k) => k !== key);
    setBusyKey(key);
    try {
      await api('/activeAgents', { method: 'PUT', body: JSON.stringify(next) });
      toast.push(on ? `已把 ${key} 加入活跃集合并同步` : `已把 ${key} 移出活跃集合`, 'good');
      reloadActive(); reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusyKey(null); }
  };

  const putSetting = async (patch: Partial<SettingsView>) => {
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(patch) });
      toast.push('设置已保存', 'good');
      reloadSettings(); reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader title="设置" sub="活跃 Agent、目录与同步策略" actions={<Button variant="ghost" onClick={() => { reload(); reloadActive(); reloadSettings(); reloadCustoms(); }}>刷新</Button>} />

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
          活跃 Agent（实时同步作用域 · AA-01）
        </div>
        <p style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)', marginBottom: 'var(--sp-4)' }}>
          加入集合即刻把当前生效的 preset / 标签组合同步到该 Agent 目录；移出则不再被自动改动。
        </p>
        <LoadingBoundary state={{ loading, error, data: activeRes }} empty={{ title: '暂无 Agent', icon: '◉' }}>
          {() => (
            <>
              <div style={{ marginBottom: 'var(--sp-3)' }}>
                <FilterBar
                  search={{ value: q, onChange: setQ, placeholder: '搜索名称 / key / 目录' }}
                  controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>只看已安装</SwitchLabel>}
                  hasFilters={!!q.trim() || onlyInstalled}
                  onReset={() => { setQ(''); setOnlyInstalled(false); }}
                  actions={<Badge tone="accent">已选 {(activeRes ?? []).length}</Badge>}
                  view={{ value: viewMode, onChange: setViewMode }}
                />
              </div>
              <EntityList
                items={shown.map((a) => ({
                  id: a.key,
                  title: a.name,
                  sub: <span className="mono">{a.globalDir}</span>,
                  status: busyKey === a.key ? <Badge tone="accent">同步中…</Badge> : undefined,
                  badges: (
                    <>
                      {a.installed ? <Badge tone="good">已安装</Badge> : <Badge tone="neutral">未安装</Badge>}
                      {a.family && <Badge tone="accent">{a.family}</Badge>}
                    </>
                  ),
                  toggle: (
                    <Switch
                      aria-label={`活跃 ${a.name}`}
                      checked={activeSet.has(a.key)}
                      onChange={(v) => void setActive(a.key, v)}
                    />
                  ),
                  muted: !activeSet.has(a.key),
                }))}
                hideToggle
              />
            </>
          )}
        </LoadingBoundary>
      </div>

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
          同步策略（SY-02 / SY-04）
        </div>
        <LoadingBoundary state={{ loading, error, data: settings }} empty={{ title: '无设置', icon: '⚙' }}>
          {(s) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ maxWidth: 260 }}>
                <FieldSelect
                  label="默认安装方式"
                  value={s.defaultSync}
                  onChange={(e) => void putSetting({ defaultSync: e.target.value as SettingsView['defaultSync'] })}
                >
                  <option value="symlink">软链（零冗余，默认）</option>
                  <option value="copy">复制（兼容性最好）</option>
                </FieldSelect>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <Switch checked={s.watchers} onChange={(v) => void putSetting({ watchers: v })} />
                  <span style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>
                    复制模式目录级 watcher（可选，默认关闭）
                  </span>
                </label>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-1)' }}>
                  开启后监听仓库变化并增量同步到「复制」策略的 Agent；全局 skill 同步始终是触发式，无需常驻。
                </div>
              </div>
            </div>
          )}
        </LoadingBoundary>
      </div>

      <div className="panel">
        {(customs ?? []).length === 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <span className="page-head__title" style={{ fontSize: 'var(--fs-16)' }}>自定义 Agent（AG-03）</span>
              <Button size="sm" onClick={() => setAddOpen(true)}>新增</Button>
            </div>
            <EmptyState title="暂无自定义 Agent" hint="内置清单之外的工具可在此登记，填写其全局 skill 目录。" />
          </>
        ) : (
          <EntityList
            title="自定义 Agent（AG-03）"
            toolbar={<Button size="sm" onClick={() => setAddOpen(true)}>新增</Button>}
            hideToggle
            items={(customs ?? []).map((c) => ({
              id: c.key,
              title: c.name,
              sub: <span className="mono">{c.key}</span>,
              desc: <span className="mono">{c.globalDir}{c.projectDir ? ` · ${c.projectDir}` : ''}</span>,
              status: c.recursive ? <Badge tone="info">递归扫描</Badge> : undefined,
              actions: (
                <Button size="sm" variant="danger" onClick={async () => {
                  try { await api(`/agents/custom/${encodeURIComponent(c.key)}`, { method: 'DELETE' }); toast.push('已删除', 'good'); reloadCustoms(); reload(); }
                  catch (e) { toast.push(e instanceof Error ? e.message : String(e), 'bad'); }
                }}>删除</Button>
              ),
            }))}
          />
        )}
      </div>

      <AddAgentModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reloadCustoms(); reload(); }} />
    </>
  );
}

function AddAgentModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [globalDir, setGlobalDir] = useState('');
  const [projectDir, setProjectDir] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/agents/custom', {
        method: 'POST',
        body: JSON.stringify({ key: key.trim(), name: name.trim() || key.trim(), globalDir: globalDir.trim(), projectDir: projectDir.trim() || undefined, recursive }),
      });
      toast.push('已新增 Agent', 'good');
      setKey(''); setName(''); setGlobalDir(''); setProjectDir(''); setRecursive(false);
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title="新增自定义 Agent"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} disabled={!key.trim() || !globalDir.trim()} onClick={submit}>新增</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput label="Key（唯一）" placeholder="my-tool" value={key} onChange={(e) => setKey(e.target.value)} />
          <FieldInput label="名称" placeholder="My Tool" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <PathField label="全局 skill 目录" placeholder="/Users/me/.my-tool/skills" value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label="项目级目录（可选，相对项目根）"
          hint="相对路径，不支持系统选择器，请手动输入"
          placeholder=".my-tool/skills"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <Switch checked={recursive} onChange={setRecursive} />
          <span style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>递归扫描（嵌套分类布局）</span>
        </label>
      </div>
    </Modal>
  );
}
