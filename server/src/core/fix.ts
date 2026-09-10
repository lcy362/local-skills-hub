import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { expandTilde } from './agents.js';
import { syncActive } from './sync.js';
import { migrateTagsToFrontmatter } from './repo-tags.js';
import { Skill } from './skill.js';

export interface FixResult {
  key: string;
  applied: boolean;
  fix?: string;
  message: string;
  result?: unknown;
}

interface FixDeps { lib: { skills: Skill[] } }

/**
 * Health 就地修复分发：按 diagnose 的 DiagItem.key 约定执行对应修复，全部幂等。
 * - sync:<agent>   → 重同步该 agent（补 missing、清失效软链、去多余软链）
 * - broken:*       → 重同步所有活跃 agent（消除失效软链）
 * - project:PATH   → 确保项目目录与 .agents/skills 存在
 * - repo:ID        → 创建仓库 skills 目录
 * - tags:ID        → 标签迁移到 SKILL.md frontmatter（PRD 流程三-A）
 */
export function applyFix(cfg: ConfigStore, deps: FixDeps, key: string): FixResult {
  try {
    if (key.startsWith('sync:')) {
      syncActive(cfg, deps.lib.skills, [key.slice(5)]);
      return { key, applied: true, fix: 'sync', message: `已重同步 ${key.slice(5)}` };
    }
    if (key.startsWith('broken:')) {
      syncActive(cfg, deps.lib.skills, cfg.data.activeAgents);
      return { key, applied: true, fix: 'sync', message: '已重同步活跃 agent，消除失效软链' };
    }
    if (key.startsWith('project:')) {
      const p = expandTilde(key.slice('project:'.length));
      fs.mkdirSync(path.join(p, '.agents', 'skills'), { recursive: true });
      return { key, applied: true, fix: 'mkdir', message: `已确保项目结构存在: ${p}` };
    }
    if (key.startsWith('repo:')) {
      const id = key.slice(5);
      const repo = cfg.data.repos.find((x) => x.id === id);
      if (!repo) return { key, applied: false, message: 'repo 未找到' };
      fs.mkdirSync(path.join(expandTilde(repo.path), 'skills'), { recursive: true });
      return { key, applied: true, fix: 'mkdir', message: `已创建仓库目录: ${repo.path}/skills` };
    }
    if (key.startsWith('tags:')) {
      const id = key.slice(5);
      const repo = cfg.data.repos.find((x) => x.id === id);
      if (!repo) return { key, applied: false, message: 'repo 未找到' };
      const r = migrateTagsToFrontmatter(cfg, repo);
      return { key, applied: true, fix: 'tags-migrate', message: `已迁移 ${r.migrated} 个 skill 标签到 frontmatter`, result: r };
    }
    return { key, applied: false, message: '该项无需自动修复' };
  } catch (e) {
    return { key, applied: false, message: (e as Error).message };
  }
}