import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { scanDir } from './scanner.js';
import { listAgents } from './agents.js';

export interface Candidate {
  /** 目录内唯一：name#<source> */
  id: string;
  name: string;
  source: string;          // 仓库id / 外部来源id / agent:<key> / file
  sourceLabel: string;
  dir: string;
  inRepo: boolean;         // 是否已是仓库本体
  description?: string;
}

/**
 * 汇总所有技能来源（仓库 / 外部来源 / 已安装 Agent 目录）为候选清单，
 * 供诊断（dup 同名多来源检测）使用。
 */
export function collectCandidates(cfg: ConfigStore, lib: { skills: Skill[] }): Candidate[] {
  const out: Candidate[] = [];
  const repoIds = new Set(cfg.data.repos.map((r) => r.id));

  for (const s of lib.skills) {
    out.push({
      id: `${s.name}#${s.source}`,
      name: s.name,
      source: s.source,
      sourceLabel: s.source,
      dir: s.dir,
      inRepo: repoIds.has(s.source),
      description: s.description,
    });
  }

  // Agent 已安装目录里的 skill 也作为候选（用于收编到仓库）
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    const items = scanDir(a.globalDir, `agent:${a.key}`, 'nested');
    for (const s of items) {
      out.push({
        id: `${s.name}#agent:${a.key}`,
        name: s.name,
        source: `agent:${a.key}`,
        sourceLabel: `${a.name}(agent)`,
        dir: s.dir,
        inRepo: false,
        description: s.description,
      });
    }
  }
  return out;
}
