import { useState } from 'react';

interface ChipProps<T extends string = string> {
  options: { label: string; value: T; count?: number }[];
  value?: T;
  onChange?: (v: T) => void;
  allowDeselect?: boolean;
}

export default function Chip<T extends string = string>({ options, value, onChange, allowDeselect }: ChipProps<T>) {
  const [internal, setInternal] = useState<T | undefined>();
  const current = value !== undefined ? value : internal;
  return (
    <div className="skill-toolbar__filters">
      {options.map((o) => {
        const on = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            className={`chip ${on ? 'is-on' : ''}`}
            onClick={() => {
              if (on && allowDeselect) {
                setInternal(undefined);
                onChange?.(undefined as unknown as T);
              } else {
                setInternal(o.value);
                onChange?.(o.value);
              }
            }}
          >
            {o.label}
            {o.count !== undefined && <span className="mono" style={{ opacity: 0.7 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}