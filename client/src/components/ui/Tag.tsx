interface TagProps {
  children: string;
  selected?: boolean;
  onClick?: () => void;
  muted?: boolean;
}

export default function Tag({ children, selected, onClick, muted }: TagProps) {
  if (!onClick) {
    return <span className="tag">{children}</span>;
  }
  return (
    <button
      type="button"
      className="tag"
      style={muted ? { opacity: 0.55, background: 'var(--c-surface-2)', color: 'var(--c-ink-3)' } : undefined}
      onClick={onClick}
    >
      {selected ? '✓ ' : ''}
      {children}
    </button>
  );
}