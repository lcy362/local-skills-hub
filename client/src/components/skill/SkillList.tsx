import type { SkillAction, SkillCardView } from '../../api/types';
import EntityList, { type EntityItem, type EntityListProps } from '../common/EntityList';
import Switch from '../ui/Switch';
import { isOn, skillBadges, stateBadge } from './SkillBadges';
import SkillActions from './SkillActions';

interface SkillListProps {
  items: SkillCardView[];
  title?: EntityListProps['title'];
  toolbar?: EntityListProps['toolbar'];
  onToggle?: (item: SkillCardView) => void;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
  onTag?: (item: SkillCardView, tag: string) => void;
  /** 点击整块（卡片/行）打开详情 */
  onOpen?: (item: SkillCardView) => void;
  /** 强制布局，用于弹窗等固定形态 */
  mode?: EntityListProps['mode'];
  empty?: EntityListProps['empty'];
  /** 视图切换器已上移到筛选条 */
  hideToggle?: boolean;
}

/** SkillCardView → 通用 EntityItem，保证与其他实体列表风格一致 */
export function skillToEntity(
  item: SkillCardView,
  opts: {
    onToggle?: (item: SkillCardView) => void;
    onAction?: (item: SkillCardView, action: SkillAction) => void;
    onTag?: (item: SkillCardView, tag: string) => void;
    onOpen?: (item: SkillCardView) => void;
  } = {}
): EntityItem {
  const { onToggle, onAction, onTag, onOpen } = opts;
  const on = isOn(item);
  return {
    id: item.id,
    title: item.title || item.name,
    sub: <span className="mono">{item.id}</span>,
    desc: item.description,
    status: stateBadge(item),
    badges: skillBadges(item),
    tags: (item.tags ?? []).map((t) => ({ label: t, onClick: onTag ? () => onTag(item, t) : undefined })),
    meta: <>{item.source}</>,
    toggle: onToggle ? (
      <Switch
        aria-label={on ? `停用 ${item.name}` : `启用 ${item.name}`}
        checked={on}
        onChange={() => onToggle(item)}
      />
    ) : undefined,
    actions: <SkillActions item={item} onAction={onAction} />,
    onClick: onOpen ? () => onOpen(item) : undefined,
    // 仅「未启用」置灰；无 state（技能库）保持正常态
    muted: item.state === 'off',
  };
}

/** 技能展示容器（三处上下文共用：技能库 / Agent 详情 / 项目详情） */
export default function SkillList({
  items,
  title,
  toolbar,
  onToggle,
  onAction,
  onTag,
  onOpen,
  mode,
  empty,
  hideToggle,
}: SkillListProps) {
  const entities = items.map((item) => skillToEntity(item, { onToggle, onAction, onTag, onOpen }));
  return (
    <EntityList items={entities} title={title} toolbar={toolbar} mode={mode} empty={empty} hideToggle={hideToggle} />
  );
}
