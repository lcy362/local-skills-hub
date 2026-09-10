import { useState } from 'react';
import { api, type DiagnoseResult, type DiagItem } from '../api/types';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { useAsync } from '../state/useAsync';
import { useToast } from '../components/ui/Toast';

/** 诊断 summary / 分组 键的本地化映射 */
const KEY_LABEL: Record<string, string> = {
  repos: '仓库', skills: '技能', agents: '智能体', presets: '预设',
  projects: '项目', sources: '来源', sync: '同步', config: '配置',
};

/** 可一键修复的诊断项 key 判定 */
function fixable(it: DiagItem): boolean {
  if (it.status === 'ok') return false;
  return /^(sync:|broken:|project:|repo:|agent:)/.test(it.key);
}

export default function Health() {
  const { data, loading, error, reload } = useAsync<DiagnoseResult>(() => api('/diagnose'));
  const [fixing, setFixing] = useState<string | null>(null);
  const toast = useToast();

  const runFix = async (key: string) => {
    setFixing(key);
    try {
      const res = await api<{ key: string; applied: boolean; message: string }>('/fix', { method: 'POST', body: JSON.stringify({ key }) });
      toast.push(res.applied ? `已修复：${res.message}` : `无法自动修复：${res.message}`, res.applied ? 'good' : 'bad');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setFixing(null);
    }
  };

  const tone = (s: DiagItem['status']) => {
    if (s === 'ok') return 'good' as const;
    if (s === 'warn') return 'warn' as const;
    return 'bad' as const;
  };
  const label = (s: DiagItem['status']) => (s === 'ok' ? 'OK' : s === 'warn' ? '警告' : '错误');

  return (
    <>
      <PageHeader
        title="诊断"
        sub={data ? data.config : undefined}
        actions={<Button variant="ghost" onClick={reload}>重新诊断</Button>}
      />
      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '没有诊断结果', hint: '运行诊断以检查技能库健康状态。', icon: '◎' }}>
        {(diag) => (
          <>
            <div className="panel">
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {Object.entries(diag.summary).map(([k, s]) => (
                  <div key={k} style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                    <span className="field-label">{KEY_LABEL[k] ?? k}</span>
                    <span style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                      <Badge tone="good">{s.ok}</Badge>
                      <Badge tone="warn">{s.warn}</Badge>
                      <Badge tone="bad">{s.error}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(diag.groups).length === 0 ? (
              <EmptyState title="一切正常" hint="没有检测到任何问题。" icon="✓" />
            ) : (
              Object.entries(diag.groups).map(([group, items]) => (
                <div key={group} className="panel" style={{ padding: 0 }}>
                  <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: '1px solid var(--c-line)' }}>
                    <span className="page-head__title" style={{ fontSize: 'var(--fs-16)' }}>{KEY_LABEL[group] ?? group}</span>
                    <span className="mono" style={{ color: 'var(--c-ink-3)', marginLeft: 'var(--sp-2)' }}>{items.length}</span>
                  </div>
                  {items.length === 0 && <div style={{ padding: 'var(--sp-4) var(--sp-6)' }}><EmptyState title="无异常" /></div>}
                  <div className="diag-group" style={{ padding: 'var(--sp-2) var(--sp-6)' }}>
                    {items.map((it) => (
                      <div key={it.key} className="diag-row">
                        <Badge tone={tone(it.status)} dot={it.status === 'ok' ? 'good' : it.status === 'warn' ? 'warn' : 'bad'}>
                          {label(it.status)}
                        </Badge>
                        <span className="diag-row__msg">{it.message}</span>
                        {it.detail !== undefined && <span className="diag-row__detail">{String(it.detail)}</span>}
                        {fixable(it) && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={fixing === it.key}
                            onClick={() => void runFix(it.key)}
                          >
                            修复
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </LoadingBoundary>
    </>
  );
}