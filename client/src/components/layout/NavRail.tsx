import type { Tab } from '../../state/store';

const ITEMS: { key: Tab; label: string; icon: string }[] = [
  { key: 'library', label: '技能库', icon: '◈' },
  { key: 'agents', label: 'Agents', icon: '◉' },
  { key: 'presets', label: '预设', icon: '□' },
  { key: 'sources', label: '来源', icon: '◈' },
  { key: 'projects', label: 'Projects', icon: '❐' },
  { key: 'health', label: '诊断', icon: '◎' },
];

export default function NavRail({
  active,
  onSelect,
  counts,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  counts?: Partial<Record<Tab, number>>;
}) {
  return (
    <nav className="rail scroll">
      <div className="rail__brand">
        <span className="rail__mark">
          Skills<b>Hub</b>
        </span>
        <span className="rail__tag">local</span>
      </div>
      <div className="rail__label">导航</div>
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`rail__link ${active === it.key ? 'is-active' : ''}`}
          onClick={() => onSelect(it.key)}
        >
          <span style={{ opacity: 0.8 }}>{it.icon}</span>
          {it.label}
          {counts?.[it.key] !== undefined && <span className="count">{counts[it.key]}</span>}
        </button>
      ))}
      <div className="rail__foot">
        <span>本地技能资产库</span>
        <span className="mono">v0.1</span>
      </div>
    </nav>
  );
}