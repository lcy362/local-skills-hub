import Button from '../ui/Button';

export default function Topbar({
  title,
  sub,
  theme,
  onToggleTheme,
  onReload,
  reloading,
}: {
  title: string;
  sub?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onReload?: () => void;
  reloading?: boolean;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>
          {title}
        </div>
        {sub && <div className="page-head__sub">{sub}</div>}
      </div>
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        {onReload && (
          <Button variant="ghost" size="sm" onClick={onReload} title="刷新">
            <span className={reloading ? 'topbar__reload' : ''}>↻</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onToggleTheme} title="切换主题" aria-label="切换主题">
          {theme === 'dark' ? '☾' : '☀'}
        </Button>
      </div>
    </header>
  );
}