import type { ReactNode } from 'react';
import Switch from './Switch';

/** 带文字标签的开关：筛选条内与其它控件同高对齐 */
export default function SwitchLabel({
  checked,
  onChange,
  children,
  disabled,
  title,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  /** 自定义无障碍名称（children 非纯文本时使用） */
  label?: string;
}) {
  return (
    <label className="switch-label" title={title}>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label ?? (typeof children === 'string' ? children : undefined)}
      />
      <span>{children}</span>
    </label>
  );
}
