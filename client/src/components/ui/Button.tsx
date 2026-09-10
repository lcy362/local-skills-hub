import type { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'warn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  children: ReactNode;
  loading?: boolean;
}

const cls: Record<Variant, string> = {
  default: '',
  primary: 'btn--primary',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
  warn: 'btn--warn',
};

export default function Button({
  variant = 'default',
  size = 'md',
  block = false,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', cls[variant], size === 'sm' ? 'btn--sm' : '', block ? 'btn--block' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <SpinnerInline />}
      {children}
    </button>
  );
}

function SpinnerInline() {
  return <span className="spinner spinner--sm" style={{ display: 'inline-block', verticalAlign: '-3px' }} />;
}