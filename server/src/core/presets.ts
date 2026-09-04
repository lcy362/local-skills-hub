import { ConfigStore } from '../config/store.js';
import { Preset } from '../config/types.js';

export function list(c: ConfigStore): Preset[] {
  return c.data.presets;
}

export function create(c: ConfigStore, name: string): Preset {
  const cfg = c.data;
  if (cfg.presets.some((p) => p.name === name)) throw new Error(`preset 已存在: ${name}`);
  const p: Preset = { name, skills: [], tags: [], active: false };
  cfg.presets.push(p);
  c.save();
  return p;
}

export function update(c: ConfigStore, name: string, patch: Partial<Pick<Preset, 'skills' | 'tags' | 'active'>>): Preset {
  const p = c.data.presets.find((x) => x.name === name);
  if (!p) throw new Error(`preset 不存在: ${name}`);
  if (patch.skills) p.skills = patch.skills;
  if (patch.tags) p.tags = patch.tags;
  if (patch.active !== undefined) p.active = patch.active;
  c.save();
  return p;
}

export function remove(c: ConfigStore, name: string): void {
  c.data.presets = c.data.presets.filter((x) => x.name !== name);
  c.save();
}

/** 激活/取消预设，返回发生变化标记 */
export function setActive(c: ConfigStore, name: string, active: boolean): boolean {
  const p = c.data.presets.find((x) => x.name === name);
  if (!p) throw new Error(`preset 不存在: ${name}`);
  if (p.active === active) return false;
  p.active = active;
  c.save();
  return true;
}
