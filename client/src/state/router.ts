import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Tab } from './store';

/**
 * 极简 hash 路由：作为「当前页面」的唯一数据源。
 *
 * 设计目标
 * - 刷新后停留在当前页面：一级页面、二级详情页、页面内筛选条件全部写进 URL。
 * - 零依赖、hash 不经过服务端，静态部署无需 SPA fallback。
 *
 * 地址形态：#/<tab>[/<sub>][?<query>]
 *   #/library
 *   #/agents/claude?q=code&installed=1
 *   #/projects/3
 */

/** 所有一级页面，顺序与侧边导航一致 */
export const TABS: readonly Tab[] = ['library', 'agents', 'presets', 'projects', 'health', 'settings'];
export const DEFAULT_TAB: Tab = 'library';

/** 应用内的一处位置 */
export interface Route {
  /** 一级页面 */
  tab: Tab;
  /** 二级详情标识（Agent key / 项目 id / 技能 id）；无则为 null */
  sub: string | null;
  /** 页面内筛选、搜索条件，随地址持久化 */
  query: URLSearchParams;
}

function isTab(v: string): v is Tab {
  return (TABS as readonly string[]).includes(v);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 解析 hash → Route，非法输入回落到默认页 */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', search = ''] = raw.split('?');
  const segs = path.split('/').filter(Boolean).map(safeDecode);
  const tab = segs[0] && isTab(segs[0]) ? segs[0] : DEFAULT_TAB;
  return {
    tab,
    sub: segs.length > 1 ? segs.slice(1).join('/') : null,
    query: new URLSearchParams(search),
  };
}

/** Route → hash */
export function toHash(route: Route): string {
  const segs = [route.tab, ...(route.sub ? [encodeURIComponent(route.sub)] : [])];
  const qs = route.query.toString();
  return `#/${segs.join('/')}${qs ? `?${qs}` : ''}`;
}

let current: Route = parseHash(typeof window === 'undefined' ? '' : window.location.hash);
const listeners = new Set<(r: Route) => void>();

function notify(): void {
  listeners.forEach((l) => l(current));
}

function sync(): void {
  current = parseHash(window.location.hash);
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', sync);
}

/** 读取当前路由（在事件回调中取最新值，避免闭包过期） */
export function getRoute(): Route {
  return current;
}

/**
 * 跳转。replace=true 时用 replaceState 覆盖当前历史记录，
 * 适用于搜索/筛选这类高频、不值得逐次入栈的更新。
 */
export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const hash = toHash(route);
  current = route;
  if (hash === window.location.hash) {
    notify();
    return;
  }
  if (opts.replace) {
    window.history.replaceState(null, '', hash);
    notify(); // replaceState 不触发 hashchange，需手动广播
  } else {
    window.location.hash = hash; // 触发 hashchange → sync
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

/** 在当前路由上做增量修改（如只改 sub 或 query） */
export function navigateWith(patch: Partial<Route>, opts: { replace?: boolean } = {}): void {
  navigate({ ...current, ...patch }, opts);
}

/**
 * 订阅当前路由。刷新后由 URL 复原，是「当前页面」的唯一来源，
 * 因此任何页面都不要再把页码/详情选中项放进组件内部 state。
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    listeners.add(setRoute);
    // 规范化地址：无 hash 或非法 tab 时写回标准形式，保证可刷新、可分享
    const normalized = toHash(getRoute());
    if (window.location.hash !== normalized) {
      window.history.replaceState(null, '', normalized);
    }
    return () => {
      listeners.delete(setRoute);
    };
  }, []);
  return route;
}

/** 把单个筛选/搜索条件同步到地址 query，刷新后自动复原 */
export function useQueryParam(key: string): [string, (v: string | undefined) => void] {
  const route = useRoute();
  const value = route.query.get(key) ?? '';
  const setValue = useCallback(
    (v: string | undefined) => {
      const query = new URLSearchParams(getRoute().query);
      if (v) query.set(key, v);
      else query.delete(key);
      navigateWith({ query }, { replace: true });
    },
    [key]
  );
  return [value, setValue];
}

/** query 中的布尔开关：取值为 1 视为 true */
export function useQueryFlag(key: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useQueryParam(key);
  return [v === '1', (on: boolean) => setV(on ? '1' : '')];
}

/** query 中的可选字符串：空值视为未设置 */
export function useQueryValue(key: string): [string | undefined, (v: string | undefined) => void] {
  const [v, setV] = useQueryParam(key);
  return [v || undefined, setV];
}

/** query 中的多值条件：以逗号分隔存于同一参数，空列表即移除该参数；URL 无该参数时回落 defaultValue */
export function useQueryList(key: string, defaultValue: string[] = []): [string[], (v: string[]) => void] {
  const [raw, setRaw] = useQueryParam(key);
  const list = useMemo(
    () => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : defaultValue),
    [raw, defaultValue]
  );
  const setList = useCallback((v: string[]) => setRaw(v.length ? v.join(',') : ''), [setRaw]);
  return [list, setList];
}
