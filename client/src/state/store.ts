/* 轻量全局状态：当前 tab、全局 reload 总线、主题 */
export type Tab = 'library' | 'agents' | 'presets' | 'projects' | 'health' | 'settings';

type Listener = () => void;
const listeners = new Set<Listener>();

/** 订阅全局事件（reload / toast），返回取消订阅函数 */
export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 触发全局 reload，各视图自行监听并刷新数据 */
export function emitReload(): void {
  listeners.forEach((l) => l());
}

/** 主题记忆（App 使用） */
export function getStoredTheme(): 'light' | 'dark' {
  return localStorage.getItem('lsh-theme') === 'dark' ? 'dark' : 'light';
}
export function storeTheme(t: 'light' | 'dark'): void {
  localStorage.setItem('lsh-theme', t);
}
