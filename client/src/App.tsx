import { useEffect, useState } from 'react';
import { api, StateView, AgentView, PresetView, SkillView, SyncResult } from './api';

type Tab = 'library' | 'agents' | 'presets' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [state, setState] = useState<StateView | null>(null);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [s, a] = await Promise.all([api<StateView>('/state'), api<AgentView[]>('/agents')]);
      setState(s); setAgents(a); setErr('');
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { load(); }, []);

  const setActive = async (key: string) => {
    await api(`/activeAgents`, { method: 'PUT', body: JSON.stringify([key, ...(state?.activeAgents ?? []).filter((x) => x !== key)]) });
    await load();
  };
  const activatePreset = async (name: string, active: boolean) => {
    const res = await api<{ results: SyncResult[] }>(`/presets/${encodeURIComponent(name)}/activate`, { method: 'POST', body: JSON.stringify({ active }) });
    setErr(res.results.map((x) => `${x.agent} 新建:${x.created.length} 移除:${x.removed.length} 失败:${x.failed.length}`).join(' | ') || 'ok');
    await load();
  };
  const runSync = async () => {
    const res = await api<SyncResult[]>('/sync', { method: 'POST', body: JSON.stringify({}) });
    setErr(res.map((x) => `${x.agent} 新建:${x.created.length} 移除:${x.removed.length} 失败:${x.failed.length}`).join(' | ') || 'none');
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1080, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Skills Hub</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['library', 'agents', 'presets', 'settings'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', fontWeight: tab === t ? 700 : 400 }}>
            {{ library: '资产库', agents: 'Agents', presets: 'Presets', settings: '设置' }[t]}
          </button>
        ))}
        <button onClick={runSync} style={{ marginLeft: 'auto', padding: '6px 14px' }}>立即同步</button>
      </div>
      {err && <pre style={{ background: '#fde', padding: 8 }}>{err}</pre>}
      <button onClick={load} style={{ marginBottom: 12 }}>刷新</button>
      {tab === 'library' && <Library state={state} onLoad={load} />}
      {tab === 'agents' && <AgentsView agents={agents} onLoad={load} />}
      {tab === 'presets' && <PresetsView state={state} onActivate={activatePreset} onLoad={load} />}
      {tab === 'settings' && <SettingsView />}
    </div>
  );
}

function Library({ state, onLoad }: { state: StateView | null; onLoad: () => void }) {
  const toggleTag = async (id: string, tag: string) => {
    const s = state?.skills.find((x) => x.id === id);
    if (!s) return;
    const tags = s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag];
    await api(`/skills/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tags }) });
    onLoad();
  };
  return (
    <div>
      <h3>资产库（{state?.skills.length ?? 0}）</h3>
      {state?.skills.map((s) => <SkillRow key={s.id} s={s} onTag={() => toggleTag(s.id, '常用')} />)}
    </div>
  );
}

function SkillRow({ s, onTag }: { s: SkillView; onTag: () => void }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8 }}>
      <b>{s.name}</b> <span style={{ color: '#888' }}>@{s.source}</span>
      <div style={{ fontSize: 13, color: s.description ? '#555' : '#aaa' }}>{s.description ?? '（无描述）'}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        {s.tags.map((t) => <span key={t} style={{ background: '#def', padding: '1px 6px', borderRadius: 8, marginRight: 6 }}>{t}</span>)}
        <button onClick={onTag} style={{ fontSize: 12 }}>+ 标签</button>
      </div>
    </div>
  );
}

function AgentsView({ agents, onLoad }: { agents: AgentView[]; onLoad: () => void }) {
  const syncMode = async (key: string) => {
    const cur = agents.find((a) => a.key === key)?.sync;
    await api(`/agents/${key}`, { method: 'PUT', body: JSON.stringify({ sync: cur === 'symlink' ? 'copy' : 'symlink' }) });
    onLoad();
  };
  return (
    <div>
      <h3>Agents</h3>
      {agents.map((a) => (
        <div key={a.key} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8, background: a.active ? '#efe' : undefined }}>
          <b>{a.name}</b>{a.family ? <span style={{ color: '#888', marginLeft: 8 }}>家族: {a.family}</span> : null}
          {a.shared ? <span style={{ color: '#a60', marginLeft: 8 }}>共享 ~/{a.shared}</span> : null}
          <div style={{ fontSize: 12, color: '#555' }}>{a.globalDir} · {a.installed ? '已安装' : '未安装'} · 模式: {a.sync}</div>
          <button onClick={() => setActiveFor(a.key, a.active)} style={{ marginTop: 4 }}>{a.active ? '取消活跃' : '设为活跃'}</button>
          <button onClick={() => syncMode(a.key)} style={{ marginLeft: 8 }}>切 {a.sync === 'symlink' ? '复制' : '软链'}</button>
        </div>
      ))}
    </div>
  );
}
async function setActiveFor(key: string, active: boolean) {
  const cur = await api<string[]>('/activeAgents');
  const next = active ? cur.filter((x) => x !== key) : [...cur, key];
  await api('/activeAgents', { method: 'PUT', body: JSON.stringify(next) });
  location.reload();
}

function PresetsView({ state, onActivate, onLoad }: { state: StateView | null; onActivate: (n: string, a: boolean) => void; onLoad: () => void }) {
  const add = async () => {
    const name = prompt('preset 名称');
    if (!name) return;
    await api(`/presets`, { method: 'POST', body: JSON.stringify({ name }) });
    onLoad();
  };
  return (
    <div>
      <h3>Presets <button onClick={add}>+ 新建</button></h3>
      {state?.presets.map((p) => (
        <div key={p.name} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <b>{p.name}</b>（{p.skills.length} skills）
          <button onClick={() => onActivate(p.name, !p.active)} style={{ marginLeft: 8 }}>
            {p.active ? '取消激活' : '激活'}
          </button>
          <div style={{ fontSize: 12, color: '#555' }}>{p.skills.join('、') || '（空）'}</div>
        </div>
      ))}
    </div>
  );
}

function SettingsView() {
  const [info, setInfo] = useState('');
  return (
    <div>
      <h3>设置</h3>
      <p>仓库与来源管理、同步策略默认值、watcher 等将在后续版本提供。</p>
      <p style={{ color: '#888', fontSize: 13 }}>{info}</p>
    </div>
  );
}
