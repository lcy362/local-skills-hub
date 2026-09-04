import { ConfigStore } from '../config/store.js';

export function set(a: ConfigStore, keys: string[]): string[] {
  a.data.activeAgents = [...new Set(keys)];
  a.save();
  return a.data.activeAgents;
}
export function toggle(a: ConfigStore, key: string): string[] {
  const set = new Set(a.data.activeAgents);
  set.has(key) ? set.delete(key) : set.add(key);
  a.data.activeAgents = [...set];
  a.save();
  return a.data.activeAgents;
}
