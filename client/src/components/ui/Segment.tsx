interface SegmentOption<T extends string = string> {
  label: string;
  value: T;
}

interface SegmentProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

export default function Segment<T extends string = string>({ options, value, onChange }: SegmentProps<T>) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`seg__opt ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}