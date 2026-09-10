import type { SkillAction, SkillCardView } from '../../api/types';
import Button from '../ui/Button';

export function actionVariant(
  kind: SkillAction['kind']
): 'default' | 'primary' | 'ghost' | 'danger' | 'warn' {
  switch (kind) {
    case 'collect':
      return 'primary';
    case 'delete':
      return 'danger';
    case 'merge':
    case 'toggle':
      return 'default';
    case 'detail':
      return 'ghost';
    default:
      return 'default';
  }
}

/** 按 SkillCardView.actions[] 渲染操作按钮 */
export default function SkillActions({
  item,
  onAction,
}: {
  item: SkillCardView;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
}) {
  if (!item.actions || item.actions.length === 0) return null;
  return (
    <span className="entity-row__actions">
      {item.actions.map((action, i) => (
        <Button
          key={`${action.kind}-${i}`}
          size="sm"
          variant={actionVariant(action.kind)}
          disabled={action.disabled}
          title={action.title}
          onClick={() => onAction?.(item, action)}
        >
          {action.label}
        </Button>
      ))}
    </span>
  );
}