import { useState, type ReactNode } from 'react';
import Button from '../ui/Button';
import Chip from '../ui/Chip';

/** 可折叠的次级筛选条件组（如标签） */
export interface ChipGroup {
  key: string;
  label: string;
  options: { label: string; value: string; count?: number }[];
  value?: string;
  onChange: (v: string | undefined) => void;
}

export interface FilterBarProps {
  /** 搜索框（必填，作为主操作） */
  search: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** 与搜索同排的筛选控件（下拉 / 开关） */
  controls?: ReactNode;
  /** 次级条件：默认折叠，任一条件生效时自动展开 */
  chipGroups?: ChipGroup[];
  chipsToggleLabel?: string;
  /** 提供了 chipGroups 但一个可选项都没有时的引导文案 */
  chipsEmptyHint?: ReactNode;
  /** 是否存在生效中的筛选条件（决定是否出现「重置」） */
  hasFilters?: boolean;
  onReset?: () => void;
  /** 行末固定操作（刷新、统计等） */
  actions?: ReactNode;
}

/**
 * 统一搜索 / 筛选控制条：把一处页面的所有筛选功能收敛到同一区域内，
 * 主行只放高频操作，低频条件折叠在次级行，命中数由结果区自己展示。
 */
export default function FilterBar({
  search,
  controls,
  chipGroups,
  chipsToggleLabel = '更多筛选',
  chipsEmptyHint,
  hasFilters = false,
  onReset,
  actions,
}: FilterBarProps) {
  const [chipsOpen, setChipsOpen] = useState(false);
  // 只要调用方声明了 chipGroups，入口就常驻（哪怕当前没有可选项），
  // 避免「功能存在但用户完全看不见」。
  const declared = (chipGroups ?? []).length > 0;
  const groups = (chipGroups ?? []).filter((g) => g.options.length > 0);
  const chipsActive = groups.some((g) => !!g.value);
  const optionCount = groups.reduce((n, g) => n + g.options.length, 0);

  return (
    <div className="filterbar">
      <div className="filterbar__row">
        <div className="filterbar__search">
          <SearchIcon />
          <input
            className="field"
            type="search"
            value={search.value}
            placeholder={search.placeholder ?? '搜索'}
            aria-label={search.placeholder ?? '搜索'}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search.value !== '') {
                e.preventDefault();
                search.onChange('');
              }
            }}
          />
          {search.value !== '' && (
            <button
              type="button"
              className="filterbar__clear"
              aria-label="清除搜索"
              title="清除搜索（Esc）"
              onClick={() => search.onChange('')}
            >
              <ClearIcon />
            </button>
          )}
        </div>

        <div className="filterbar__controls">
          {controls}

          {declared && !chipsActive && (
            <button
              type="button"
              className="filterbar__toggle"
              aria-expanded={chipsOpen}
              data-empty={optionCount === 0 ? '' : undefined}
              onClick={() => setChipsOpen((o) => !o)}
            >
              <ChevronIcon open={chipsOpen} />
              {chipsToggleLabel}
              {optionCount > 0 && <span className="mono filterbar__badge">{optionCount}</span>}
            </button>
          )}

          {hasFilters && onReset && (
            <Button variant="ghost" onClick={onReset}>
              重置
            </Button>
          )}
          {actions}
        </div>
      </div>

      {declared && groups.length === 0 && chipsOpen && !chipsActive && (
        <p className="filterbar__hint">{chipsEmptyHint ?? '暂无可用的筛选项。'}</p>
      )}

      {groups.length > 0 && (chipsActive || chipsOpen) && (
        <div className="filterbar__chips">
          {groups.map((g) => (
            <div className="filterbar__group" key={g.key}>
              <span className="filterbar__group-label">{g.label}</span>
              <Chip options={g.options} value={g.value} onChange={g.onChange} allowDeselect />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="filterbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" width="14" height="14">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      width="14"
      height="14"
      aria-hidden="true"
      style={{ transition: 'transform var(--dur-150) var(--ease)', transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
