import { useState } from 'react';
import type { SkillAction, SkillCardView } from '../../api/types';
import SkillCard from './SkillCard';
import SkillListRow from './SkillListRow';
import Segment from '../ui/Segment';

export type SkillView = 'card' | 'list';

interface SkillListProps {
  items: SkillCardView[];
  view?: SkillView;
  defaultView?: SkillView;
  onViewChange?: (v: SkillView) => void;
  onToggle?: (item: SkillCardView) => void;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
  onTag?: (item: SkillCardView, tag: string) => void;
  title?: string;
}

/** 统一技能展示容器：手机库 / Agent 详情 / Project 详情共用 */
export default function SkillList({
  items,
  view,
  defaultView = 'card',
  onViewChange,
  onToggle,
  onAction,
  onTag,
  title,
}: SkillListProps) {
  const [internalView, setInternalView] = useState<SkillView>(defaultView);
  const current = view ?? internalView;
  const setCurrent = (v: SkillView) => {
    if (view === undefined) setInternalView(v);
    onViewChange?.(v);
  };

  return (
    <div>
      <div className="skill-toolbar">
        {title && <h2 className="page-head__title" style={{ fontSize: 'var(--fs-18)' }}>{title}</h2>}
        <span style={{ flex: 1 }} />
        <Segment<SkillView>
          value={current}
          onChange={setCurrent}
          options={[
            { label: '列表', value: 'list' },
            { label: '卡片', value: 'card' },
          ]}
        />
      </div>
      <div style={{ marginTop: 'var(--sp-4)' }}>
        {current === 'card' ? (
          <div className="skill-grid">
            {items.map((item) => (
              <SkillCard key={item.id} item={item} onAction={onAction} onTag={onTag} />
            ))}
          </div>
        ) : (
          <div className="skill-list">
            {items.map((item) => (
              <SkillListRow key={item.id} item={item} onToggle={onToggle} onAction={onAction} onTag={onTag} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}