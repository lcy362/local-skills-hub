import { useEffect, useState } from 'react';

/** 全局共享的展示形态：卡片优先，可切换为列表 */
export type ViewMode = 'card' | 'list';

/** 切换器选项（卡片优先，故置于首位）—— 列表与筛选条共用同一份定义 */
export const VIEW_MODE_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: '卡片', value: 'card' },
  { label: '列表', value: 'list' },
];

const KEY = 'lsh-view-mode';
const listeners = new Set<(v: ViewMode) => void>();

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'card';
  } catch {
    return 'card';
  }
}

let current: ViewMode = read();

export function getViewMode(): ViewMode {
  return current;
}

/** 切换全局展示形态；所有实体列表共享同一偏好，保证风格一致 */
export function setViewMode(v: ViewMode): void {
  if (v === current) return;
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* localStorage 不可用时仅内存生效 */
  }
  listeners.forEach((l) => l(v));
}

function subscribe(l: (v: ViewMode) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(current);
  useEffect(() => subscribe(setMode), []);
  return [mode, setViewMode];
}
