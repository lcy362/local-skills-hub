import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { findBuiltin, resolveGlobalDir, expandTilde } from './agents.js';

export interface SyncResult {
  agent: string;
  created: string[];
  removed: string[];
  failed: { skill: string; reason: string }[];
}

/** 计算某 agent 应生效的 skill 集合（P0：所有激活 preset 的成员） */
export function computeDesired(cfg: ConfigStore, allSkills: Skill[]): Map<string, Skill> {
  const desired = new Map<string, Skill>();
  for (const p of cfg.data.presets) {
    if (!p.active) continue;
    for (const id of p.skills) {
      const sk = allSkills.find((s) => s.id === id);
      if (sk) desired.set(id, sk);
    }
  }
  return desired;
}

export function symlinkSkill(linkPath: string, targetDir: string): void {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  // 清理旧的半成品链接/目录
  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.symlinkSync(targetDir, linkPath, 'dir');
}

export function copySkill(linkPath: string, targetDir: string): void {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.cpSync(targetDir, linkPath, { recursive: true });
}

export function deployAgent(cfg: ConfigStore, agentKey: string, desired: Map<string, Skill>, allSkills: Skill[]): SyncResult {
  const def = findBuiltin(agentKey);
  const result: SyncResult = { agent: agentKey, created: [], removed: [], failed: [] };
  if (!def) {
    result.failed.push({ skill: '*', reason: `未知 agent: ${agentKey}` });
    return result;
  }
  // 共享目录的 agent（cline/warp 等）与其它 agent 共用 ~/.agents/skills，采用“只清理本 agent 曾部署项”逻辑
  const agentsDir = resolveGlobalDir(def, cfg.data.agents[agentKey]?.globalDir);
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

  const mode = cfg.data.agents[agentKey]?.sync ?? cfg.data.defaultSync;
  const seen = new Set<string>();

  for (const sk of desired.values()) {
    const target = sk.dir;
    const linkDir = path.join(agentsDir, sk.name);
    seen.add(sk.name);
    if (fs.existsSync(linkDir) && fs.lstatSync(linkDir).isSymbolicLink()) {
      // 已软链且指向正确则跳过
      const targetStat = fs.realpathSync(linkDir);
      if (targetStat === fs.realpathSync(target)) continue;
    }
    try {
      if (mode === 'copy') copySkill(linkDir, target);
      else symlinkSkill(linkDir, target);
      result.created.push(sk.id);
    } catch (e) {
      result.failed.push({ skill: sk.id, reason: (e as Error).message });
    }
  }

  // 清理不再需要的项：仅删除明显的软链（避免误删 agent 自身真实 skill）
  for (const entry of fs.readdirSync(agentsDir)) {
    if (seen.has(entry)) continue;
    const p = path.join(agentsDir, entry);
    try {
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) {
        fs.unlinkSync(p);
        result.removed.push(entry);
      }
    } catch { /* skip */ }
  }
  return result;
}

/** 触发式同步：将活跃 agent 全部同步到“激活 preset”的 skill 集合 */
export function syncActive(cfg: ConfigStore, allSkills: Skill[], only?: string[]): SyncResult[] {
  const targets = only ?? cfg.data.activeAgents;
  const desired = computeDesired(cfg, allSkills);
  return targets.map((k) => deployAgent(cfg, k, desired, allSkills));
}

export const _internal = { computeDesired, deployAgent, expandTilde };
