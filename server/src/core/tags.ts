import { HubConfig } from '../config/types.js';
import { Skill } from './skill.js';

/**
 * 技能的有效标签：config.skillMeta 覆盖优先，其次 SKILL.md frontmatter（TG-01）。
 * 与 /state 出参口径保持一致，避免「标签显示」与「标签命中」两套结果。
 */
export function effectiveTags(cfg: HubConfig, s: Skill): string[] {
  return cfg.skillMeta[s.id]?.tags ?? s.tags ?? [];
}
