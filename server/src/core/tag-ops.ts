import fs from 'node:fs';
import { ConfigStore } from '../config/store.js';
import { scanAll } from './scanner.js';
import { readTags, writeTags } from './repo-tags.js';

export interface TagOpResult { changed: number }

export interface ConsistencyIssue { scope: string; skill: string; message: string }

type Replacer = (t: string) => string | null;

/**
 * 在三个载体上统一应用标签替换：
 * 1. config.skillMeta（未配置 repo.tags 的仓库标签栖息地）
 * 2. 已配置 repo.tags 的仓库所落载体（frontmatter / repo-file / external-file）
 * replacer 返回 null 表示保留（不操作），返回新串表示替换。
 */
function applyReplace(cfg: ConfigStore, replacer: Replacer): number {
  let changed = 0;

  // 1) config.skillMeta
  for (const [id, meta] of Object.entries(cfg.data.skillMeta)) {
    if (!meta.tags?.length) continue;
    let dirty = false;
    const next = meta.tags.map((t) => {
      const r = replacer(t);
      if (r === null || r === t) return t; // 未命中 → 保留
      dirty = true;
      return r;
    });
    if (dirty) { cfg.data.skillMeta[id].tags = next; changed++; }
  }

  // 2) 配置了 repo.tags 的仓库：逐 skill 读→替换→写
  for (const repo of cfg.data.repos) {
    if (!repo.tags) continue;
    let repoSkills: { id: string; name: string; dir: string }[] = [];
    try { repoSkills = scanAll([repo], []).skills; } catch { continue; }
    for (const s of repoSkills) {
      let cur: string[];
      try { cur = readTags(repo, s.name, s.dir); } catch { continue; }
      if (!cur.length) continue;
      let dirty = false;
      const next = cur.map((t) => {
        const r = replacer(t);
        if (r === null || r === t) return t;
        dirty = true;
        return r;
      });
      if (!dirty) continue;
      try {
        const ok = writeTags(repo, s.name, s.dir, next);
        if (!ok) { cfg.data.skillMeta[s.id] = { ...cfg.data.skillMeta[s.id], tags: next }; }
        changed++;
      } catch { cfg.data.skillMeta[s.id] = { ...cfg.data.skillMeta[s.id], tags: next }; }
    }
  }
  return changed;
}

export function renameTag(cfg: ConfigStore, oldTag: string, newTag: string): TagOpResult {
  const changed = applyReplace(cfg, (t) => (t === oldTag ? newTag : t));
  cfg.save();
  return { changed };
}

export function mergeTag(cfg: ConfigStore, target: string, absorb: string): TagOpResult {
  if (target === absorb) return { changed: 0 };
  const changed = applyReplace(cfg, (t) => (t === absorb ? target : t));
  cfg.save();
  return { changed };
}

/** 一致性检查：frontmatter/载体缺失、孤儿 skillMeta、与扫描不一致 */
export function tagConsistency(cfg: ConfigStore): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const metaIds = new Set(Object.keys(cfg.data.skillMeta));
  const knownIds = new Set<string>();
  for (const repo of cfg.data.repos) {
    if (!repo.tags) continue;
    let repoSkills: { id: string; name: string; dir: string }[] = [];
    try { repoSkills = scanAll([repo], []).skills; } catch { continue; }
    for (const s of repoSkills) {
      knownIds.add(s.id);
      let cur: string[];
      try { cur = readTags(repo, s.name, s.dir); } catch { continue; }
      if (cur === undefined) issues.push({ scope: repo.id, skill: s.name, message: '读取标签失败' });
    }
  }
  for (const id of metaIds) {
    if (!knownIds.has(id)) issues.push({ scope: 'config', skill: id, message: 'skillMeta 中原生标签记录无对应技能（孤儿）' });
  }
  return issues;
}