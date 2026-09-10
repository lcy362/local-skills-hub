import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      {icon && <div style={{ fontSize: '28px' }}>{icon}</div>}
      {title && <div className="empty__title">{title}</div>}
      {hint && <div className="empty__hint">{hint}</div>}
      {action && <div style={{ marginTop: 'var(--sp-2)' }}>{action}</div>}
    </div>
  );
}