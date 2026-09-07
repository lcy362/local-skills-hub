import { useEffect, useState } from 'react';
import { api, DiagnoseResult, DiagItem, DiagDimension, IntegrateGroup, SyncResult } from './api';

/** 展示顺序：config/repo/project/agent/durability/tags 在报告区；sync 独立；dup 由收编交互承接 */
const DIM_ORDER: DiagDimension[] = ['config', 'repo', 'project', 'agent', 'durability', 'tags'];

const DIM_LABEL: Record<DiagDimension, string> = {
  agent: 'Agent', sync: '同步', dup: '重复 Skill', durability: '失效软链',
  config: '配置', repo: '仓库', project: '项目', tags: '标签来源',
};

function statusClass(s: DiagItem['status']): string {
  // CSS 无 .status-error，error 态复用 .status-bad
  return s === 'ok' ? 'status-ok' : s === 'warn' ? 'status-warn' : 'status-bad';
}
function dotClass(s: DiagItem['status']): string {
  return `dot dot--${s === 'ok' ? 'good' : s === 'warn' ? 'warn' : 'bad'}`;
}

function DiagRows({ items }: { items: DiagItem[] }) {
  if (items.length === 0) return <div className="empty">暂无该项可诊断</div>;
  return (
    <>
      {items.map((it) => (
        <div className="diagrow" key={it.key}>
          <span className={dotClass(it.status)} />
          <span className={statusClass(it.status)}>{it.message}</span>
        </div>
      ))}
    </>
  );
}

export function HealthView({ onMsg, refreshGlobal }: { onMsg: (m: string) => void; refreshGlobal: () => void }) {
  const [report, setReport] = useState<DiagnoseResult | null>(null);
  const [diagErr, setDiagErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // 收编面板（迁移自原 IntegrateView）
  const [groups, setGroups] = useState<IntegrateGroup[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [dupLoading, setDupLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true); setDiagErr('');
    try { setReport(await api<DiagnoseResult>('/diagnose')); }
    catch (e) { setDiagErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadGroups = async () => {
    setDupLoading(true);
    try {
      const r = await api<{ groups: IntegrateGroup[] }>('/integrate/preview', { method: 'POST', body: JSON.stringify({}) });
      setGroups(r.groups);
      const init: Record<string, string> = {};
      for (const g of r.groups) {
        if (g.candidates.some((c) => c.inRepo)) init[g.name] = g.candidates.find((c) => c.inRepo)!.id;
        else if (g.candidates.length > 0) init[g.name] = g.candidates[0].id;
      }
      setSel(init);
    } catch (e) { onMsg((e as Error).message); }
    finally { setDupLoading(false); }
  };

  useEffect(() => { loadReport(); loadGroups(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncResult[]>('/sync', { method: 'POST', body: JSON.stringify({}) });
      onMsg(res.map((x) => `${x.agent} +${x.created.length} −${x.removed.length} ✕${x.failed.length}`).join('  ·  ') || '无活跃 agent');
      await Promise.all([loadReport(), refreshGlobal()]);
    } catch (e) { onMsg((e as Error).message); }
    finally { setSyncing(false); }
  };

  const apply = async () => {
    const decisions = groups.map((g) => sel[g.name] ? { name: g.name, selectId: sel[g.name] } : { name: g.name, skip: true });
    try {
      const r = await api<{ results: { name: string; adopted: boolean }[] }>('/integrate', { method: 'POST', body: JSON.stringify({ decisions }) });
      onMsg(`收编 ${r.results.filter((x) => x.adopted).length} · 跳过 ${r.results.filter((x) => !x.adopted).length}`);
      await Promise.all([loadGroups(), loadReport()]);
    } catch (e) { onMsg((e as Error).message); }
  };

  const syncItems = report?.groups.sync ?? [];
  const syncWarn = syncItems.some((x) => x.status !== 'ok');
  const dupGroups = groups.filter((g) => g.candidates.length > 1);

  return (
    <>
      {/* 概览盘 */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">体检中心</h2>
          <span className="panel__hint">{report?.config ?? '体检中…'}</span>
          <div className="panel__actions">
            <button className="btn" onClick={loadReport}>刷新</button>
            <button className="btn btn--primary" onClick={handleSync} disabled={syncing}>{syncing ? '同步中…' : '立即同步'}</button>
          </div>
        </div>
        {report && (
          <div className="filterbar">
            {DIM_ORDER.map((d) => {
              const s = report.summary[d];
              const bad = s.warn + s.error;
              return (
                <span key={d} className={`badge${bad ? ' badge--warn' : ' badge--state'}`}>
                  {DIM_LABEL[d]} · {s.total}（○{bad ? bad : s.ok}）
                </span>
              );
            })}
            <span className={`badge${syncWarn ? ' badge--warn' : ' badge--state'}`}>同步{warnN(syncItems)}</span>
          </div>
        )}
      </div>

      {/* 同步告警区 */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">同步状态</h2>
          <span className="panel__hint">只读比对期望 skill 集合与实际部署集合；分歧项可一键修复</span>
          {syncWarn && (
            <div className="panel__actions">
              <button className="btn btn--primary" onClick={handleSync} disabled={syncing}>{syncing ? '修复中…' : '修复 / 同步'}</button>
            </div>
          )}
        </div>
        {diagErr && <div className="msgbar">{diagErr}</div>}
        {loading ? <div className="empty">体检中…</div> : <DiagRows items={syncItems} />}
      </div>

      {/* 诊断报告区 */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">诊断明细</h2>
          <span className="panel__hint">配置 / 仓库 / 项目 / Agent / 失效软链 / 标签来源</span>
        </div>
        {loading || diagErr ? (
          diagErr ? <div className="msgbar">{diagErr}</div> : <div className="empty">体检中…</div>
        ) : (
          DIM_ORDER.map((d) => {
            const items = report?.groups[d] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={d} className="diag-block">
                <div className="diag-block__label">{DIM_LABEL[d]}</div>
                <DiagRows items={items} />
              </div>
            );
          })
        )}
      </div>

      {/* 重复 skill 收编区 */}
      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">重复 Skill 收编</h2>
          <span className="panel__hint">同一个 skill 也可能来自多个目录/仓库。为每组选一个「保留版」，其余不再重复投放。</span>
          <div className="panel__actions">
            <button className="btn" onClick={loadGroups} disabled={dupLoading}>刷新预览</button>
            <button className="btn btn--primary" onClick={apply}>应用所选收编</button>
          </div>
        </div>
        {dupLoading ? (
          <div className="empty">扫描中…</div>
        ) : dupGroups.length === 0 ? (
          <div className="empty">无同名多来源，无需收编</div>
        ) : (
          dupGroups.map((g) => (
            <div className="igroup" key={g.name}>
              <div className="igroup__name">{g.name}<span className="badge badge--off">{g.candidates.length} 来源</span></div>
              <div className="igroup__opts">
                {g.candidates.map((c) => (
                  <label key={c.id} className={`igroup__opt${sel[g.name] === c.id ? ' is-sel' : ''}`}>
                    <input type="radio" name={g.name} checked={sel[g.name] === c.id} onChange={() => setSel({ ...sel, [g.name]: c.id })} />
                    {c.sourceLabel} {c.inRepo ? '· 已在仓库' : '· 需收编'}
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function warnN(items: { status: string }[]): string {
  const n = items.filter((x) => x.status !== 'ok').length;
  return n ? `· ⚠${n}` : '· ✓';
}