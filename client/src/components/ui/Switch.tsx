interface SwitchProps {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function Switch({ checked, onChange, disabled, ...rest }: SwitchProps) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      <span className="switch__track" />
    </label>
  );
}