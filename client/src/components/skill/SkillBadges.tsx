import type { SkillCardView, SkillReason, SkillStore } from '../../api/types';
import Badge from '../ui/Badge';

const REASON_LABEL: Record<SkillReason, string> = {
  own: '自建',
  preset: '预设',
  manual: '手动',
  tag: '标签',
  index: '索引',
};

const STORE_LABEL: Record<SkillStore, string> = {
  symlink: '符号链接',
  copy: '副本',
  own: '自建',
  pending: '待定',
};

export function isOn(item: SkillCardView): boolean {
  return item.state === 'on' || item.state === 'own-in-use' || item.state === 'wanted-pending';
}

export function reasonBadge(item: SkillCardView) {
  return <Badge tone="accent">{REASON_LABEL[item.reason]}</Badge>;
}

export function storeBadge(item: SkillCardView) {
  return <Badge tone="info">{STORE_LABEL[item.store]}</Badge>;
}

export function stateBadge(item: SkillCardView) {
  switch (item.state) {
    case 'on':
      return (
        <Badge tone="good" dot="good">
          启用
        </Badge>
      );
    case 'wanted-pending':
      return (
        <Badge tone="warn" dot="warn">
          待生成
        </Badge>
      );
    case 'off-override':
      return (
        <Badge tone="warn" dot="warn">
          已关闭
        </Badge>
      );
    case 'residual':
      return (
        <Badge tone="bad" dot="bad">
          残留
        </Badge>
      );
    case 'own-in-use':
      return (
        <Badge tone="info" dot="good">
          使用中
        </Badge>
      );
    case 'off':
    default:
      return (
        <Badge tone="neutral" dot="neutral">
          未启用
        </Badge>
      );
  }
}

/** 统一渲染 reason / store / state 三个状态徽标 */
export default function SkillBadges({ item }: { item: SkillCardView }) {
  return (
    <span className="skill-card__badges">
      {reasonBadge(item)}
      {storeBadge(item)}
      {stateBadge(item)}
      {item.preset && <Badge tone="accent">{item.preset}</Badge>}
    </span>
  );
}