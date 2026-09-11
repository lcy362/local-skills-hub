interface ChipProps<T extends string = string> {
  options: { label: string; value: T; count?: number }[];
  /** 受控值；undefined 表示未选中 */
  value?: T;
  onChange?: (v: T | undefined) => void;
  /** 允许再次点击已选中项取消选择 */
  allowDeselect?: boolean;
}

/**
 * 可反选的多选/单选胶囊组（受控）。
 * 筛选条（FilterBar）的标签行即由此渲染。
 */
export default function Chip<T extends string = string>({
  options,
  value,
  onChange,
  allowDeselect = false,
}: ChipProps<T>) {
  return (
    <div className="filter-row">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className={`chip ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange?.(on && allowDeselect ? undefined : o.value)}
          >
            {o.label}
            {o.count !== undefined && <span className="mono chip__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
