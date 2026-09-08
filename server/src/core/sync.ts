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

export interface DesiredContext {
  mode: 'preset' | 'manual';
  /** 显式关联的基准套餐名（preset 模式）；未指定为空串 */
  preset: string;
  /** 最终期望：id→Skill（= 基准 ∪ explicitOn − explicitOff） */
  desired: Map<string, Skill>;
  /** 基准（套餐）成员的名字集合 */
  baselineNames: Set<string>;
  /** 名字 → 来源套餐名（基准成员用；用于标注"来自套餐X"） */
  presetOf: Map<string, string>;
  /** 显式开启成员的名字集合（手动挑选基础 / 套餐之上额外） */
  onNames: Set<string>;
  /** 显式关闭成员的 id/名字（套餐之上裁剪）；offNames 为名字归一化 */
  offIds: Set<string>;
  offNames: Set<string>;
}

/** 名字归一化：把 id(name@来源) 或纯名字映射为最终的技能名（目录名） */
function nameOf(id: string): string {
  const at = id.lastIndexOf('@');
  return at >= 0 ? id.slice(0, at) : id;
}

/**
 * 解析某 agent 的期望技能上下文。
 * 期望 = 基准 ∪ explicitOn − explicitOff，其中：
 * - mode=manual：基准为空（期望全靠 explicitOn）
 * - mode=preset + preset：基准 = 该套餐成员
 * - mode=preset，未指定 preset：基准 = 所有「激活 presets」并集
 * agentKey 为空时，desired 仅含全局激活 presets 成员（兼容全局同步）。
 */
export function desiredContext(cfg: ConfigStore, allSkills: Skill[], agentKey?: string): DesiredContext {
  const ov = agentKey ? cfg.data.agents[agentKey] : undefined;
  const mode = ov?.mode ?? 'manual';
  const onIds = ov?.explicitOn ?? [];
  const offIds = new Set(ov?.explicitOff ?? []);
  const offNames = new Set([...offIds].map(nameOf));
  const baselineNames = new Set<string>();
  const presetOf = new Map<string, string>();
  if (mode === 'preset') {
    const pushBase = (id: string, preset: string) => {
      baselineNames.add(nameOf(id));
      if (!presetOf.has(nameOf(id))) presetOf.set(nameOf(id), preset);
    };
    const p = ov?.preset ? cfg.data.presets.find((x) => x.name === ov.preset) : undefined;
    if (p) { for (const id of p.skills) pushBase(id, p.name); }
    else { for (const q of cfg.data.presets) if (q.active) for (const id of q.skills) pushBase(id, q.name); }
  }
  const desired = new Map<string, Skill>();
  const addById = (id: string) => {
    if (offIds.has(id) || offNames.has(nameOf(id))) return;
    const name = nameOf(id);
    const sk = allSkills.find((s) => s.id === id) ?? allSkills.find((s) => s.name === name);
    if (sk) desired.set(sk.id, sk);
  };
  for (const id of baselineNames) addById(id);
  for (const id of onIds) addById(id);
  return {
    mode,
    preset: ov?.preset ?? '',
    desired,
    baselineNames,
    presetOf,
    onNames: new Set(onIds.map(nameOf)),
    offIds,
    offNames,
  };
}

/**
 * 计算某 agent 应生效的 skill 集合（期望集）。
 * 依赖 desiredContext 的统一解析；语义见其文档。
 */
export function computeDesired(cfg: ConfigStore, allSkills: Skill[], agentKey?: string): Map<string, Skill> {
  return desiredContext(cfg, allSkills, agentKey).desired;
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
