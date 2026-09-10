/**
 * 技能标签：以 SKILL.md frontmatter `tags` 为单一真实来源（TG-01），
 * 用户对未写入 frontmatter 的技能所做的标签修改暂存于 config.skillMeta。
 * 本模块仅保留 frontmatter 的写回与迁移能力。
 */
import fs from 'node:fs';
import path from 'node:path';
import * as YAML from 'yaml';
import { ConfigStore } from '../config/store.js';
import { Repo } from '../config/types.js';
import { SKILL_FILE } from './skill.js';
import { scanAll } from './scanner.js';

/** 更新 SKILL.md frontmatter 的 tags（保留其他字段与正文），成功返回 true */
function writeFrontmatterTags(file: string, tags: string[]): boolean {
  if (!fs.existsSync(file)) return false;
  try {
    const md = fs.readFileSync(file, 'utf-8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
    if (!m) return false;
    const y = YAML.parse(m[1]) ?? {};
    y.tags = tags;
    const body = md.slice(m[0].length);
    fs.writeFileSync(file, `---\n${YAML.stringify(y).trimRight()}\n---\n${body}`, 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * 把 config.skillMeta 中暂存的标签写回 SKILL.md frontmatter（PRD 流程三-A）。
 * 写回成功后删除对应 config 记录，避免数据重复。
 */
export function migrateTagsToFrontmatter(cfg: ConfigStore, repo: Repo): { migrated: number; skipped: string[] } {
  const skipped: string[] = [];
  let migrated = 0;
  let lib: { skills: { id: string; name: string; dir: string }[] } = { skills: [] };
  try { lib = scanAll([repo], []); } catch { /* ignore */ }
  for (const s of lib.skills) {
    const tags = cfg.data.skillMeta[s.id]?.tags;
    if (!tags) continue;
    if (writeFrontmatterTags(path.join(s.dir, SKILL_FILE), tags)) {
      delete cfg.data.skillMeta[s.id];
      migrated++;
    } else {
      skipped.push(s.name);
    }
  }
  cfg.save();
  return { migrated, skipped };
}