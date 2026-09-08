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

/**
 * 计算某 agent 应生效的 skill 集合。
 * - mode=manual：手动开启的 manualOn 成员
 * - mode=preset 且指定 preset：该 preset 成员
 * - 其余（缺省/未指定）：所有「激活 preset」的并集（历史行为）
 * agentKey 为空时等价于历史 computeDesired（全局激活 presets）。
 */
export function computeDesired(cfg: ConfigStore, allSkills: Skill[], agentKey?: string): Map<string, Skill> {
  const desired = new Map<string, Skill>();
  const add = (id: string) => {
    const sk = allSkills.find((s) => s.id === id);
    if (sk) desired.set(id, sk);
  };
  const ov = agentKey ? cfg.data.agents[agentKey] : undefined;
  if (ov?.mode === 'manual') {
    // manualOn 支持按 skill id(name@来源) 或按名字（目录名）匹配，二者皆可
    for (const id of ov.manualOn ?? []) {
      const sk = allSkills.find((s) => s.id === id) ?? allSkills.find((s) => s.name === id);
      if (sk) desired.set(sk.id, sk);
    }
    return desired;
  }
  if (ov?.preset) {
    const p = cfg.data.presets.find((x) => x.name === ov.preset);
    if (p) { for (const id of p.skills) add(id); return desired; }
  }
  for (const p of cfg.data.presets) {
    if (!p.active) continue;
    for (const id of p.skills) add(id);
  }
  return desired;
}

/** 某 agent 期望部署的 skill 名字集合（供来源标注/清理判断） */
export function desiredNamesFor(cfg: ConfigStore, allSkills: Skill[], agentKey: string): Set<string> {
  return new Set([...computeDesired(cfg, allSkills, agentKey).values()].map((s) => s.name));
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

/** 触发式同步：将指定（默认活跃）agent 各按自身管理模式同步到期望 skill 集合 */
export function syncActive(cfg: ConfigStore, allSkills: Skill[], only?: string[]): SyncResult[] {
  const targets = only ?? cfg.data.activeAgents;
  return targets.map((k) => deployAgent(cfg, k, computeDesired(cfg, allSkills, k), allSkills));
}

export interface SyncDiff {
  agent: string;
  desiredNames: string[];
  /** 期望有、实际未部署 */
  missing: string[];
  /** 实际有、期望无（注意：/sync 只会删除“软链”分歧项） */
  extra: string[];
  /** 期望中应部署但软链失效 */
  brokenLink: string[];
}

/**
 * 只读比对：期望 skill 集合（activate preset 成员） vs 每个活跃 agent 实际部署集合。
 * 绝不写盘，仅供诊断。extra 口径与 deployAgent 一致：仅软链分歧项可被一键同步清除，真实目录仅提示。
 */
export function diffSync(cfg: ConfigStore, allSkills: Skill[]): SyncDiff[] {
  const out: SyncDiff[] = [];
  for (const key of cfg.data.activeAgents) {
    const def = findBuiltin(key);
    if (!def) continue;
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const desiredNames = [...desiredNamesFor(cfg, allSkills, key)];
    const actual = new Set<string>();
    const brokenLink: string[] = [];
    if (fs.existsSync(dir)) {
      for (const ent of fs.readdirSync(dir)) {
        const p = path.join(dir, ent);
        let ls;
        try { ls = fs.lstatSync(p); } catch { continue; }
        if (ls.isSymbolicLink() && !fs.existsSync(p)) { brokenLink.push(ent); continue; }
        if (ls.isSymbolicLink() || ls.isDirectory()) actual.add(ent);
      }
    }
    const missing = desiredNames.filter((n) => !actual.has(n));
    const extra = [...actual].filter((n) => !desiredNames.includes(n));
    out.push({ agent: key, desiredNames, missing, extra, brokenLink });
  }
  return out;
}

export const _internal = { computeDesired, deployAgent, diffSync, expandTilde };
