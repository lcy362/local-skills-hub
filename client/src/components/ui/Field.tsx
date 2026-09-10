import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

interface FieldBase {
  label?: ReactNode;
  hint?: ReactNode;
}

export function FieldInput({ label, hint, className = '', ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label && <span className="field-label">{label}</span>}
      <input className={`field ${className}`.trim()} {...rest} />
      {hint && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{hint}</span>}
    </label>
  );
}

export function FieldSelect({ label, hint, children, className = '', ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      {label && <span className="field-label">{label}</span>}
      <select className={`field ${className}`.trim()} {...rest}>
        {children}
      </select>
      {hint && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{hint}</span>}
    </label>
  );
}

export function FieldTextarea({ label, hint, className = '', ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label>
      {label && <span className="field-label">{label}</span>}
      <textarea className={`field ${className}`.trim()} {...rest} />
      {hint && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{hint}</span>}
    </label>
  );
}