import type { SkillAction, SkillCardView } from '../../api/types';
import { stateBadge, isOn } from './SkillBadges';
import SkillActions from './SkillActions';
import Tag from '../ui/Tag';

/** 卡片视图 */
export default function SkillCard({
  item,
  onAction,
  onTag,
}: {
  item: SkillCardView;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
  onTag?: (item: SkillCardView, tag: string) => void;
}) {
  const off = item.state === 'off' || item.state === 'residual';
  return (
    <article className={`skill-card ${off ? 'is-off' : ''}`}>
      <div className="skill-card__head">
        <div>
          <h3 className="skill-card__title">
            {item.title || item.name}
          </h3>
          <div className="skill-card__sub">{item.id}</div>
        </div>
        {stateBadge(item)}
      </div>
      {item.description && <p className="skill-card__desc">{item.description}</p>}
      <span className="skill-card__badges">
        {countBadges(item)}
      </span>
      {item.tags.length > 0 && (
        <span className="skill-card__tags">
          {item.tags.map((t) => (
            <Tag key={t} onClick={onTag ? () => onTag(item, t) : undefined}>
              {t}
            </Tag>
          ))}
        </span>
      )}
      <div className="skill-card__foot">
        <span className="skill-card__source">{item.source}</span>
        <SkillActions item={item} onAction={onAction} />
      </div>
    </article>
  );
}

function countBadges(item: SkillCardView) {
  return (
    <>
      <span className="badge badge--accent">{reasonLabel(item.reason)}</span>
      <span className="badge badge--info">{storeLabel(item.store)}</span>
    </>
  );
}

import type { SkillReason, SkillStore } from '../../api/types';
function reasonLabel(r: SkillReason): string {
  return { own: '自建', preset: '预设', manual: '手动', tag: '标签', index: '索引' }[r];
}
function storeLabel(s: SkillStore): string {
  return { symlink: '符号链接', copy: '副本', own: '自建', pending: '待定' }[s];
}