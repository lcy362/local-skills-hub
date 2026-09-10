import type { SkillAction, SkillCardView } from '../../api/types';
import { isOn } from './SkillBadges';
import SkillActions from './SkillActions';
import Tag from '../ui/Tag';
import Switch from '../ui/Switch';

/** 列表行视图 */
export default function SkillListRow({
  item,
  onToggle,
  onAction,
  onTag,
}: {
  item: SkillCardView;
  onToggle?: (item: SkillCardView) => void;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
  onTag?: (item: SkillCardView, tag: string) => void;
}) {
  const on = isOn(item);
  return (
    <div className="skill-row">
      {onToggle && <Switch checked={on} onChange={() => onToggle(item)} />}
      <div className="skill-row__main">
        <div className="skill-row__title">
          {item.title || item.name}
          {item.tags.map((t) => (
            <Tag key={t} onClick={onTag ? () => onTag(item, t) : undefined}>
              {t}
            </Tag>
          ))}
        </div>
        <div className="skill-row__sub">
          <span className="badge badge--accent">{item.reason}</span>{' '}
          <span className="badge badge--info">{item.store}</span>{' '}
          <span className={`badge ${on ? 'badge--good' : 'badge--neutral'}`}>{on ? '启用' : '未启用'}</span>{' '}
          <span className="mono">{item.id}</span>
        </div>
      </div>
      <div className="skill-row__right">
        <SkillActions item={item} onAction={onAction} />
      </div>
    </div>
  );
}