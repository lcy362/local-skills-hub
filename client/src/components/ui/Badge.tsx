import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';

const cls: Record<Tone, string> = {
  neutral: 'badge--neutral',
  accent: 'badge--accent',
  good: 'badge--good',
  warn: 'badge--warn',
  bad: 'badge--bad',
  info: 'badge--info',
};

export default function Badge({
  tone = 'neutral',
  dot,
  children,
  className = '',
  title,
}: {
  tone?: Tone;
  dot?: 'good' | 'warn' | 'bad' | 'neutral';
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`badge ${cls[tone]} ${className}`.trim()} title={title}>
      {dot && <span className={`dot dot--${dot}`} />}
      {children}
    </span>
  );
}