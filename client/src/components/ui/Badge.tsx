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
}: {
  tone?: Tone;
  dot?: 'good' | 'warn' | 'bad' | 'neutral';
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge ${cls[tone]} ${className}`.trim()}>
      {dot && <span className={`dot dot--${dot}`} />}
      {children}
    </span>
  );
}