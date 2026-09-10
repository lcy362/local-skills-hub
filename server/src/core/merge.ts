import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import type { Skill } from './skill.js';
import { expandTilde } from './agents.js';

/**
 * 合并仲裁（IM-02）：同名 skill 多来源重合时，由用户裁决保留哪个来源。
 * 未选中且尚未在仓库本体的候选会被收编进主仓库（保留其版本），
 * 归属记录在 skillMeta[winner.id].mergeSource，便于回滚与追踪。
 */
export function mergeSkill(cfg: ConfigStore, allSkills: Skill[], name: string, keepSource: string) {
  const cands = allSkills.filter((s) => s.name === name);
  const winner = cands.find((s) => s.source === keepSource) ?? cands[0];
  if (!winner) throw new Error(`skill 不存在: ${name}`);
  const primary = cfg.data.repos[0];
  if (primary && !cfg.data.repos.some((r) => r.id === winner.source)) {
    const skillsRoot = primary.root ? expandTilde(primary.root) : path.join(expandTilde(primary.path), 'skills');
    const dest = path.join(skillsRoot, name);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(winner.dir, dest, { recursive: true });
    }
  }
  const meta = cfg.data.skillMeta[winner.id] ?? { tags: winner.tags };
  meta.mergeSource = keepSource;
  cfg.data.skillMeta[winner.id] = meta;
  cfg.save();
  return { name, keepSource: winner.source, merged: cands.map((c) => c.source), dir: winner.dir };
}
