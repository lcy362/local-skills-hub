import { useState, type ReactNode } from 'react';
import Button from './Button';
import { useToast } from './Toast';
import { pickDirectory, pickFile } from '../../api/picker';

interface BaseProps {
  label?: ReactNode;
  hint?: ReactNode;
  /** 选择目录还是文件，默认目录 */
  mode?: 'dir' | 'file';
  disabled?: boolean;
}

/**
 * 单行路径输入 + 「选择…」按钮：点击调起系统原生文件/目录选择器。
 * 选择器不可用时（无桌面环境等）仅提示，仍可手动输入。
 */
export function PathField({
  label,
  hint,
  mode = 'dir',
  value,
  onChange,
  placeholder,
  disabled,
}: BaseProps & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const p = mode === 'dir' ? await pickDirectory() : await pickFile();
      if (p) onChange(p);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {label && <span className="field-label">{label}</span>}
      <div className="path-field">
        <input
          className="field"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="path-field__action">
          <Button type="button" size="sm" variant="ghost" loading={busy} disabled={disabled} onClick={() => void pick()}>
            选择…
          </Button>
        </span>
      </div>
      {hint && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{hint}</span>}
    </div>
  );
}

/**
 * 多行路径输入（每行一个目录）+ 「添加目录」按钮：
 * 每次选择把目录追加为新的一行，已存在则忽略。
 */
export function PathListField({
  label,
  hint,
  mode = 'dir',
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
}: BaseProps & { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const p = mode === 'dir' ? await pickDirectory() : await pickFile();
      if (!p) return;
      const lines = value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.includes(p)) {
        toast.push('该路径已在列表中', 'bad');
        return;
      }
      onChange([...lines, p].join('\n'));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="path-list__head">
        {label && <span className="field-label">{label}</span>}
        <span className="path-field__action">
          <Button type="button" size="sm" variant="ghost" loading={busy} disabled={disabled} onClick={() => void pick()}>
            {mode === 'dir' ? '添加目录…' : '添加文件…'}
          </Button>
        </span>
      </div>
      <textarea
        className="field"
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{hint}</span>}
    </div>
  );
}
