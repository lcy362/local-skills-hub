import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill, readSkill, hasSkill } from './skill.js';
import { scanAll, scanDir } from './scanner.js';
import { listAgents, expandTilde } from './agents.js';

export interface Candidate {
  /** 目录内唯一：name#<source> */
  id: string;
  name: string;
  source: string;          // 仓库id / ext:xx / agent:<key> / file
  sourceLabel: string;
  dir: string;
  inRepo: boolean;         // 是否已是仓库本体
  description?: string;
}

export interface IntegrateGroup {
  name: string;
  candidates: Candidate[];
  adopted?: { source: string; targetDir: string };
}

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

export function previewGroups(cfg: ConfigStore, lib: { skills: Skill[] }): IntegrateGroup[] {
  const cands = collectCandidates(cfg, lib);
  const map = new Map<string, Candidate[]>();
  for (const c of cands) {
    const arr = map.get(c.name) ?? [];
    arr.push(c);
    map.set(c.name, arr);
  }
  return [...map.entries()].map(([name, candidates]) => ({ name, candidates }));
}

export interface AdoptDecision {
  name: string;
  selectId: string;      // 要保留/收编的候选 id
  repoId?: string;
  /** true=不处理(忽略) */
  skip?: boolean;
}

export interface AdoptResult { name: string; adopted: boolean; targetDir?: string; reason?: string; source?: string }

export function applyAdoption(cfg: ConfigStore, lib: { skills: Skill[] }, decisions: AdoptDecision[]): AdoptResult[] {
  const cands = collectCandidates(cfg, lib);
  const byId = new Map(cands.map((c) => [c.id, c]));
  const results: AdoptResult[] = [];
  let count = 0;
  for (const d of decisions) {
    if (d.skip) { results.push({ name: d.name, adopted: false, reason: 'skipped' }); continue; }
    const sel = byId.get(d.selectId);
    if (!sel) { results.push({ name: d.name, adopted: false, reason: `候选不存在: ${d.selectId}` }); continue; }
    if (sel.inRepo) { results.push({ name: d.name, adopted: true, source: sel.source, reason: '已在仓库' }); continue; }
    // 收编：复制候选本体到目标仓库 skills/<name>
    const repoId = d.repoId ?? cfg.data.repos[0]?.id;
    const repo = cfg.data.repos.find((r) => r.id === repoId);
    if (!repo) { results.push({ name: d.name, adopted: false, reason: '无仓库可收编' }); continue; }
    const skillsRoot = path.join(expandTilde(repo.path), 'skills');
    const target = path.join(skillsRoot, sel.name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(sel.dir, target, { recursive: true });
    results.push({ name: d.name, adopted: true, source: sel.source, targetDir: target });
    count++;
  }
  return results;
}
