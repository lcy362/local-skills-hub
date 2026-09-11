import { useState } from 'react';

/**
 * 区块整体折叠状态。
 * 传入 storageKey 时持久化到 localStorage（存 '1' 表示折叠，缺省即展开），
 * 不传则仅组件内存态。
 */
export function useCollapsed(storageKey?: string, initial = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!storageKey) return initial;
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return initial;
    }
  });

  const toggle = () =>
    setCollapsed((v) => {
      const next = !v;
      if (storageKey) {
        try {
          if (next) localStorage.setItem(storageKey, '1');
          else localStorage.removeItem(storageKey);
        } catch {
          /* 存储不可用时退化为内存态 */
        }
      }
      return next;
    });

  return [collapsed, toggle];
}
