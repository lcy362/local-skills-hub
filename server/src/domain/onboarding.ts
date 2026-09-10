import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../infra/config-store.js';
import { listAgents, expandTilde } from '../core/agents.js';
import { detectLayoutAbs, scanDir } from '../core/scanner.js';
import type { Skill } from '../core/skill.js';

/* ---------- 首启引导（PRD） ---------- */
export interface OnboardState {
  step: 'ask' | 'import' | 'collect' | 'done';
  needsSetup: boolean;
  agents: { key: string; name: string }[];
}

/** 依据 onboarded 与是否已有 repos 判定引导步骤 */
export function getOnboardState(cfg: ConfigStore): OnboardState {
  const agents = listAgents(cfg.data).map((a) => ({ key: a.key, name: a.name }));
  if (cfg.data.onboarded) return { step: 'done', needsSetup: false, agents };
  // 已有资产库但未完成 onboarded：引导归集/确认
  if (cfg.data.repos.length > 0) return { step: 'collect', needsSetup: false, agents };
  return { step: 'ask', needsSetup: true, agents };
}

/** 把已有资产库目录导入为 repo，并标记 onboarded */
export function importAsRepo(cfg: ConfigStore, rawPath: string, agent?: string) {
  const abs = expandTilde(rawPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`路径不存在或非目录: ${rawPath}`);
  }
  const det = detectLayoutAbs(abs);
  const defaultRoot = path.join(abs, 'skills');
  const base = path.basename(abs) || 'repo';
  let id = base;
  let i = 2;
  while (cfg.data.repos.some((x) => x.id === id)) id = `${base}-${i++}`;
  cfg.data.repos.push({
    id,
    path: rawPath,
    layout: det.layout,
    root: det.root !== defaultRoot ? det.root : undefined,
  });
  cfg.data.onboarded = true;
  if (agent && !cfg.data.activeAgents.includes(agent)) cfg.data.activeAgents.push(agent);
  cfg.save();
  return { repo: cfg.data.repos[cfg.data.repos.length - 1], skills: det.count };
}

export interface CollectDecision { name: string; agent: string }

/** 从选定 agent 归集 skill 建库，并标记 onboarded */
export function collectOnboard(cfg: ConfigStore, repoId: string, decisions: CollectDecision[]) {
  const repo = cfg.data.repos.find((x) => x.id === repoId);
  if (!repo) throw new Error(`repo 不存在: ${repoId}`);
  const skillsRoot = path.join(expandTilde(repo.path), 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const collected: string[] = [];
  const skipped: string[] = [];
  // 若传入整 agent（name 为空），归集该 agent 全部可收集 skill
  const whole = decisions.length === 1 && !decisions[0].name;
  if (whole) {
    const a = listAgents(cfg.data).find((x) => x.key === decisions[0].agent);
    if (a?.installed) {
      for (const s of scanDir(a.globalDir, 'probe', 'nested')) {
        const dest = path.join(skillsRoot, s.name);
        if (fs.existsSync(dest)) { skipped.push(`${s.name}(已存在)`); continue; }
        fs.cpSync(s.dir, dest, { recursive: true });
        collected.push(s.name);
      }
    } else { skipped.push('agent 未安装'); }
  } else {
    for (const d of decisions) {
      const a = listAgents(cfg.data).find((x) => x.key === d.agent);
      if (!a?.installed) { skipped.push(`${d.name}(agent ${d.agent} 未安装)`); continue; }
      const hit = scanDir(a.globalDir, 'probe', 'nested').find((s) => s.name === d.name);
      if (!hit) { skipped.push(`${d.name}(未在 ${a.name} 中找到)`); continue; }
      const dest = path.join(skillsRoot, d.name);
      if (fs.existsSync(dest)) { skipped.push(`${d.name}(已存在)`); continue; }
      fs.cpSync(hit.dir, dest, { recursive: true });
      collected.push(d.name);
    }
  }
  cfg.data.onboarded = true;
  cfg.save();
  return { collected, skipped };
}

/** 合并仲裁：按 name 保留某来源版本，未在仓库本体的收编入主仓库，并记录归属 */
export function mergeSkill(cfg: ConfigStore, allSkills: Skill[], name: string, keepSource: string) {
  const cands = allSkills.filter((s) => s.name === name);
  const winner = cands.find((s) => s.source === keepSource) ?? cands[0];
  if (!winner) throw new Error(`skill 不存在: ${name}`);
  const primary = cfg.data.repos[0];
  if (primary && !cfg.data.repos.some((r) => r.id === winner.source)) {
    const skillsRoot = path.join(expandTilde(primary.path), 'skills');
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