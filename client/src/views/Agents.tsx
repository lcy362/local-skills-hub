import { useMemo, useState } from 'react';
import { api, type AgentView, type AgentSkillsResp, type PresetView, type SkillAction, type SkillCardView, type AddableSkill, type SyncResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import AddableSkillList from '../components/skill/AddableSkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import SwitchLabel from '../components/ui/SwitchLabel';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import { PathField } from '../components/ui/PathField';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { navigate, useQueryFlag, useQueryParam, useRoute } from '../state/router';

export default function Agents() {
  const { data, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const route = useRoute();
  const [q, setQ] = useQueryParam('q');
  const [onlyInstalled, setOnlyInstalled] = useQueryFlag('installed');

  // 详情页由地址决定：直达 / 刷新都能稳定回到同一个 Agent
  const selectedKey = route.sub;
  const selected = selectedKey ? (data ?? []).find((a) => a.key === selectedKey) : null;
  const openAgent = (key: string) => navigate({ ...route, sub: key });
  const backToList = () => navigate({ ...route, sub: null });

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (data ?? []).filter((a) => {
      if (onlyInstalled && !a.installed) return false;
      if (!kw) return true;
      return `${a.name} ${a.key} ${a.globalDir}`.toLowerCase().includes(kw);
    });
  }, [data, q, onlyInstalled]);
  const filtered = !!q.trim() || onlyInstalled;

  const items: EntityItem[] = shown.map((a) => ({
    id: a.key,
    title: a.name,
    sub: <span className="mono">{a.key}</span>,
    desc: <span className="mono">{a.globalDir}</span>,
    status: a.active ? <Badge tone="good" dot="good">活跃</Badge> : <Badge tone="neutral" dot="neutral">非活跃</Badge>,
    badges: (
      <>
        <Badge tone="info" title={a.sync === 'symlink' ? '以软链方式分发' : '以副本方式分发'}>
          {a.sync === 'symlink' ? '软链' : '副本'}
        </Badge>
        <Badge tone="accent">{a.mode === 'preset' ? '预设模式' : '手动模式'}</Badge>
        {a.family && <Badge tone="accent">{a.family}</Badge>}
        {a.sharedWith.length > 0 && (
          <Badge tone="warn" title={`与 ${a.sharedWith.join('、')} 共用同一目录`}>共享目录</Badge>
        )}
        {!a.installed && <Badge tone="neutral">未安装</Badge>}
      </>
    ),
    onClick: () => openAgent(a.key),
    muted: !a.active,
  }));

  return (
    <>
      <PageHeader title="Agents" sub={data ? `共 ${data.length} 个 Agent` : undefined} actions={<Button variant="ghost" onClick={reload}>刷新</Button>} />
      {selectedKey ? (
        selected ? (
          <AgentDetail agent={selected} onBack={backToList} onChanged={reload} />
        ) : (
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '未找到该 Agent', hint: `没有 key 为「${selectedKey}」的 Agent。`, icon: '◉' }}
          >
            {() => null}
          </LoadingBoundary>
        )
      ) : (
        <>
          <div className="panel">
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: '搜索名称 / key / 目录' }}
              controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>只看已安装</SwitchLabel>}
              hasFilters={filtered}
              onReset={() => { setQ(''); setOnlyInstalled(false); }}
            />
          </div>
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '暂无 Agent', hint: '系统中尚未登记任何 Agent。', icon: '◉' }}
          >
            {() => (
              <EntityList
                items={items}
                title={`${filtered ? '筛选结果' : '全部 Agent'} · ${items.length}${filtered ? ` / ${(data ?? []).length}` : ''}`}
              />
            )}
          </LoadingBoundary>
        </>
      )}
    </>
  );
}

function AgentDetail({ agent, onBack, onChanged }: { agent: AgentView; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<AgentSkillsResp>(
    () => api(`/agents/${encodeURIComponent(agent.key)}/skills`),
    [agent.key]
  );
  const { data: presets } = useAsync<PresetView[]>(() => api('/presets'));
  const [addOpen, setAddOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.push('已更新', 'good');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncResult>(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' });
      setLastSync(res);
      const failed = res.failed?.length ?? 0;
      if (failed > 0) toast.push(`同步完成，但有 ${failed} 项失败`, 'bad');
      else toast.push(`已同步：新增 ${res.created.length} / 移除 ${res.removed.length}`, 'good');
      for (const w of res.warnings ?? []) toast.push(w, 'bad');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setSyncing(false); }
  };

  const handleAction = (item: SkillCardView, action: SkillAction) => {
    void busy(async () => {
      switch (action.kind) {
        case 'delete':
          await api(`/agents/${encodeURIComponent(agent.key)}/skills/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
          break;
        case 'collect':
          await api(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' });
          break;
        case 'toggle':
        default:
          await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) });
      }
    });
  };

  const handleToggle = (item: SkillCardView) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) })
    );

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  // 每 (skill, Agent) 关系的同步策略（SY-01）
  const setSkillSync = (name: string, mode: 'symlink' | 'copy') =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skillSync: { [name]: mode } }) })
    );

  const toggleActive = () => void busy(async () => {
    const res = await api<string[]>('/activeAgents');
    const next = agent.active ? res.filter((k) => k !== agent.key) : [...res, agent.key];
    await api('/activeAgents', { method: 'PUT', body: JSON.stringify(next) });
  });

  const managed = (data?.skills ?? []).filter((s) => s.state === 'on');

  const failedItems: EntityItem[] = (lastSync?.failed ?? []).map((f) => ({
    id: f.skill,
    title: f.skill,
    sub: f.reason,
    status: <Badge tone="bad">失败</Badge>,
  }));

  const syncModeItems: EntityItem[] = managed.map((s) => ({
    id: s.id,
    title: s.name,
    sub: <span className="mono">{s.source}</span>,
    actions: (
      <FieldSelect
        aria-label={`${s.name} 安装方式`}
        value={agent.skillSync?.[s.name] ?? agent.sync}
        onChange={(e) => setSkillSync(s.name, e.target.value as 'symlink' | 'copy')}
      >
        <option value="symlink">软链</option>
        <option value="copy">复制</option>
      </FieldSelect>
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{agent.name}</h2>
        <Badge tone={agent.active ? 'good' : 'neutral'} dot={agent.active ? 'good' : 'neutral'}>
          {agent.active ? '活跃' : '非活跃'}
        </Badge>
        {agent.family && <Badge tone="accent">{agent.family} 家族</Badge>}
        <div className="detail-actions">
          <Button size="sm" variant={agent.active ? 'ghost' : 'primary'} onClick={toggleActive} title="加入/移出活跃集合（加入即刻就位）">
            {agent.active ? '移出活跃' : '设为活跃'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDirOpen(true)} title="覆盖该 Agent 的全局/项目 skill 目录">
            目录
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} title="把技能库里的技能加入此 Agent">添加</Button>
          <Button size="sm" variant="primary" loading={syncing} onClick={() => void runSync()} title="重新部署该 Agent 的技能">同步</Button>
        </div>
      </div>

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>分发策略</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
          <FieldSelect
            label="管理模式"
            value={agent.mode}
            hint={agent.mode === 'preset' ? '激活的 preset 即分发到此 Agent' : '仅分发手动开启的技能'}
            onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ mode: e.target.value }) }))}
          >
            <option value="preset">预设模式（默认）</option>
            <option value="manual">手动模式</option>
          </FieldSelect>
          <FieldSelect
            label="关联预设"
            value={agent.preset ?? ''}
            hint="不选则跟随所有已激活 preset"
            disabled={agent.mode !== 'preset'}
            onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ preset: e.target.value || null }) }))}
          >
            <option value="">跟随已激活预设</option>
            {(presets ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </FieldSelect>
          <FieldSelect
            label="默认安装方式"
            value={agent.sync}
            hint="可在下方按技能单独覆盖"
            onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ sync: e.target.value }) }))}
          >
            <option value="symlink">软链</option>
            <option value="copy">复制</option>
          </FieldSelect>
        </div>
        <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          <span className="mono">全局 {agent.globalDir}</span>
          {agent.project && <span className="mono">项目 {agent.project}</span>}
          {agent.sharedWith.length > 0 && <span>与 {agent.sharedWith.join('、')} 共用同一目录，分发一次即同时生效</span>}
          {agent.alsoUsedBy?.length ? <span>该目录亦被 {agent.alsoUsedBy.join('、')} 读取</span> : null}
        </div>
      </div>

      {lastSync && lastSync.failed.length > 0 && (
        <div className="panel">
          <EntityList title="同步失败项（SY-05）" items={failedItems} />
        </div>
      )}

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该 Agent 暂无技能', icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList
              title={`已管理技能（${resp.skills.length}）`}
              items={resp.skills}
              onToggle={handleToggle}
              onAction={handleAction}
            />
          </div>
        )}
      </LoadingBoundary>

      <div className="panel">
        <EntityList
          title="按技能选择安装方式（SY-01）"
          items={syncModeItems}
          empty={<EmptyState title="当前没有已启用的技能" />}
        />
      </div>

      <Modal open={addOpen} title="添加技能" onClose={() => setAddOpen(false)}
        footer={<Button variant="ghost" onClick={() => setAddOpen(false)}>关闭</Button>}>
        <AddableSkillList items={data?.addable ?? []} onAdd={collectAddable} />
      </Modal>

      <DirModal
        open={dirOpen}
        agent={agent}
        onClose={() => setDirOpen(false)}
        onDone={() => { setDirOpen(false); onChanged(); }}
      />
    </>
  );
}

/** Agent 目录覆盖（AG-04 / AG-05） */
function DirModal({ open, agent, onClose, onDone }: { open: boolean; agent: AgentView; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [globalDir, setGlobalDir] = useState(agent.globalDir);
  const [projectDir, setProjectDir] = useState(agent.project ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/agents/${encodeURIComponent(agent.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ globalDir: globalDir.trim() || null, projectDir: projectDir.trim() || null }),
      });
      toast.push('目录已覆盖', 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={`覆盖目录 · ${agent.name}`}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={save}>保存</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label="全局 skill 目录" value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label="项目级目录（相对项目根）"
          hint="相对路径，不支持系统选择器，请手动输入"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>留空恢复内置约定；覆盖后视为已安装可用。</span>
      </div>
    </Modal>
  );
}
