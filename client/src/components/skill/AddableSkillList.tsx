import type { AddableSkill } from '../../api/types';
import EntityList, { type EntityItem } from '../common/EntityList';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';

/** 可添加技能列表（Agent / 项目详情共用） */
export default function AddableSkillList({
  items,
  onAdd,
  title,
}: {
  items: AddableSkill[];
  onAdd: (a: AddableSkill) => void;
  title?: string;
}) {
  if (items.length === 0) return <EmptyState title="没有可添加的技能" />;
  const entities: EntityItem[] = items.map((a) => ({
    id: a.id,
    title: a.name,
    sub: <span className="mono">{a.repo}</span>,
    actions: (
      <Button size="sm" variant="primary" onClick={() => onAdd(a)}>
        添加
      </Button>
    ),
  }));
  // 弹窗内固定跟随全局偏好，不再重复暴露切换器
  return <EntityList items={entities} title={title} toggle={false} />;
}
