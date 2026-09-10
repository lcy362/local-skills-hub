import { useState } from 'react';
import { api } from '../../api/types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { useToast } from '../ui/Toast';

export interface MergeCandidateItem {
  id: string; // name#<source>
  name: string;
  source: string;
  sourceLabel: string;
  dir: string;
  inRepo: boolean;
  description?: string;
}
export interface MergeGroupItem {
  name: string;
  candidates: MergeCandidateItem[];
}

/**
 * 归集后的合并/接管确认面板（PRD 流程二/三）：对有多个来源同名技能的组，
 * 让用户选择保留哪个版本；可收编 agent 版本到主仓库或忽略。
 */
export default function MergePanel({
  groups,
  onDone,
}: {
  groups: MergeGroupItem[];
  onDone: () => void;
}) {
  const toast = useToast();
  const hasConflict = groups.some((g) => g.candidates.length > 1);
  // 仅处理有冲突（多来源同名）或有 agent 版本待收编的组
  const actionable = groups.filter((g) => g.candidates.length > 1 || g.candidates.some((c) => !c.inRepo));

  if (actionable.length === 0) {
    return (
      <div className="panel" style={{ borderStyle: 'dashed' }}>
        <div className="empty">
          <div style={{ fontSize: '28px' }}>{hasConflict ? '⚖' : '✓'}</div>
          <div className="empty__title">{hasConflict ? '请处理同名冲突' : '无同名冲突'}</div>
          <div className="empty__hint">
            {hasConflict ? '存在多个来源的同名技能，需决定保留哪个版本。' : '所有技能来源唯一，无需合并。'}
          </div>
          <Button variant="primary" onClick={onDone}>下一步</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
        合并 / 接管同名技能
      </div>
      <p style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)', marginBottom: 'var(--sp-4)' }}>
        下方技能在不同来源出现，或尚未收编进仓库。请选择要保留的来源，或将它收编/忽略。
      </p>
      {actionable.map((g) => (
        <MergeGroup key={g.name} group={g} toast={toast} />
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
        <Button variant="primary" onClick={onDone}>完成</Button>
      </div>
    </div>
  );
}

function MergeGroup({ group, toast }: { group: MergeGroupItem; toast: ReturnType<typeof useToast> }) {
  const [keep, setKeep] = useState<string>(group.candidates[0]?.id ?? '');
  const [busyId, setBusyId] = useState<string | null>(null);

  const merge = async (c: MergeCandidateItem) => {
    setBusyId(c.id);
    try {
      if (!c.inRepo) {
        // 收编到主仓库
        await api('/skills/merge', { method: 'POST', body: JSON.stringify({ name: group.name, keepSource: c.source }) });
        toast.push(`已保留「${group.name}」来自 ${c.sourceLabel}${c.inRepo ? '' : '（已收编）'}`, 'good');
      } else {
        await api('/skills/merge', { method: 'POST', body: JSON.stringify({ name: group.name, keepSource: c.source }) });
        toast.push(`已保留 ${c.sourceLabel} 版本`, 'good');
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="skill-list" style={{ marginBottom: 'var(--sp-3)' }}>
      <div className="skill-row" style={{ background: 'transparent' }}>
        <div className="skill-row__main">
          <div className="skill-row__title">{group.name}</div>
        </div>
      </div>
      {group.candidates.map((c) => (
        <div key={c.id} className="skill-row">
          <label className="skill-row__main" style={{ cursor: 'pointer', flex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input type="radio" name={`merge-${group.name}`} checked={keep === c.id} onChange={() => setKeep(c.id)} />
              <span className="skill-row__title">{c.sourceLabel}</span>
            </span>
            {c.inRepo ? <Badge tone="good">仓库本体</Badge> : <Badge tone="accent">待收编</Badge>}
            {c.description && <div className="skill-row__sub">{c.description}</div>}
          </label>
          <div className="skill-row__right">
            <Button size="sm" variant="primary" loading={busyId === c.id} onClick={() => void merge(c)}>
              保留
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}