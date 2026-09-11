import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Button from './Button';

export interface MultiSelectOption<T extends string = string> {
  label: string;
  value: T;
  count?: number;
}

interface MultiSelectProps<T extends string = string> {
  /** 维度名，显示在触发按钮上，如「来源」 */
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (v: T[]) => void;
  /** 可选项超过该数量时才在面板内显示搜索框，默认 8 */
  searchThreshold?: number;
  /** 没有任何可选项时的说明文案 */
  emptyHint?: ReactNode;
}

/**
 * 多选下拉：选项数量可以很多，触发按钮宽度恒定。
 * - 触发按钮：无选中显示维度名，选中 1 项显示该项，多项显示计数
 * - 面板：勾选即增删，选项过多时面板内提供搜索，底部可一键清空
 * - 交互：点击外部或 Esc 关闭，Esc 后焦点回到触发按钮
 */
export default function MultiSelect<T extends string = string>({
  label,
  options,
  selected,
  onChange,
  searchThreshold = 8,
  emptyHint,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showSearch = options.length > searchThreshold;

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return kw ? options.filter((o) => o.label.toLowerCase().includes(kw)) : options;
  }, [options, q]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 展开时聚焦搜索框；收起时清空搜索
  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
    if (!open) setQ('');
  }, [open, showSearch]);

  const toggleValue = (v: T) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? `${label} · ${options.find((o) => o.value === selected[0])?.label ?? selected[0]}`
        : `${label} · ${selected.length}`;

  return (
    <div className="multiselect" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`field multiselect__trigger ${selected.length > 0 ? 'is-on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected.length > 0 ? selected.join('、') : label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multiselect__summary">{summary}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="multiselect__panel">
          {showSearch && (
            <input
              ref={searchRef}
              className="field multiselect__search"
              type="search"
              value={q}
              placeholder={`筛选${label}…`}
              aria-label={`筛选${label}`}
              onChange={(e) => setQ(e.target.value)}
            />
          )}

          <div className="multiselect__list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`multiselect__opt ${on ? 'is-on' : ''}`}
                  onClick={() => toggleValue(o.value)}
                >
                  <span className="multiselect__box" aria-hidden="true">{on ? '✓' : ''}</span>
                  <span className="multiselect__opt-label">{o.label}</span>
                  {o.count !== undefined && <span className="mono multiselect__num">{o.count}</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="multiselect__empty">{options.length === 0 ? (emptyHint ?? '暂无可选项') : '无匹配项'}</p>
            )}
          </div>

          <div className="multiselect__foot">
            <span className="multiselect__hint">已选 {selected.length} 项</span>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                清空
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      width="13"
      height="13"
      aria-hidden="true"
      style={{ flexShrink: 0, transition: 'transform var(--dur-150) var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
