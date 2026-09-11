export interface ChipOption<T extends string = string> {
  label: string;
  value: T;
  count?: number;
}

interface ChipProps<T extends string = string> {
  options: ChipOption<T>[];
  /** 已选值；单选模式下长度不超过 1 */
  selected: T[];
  onChange: (selected: T[]) => void;
  /** 允许多选；默认单选 */
  multiple?: boolean;
}

/**
 * 可反选的胶囊组（受控）。
 * - 单选：点选即替换，再次点击已选项则清空。
 * - 多选：点击即在集合中增删，可同时命中多个条件。
 */
export default function Chip<T extends string = string>({
  options,
  selected,
  onChange,
  multiple = false,
}: ChipProps<T>) {
  const toggle = (v: T) => {
    if (multiple) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      onChange(selected.includes(v) ? [] : [v]);
    }
  };

  return (
    <div className="filter-row">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`chip ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(o.value)}
          >
            {o.label}
            {o.count !== undefined && <span className="mono chip__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
