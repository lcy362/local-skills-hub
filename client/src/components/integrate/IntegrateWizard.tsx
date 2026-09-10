import { useState } from 'react';
import { api, type IntegrateGroup } from '../../api/types';
import EntityList from '../common/EntityList';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useToast } from '../ui/Toast';

/**
 * 整合向导（IM-01 / IM-02）：
 * 扫描各 Agent 目录与仓库，列出同名多来源的候选，由用户确认保留/收编哪个版本。
 */
export default function IntegrateWizard({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<IntegrateGroup[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = async () => {
    setPreviewing(true);
    try {
      const res = await api<{ groups: IntegrateGroup[] }>('/integrate/preview', { method: 'POST' });
      setGroups(res.groups);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setPreviewing(false); }
  };

  /** actionable：有冲突（多来源同名）或有 agent 版本待收编 */
  const actionable = (groups ?? []).filter((g) => g.candidates.length > 1 || g.candidates.some((c) => !c.inRepo));

  const apply = async (name: string, selectId: string, repoId?: string) => {
    setApplying(true);
    try {
      await api('/integrate', { method: 'POST', body: JSON.stringify({ decisions: [{ name, selectId, repoId }] }) });
      toast.push(`已处理 ${name}`, 'good');
      await preview();
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setApplying(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <Button size="sm" loading={previewing} onClick={() => void preview()}>扫描整合</Button>
        {groups && <span style={{ color: 'var(--c-ink-3)', fontSize: 'var(--fs-13)', alignSelf: 'center' }}>
          共 {groups.length} 组，{actionable.length} 组待处理
        </span>}
      </div>

      {groups && actionable.length === 0 && (
        <Empty>所有技能来源唯一，无需整合。</Empty>
      )}

      {actionable.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {actionable.map((g) => (
            <EntityList
              key={g.name}
              title={g.name}
              toolbar={<span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{g.candidates.length} 个来源</span>}
              items={g.candidates.map((c) => ({
                id: c.id,
                title: c.sourceLabel,
                sub: <span className="mono">{c.dir}</span>,
                desc: c.description,
                status: c.inRepo ? <Badge tone="good">仓库本体</Badge> : <Badge tone="accent">待收编</Badge>,
                actions: (
                  <Button size="sm" variant="primary" loading={applying} onClick={() => void apply(g.name, c.id)}>
                    {c.inRepo ? '保留此版本' : '收编并保留'}
                  </Button>
                ),
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel" style={{ borderStyle: 'dashed' }}>
      <div className="empty">
        <div style={{ fontSize: '28px' }}>✓</div>
        <div className="empty__hint">{children}</div>
      </div>
    </div>
  );
}
