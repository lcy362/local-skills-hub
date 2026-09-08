import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { HubConfig } from '../config/types.js';
import type { Skill } from './skill.js';
import type { DesiredContext } from './sync.js';

export type ToolCategory = 'coding' | 'lobster';

export interface AgentDef {
  key: string;
  name: string;
  /** 相对 home 的全局目录 */
  global: string;
  /** 项目级相对目录，可空 */
  project?: string;
  category: ToolCategory;
  family?: string;
  /** 文档化的跨产品目录复用：此目录亦被这些产品读取（无需同目录爆破即可说明） */
  alsoUsedBy?: string[];
  /** 是否读取共享 ~/.agents 或 ~/.config/agents（仅发现/部署共享） */
  shared?: 'agents' | 'config-agents';
  recursive?: boolean;
}

// 对照 PRD §5.2.1（以 skills-manager 为准 + pks 补齐）
export const builtinAgents: AgentDef[] = [
  { key: 'cursor', name: 'Cursor', global: '.cursor/skills', project: '.cursor/skills', category: 'coding' },
  { key: 'claude', name: 'Claude Code', global: '.claude/skills', project: '.claude/skills', category: 'coding' },
  { key: 'opencode', name: 'OpenCode', global: '.config/opencode/skills', project: '.opencode/skills', category: 'coding', shared: 'agents' },
  { key: 'codex', name: 'Codex CLI', global: '.codex/skills', project: '.codex/skills', category: 'coding', shared: 'agents' },
  { key: 'github_copilot', name: 'GitHub Copilot', global: '.copilot/skills', project: '.copilot/skills', category: 'coding', shared: 'agents' },
  { key: 'grok', name: 'Grok', global: '.grok/skills', project: '.grok/skills', category: 'coding' },
  { key: 'trae', name: 'TRAE (TraeCode)', global: '.trae/skills', project: '.trae/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork', 'TraeCode CLI'] },
  { key: 'trae-cn', name: 'TRAE CN', global: '.trae-cn/skills', project: '.trae-cn/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork(国内)', 'TraeCode CLI'] },
  { key: 'qoder', name: 'Qoder', global: '.qoder/skills', project: '.qoder/skills', category: 'coding', family: 'Qoder' },
  { key: 'qwen-code', name: 'Qwen Code', global: '.qwen/skills', project: '.qwen/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderwork', name: 'QoderWork(国际)', global: '.qoderwork/skills', project: '.qoderwork/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderworkcn', name: 'QoderWork(国内)', global: '.qoderworkcn/skills', project: '.qoderworkcn/skills', category: 'coding', family: 'Qoder' },
  { key: 'codebuddy', name: 'CodeBuddy', global: '.codebuddy/skills', project: '.codebuddy/skills', category: 'coding' },
  { key: 'windsurf', name: 'Windsurf', global: '.codeium/windsurf/skills', project: '.windsurf/skills', category: 'coding' },
  { key: 'clawdbot', name: 'Clawdbot', global: '.clawdbot/skills', project: '.clawdbot/skills', category: 'coding', family: 'Claw' },
  { key: 'gemini-cli', name: 'Gemini CLI', global: '.gemini/skills', project: '.gemini/skills', category: 'coding' },
  { key: 'kilo-code', name: 'Kilo Code', global: '.kilocode/skills', category: 'coding' },
  { key: 'roo-code', name: 'Roo Code', global: '.roo/skills', category: 'coding' },
  { key: 'goose', name: 'Goose', global: '.config/goose/skills', category: 'coding' },
  { key: 'amp', name: 'Amp', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'replit', name: 'Replit', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'cline', name: 'Cline', global: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'warp', name: 'Warp', global: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'droid', name: 'Droid', global: '.factory/skills', category: 'coding' },
  { key: 'hermes', name: 'Hermes Agent', global: '.hermes/skills', category: 'lobster', family: 'Claw', recursive: true },
  { key: 'openclaw', name: 'OpenClaw', global: '.openclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'qclaw', name: 'QClaw', global: '.qclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'easyclaw', name: 'EasyClaw', global: '.easyclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'workbuddy', name: 'WorkBuddy', global: '.workbuddy/skills', category: 'lobster', family: 'Claw' },
  { key: 'reasonix', name: 'DeepSeek Reasonix', global: '.reasonix/skills', project: '.reasonix/skills', category: 'coding' },
  { key: 'teamwork', name: 'Teamwork', global: 'teamwork/skills', project: 'teamwork/skills', category: 'lobster' },
];

export function findBuiltin(key: string): AgentDef | undefined {
  return builtinAgents.find((a) => a.key === key);
}

export function resolveGlobalDir(def: AgentDef, override?: string): string {
  if (override) return expandTilde(override);
  return path.join(os.homedir(), def.global);
}
export function resolveProjectDir(def: AgentDef, cwd: string, override?: string): string | undefined {
  if (!def.project) return undefined;
  if (override) return path.join(cwd, override);
  return path.join(cwd, def.project);
}

export function expandTilde(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(2)) : p;
}

export interface AgentView extends AgentDef {
  globalDir: string;
  installed: boolean;
  sync: string;
  active: boolean;
  layers?: string[];
  /** 与哪些 agent 解析到同一目录（自动比对） */
  sharedWith: string[];
  /** 文档化跨产品复用 */
  alsoUsedBy?: string[];
  /** 技能管理模式；缺省 'preset' */
  mode?: 'preset' | 'manual';
  /** mode=preset 时关联的 preset 名 */
  preset?: string;
  /** mode=manual 时手动开启的 skill id */
  manualOn?: string[];
}

export function listAgents(cfg: HubConfig): AgentView[] {
  const views: AgentView[] = builtinAgents.map((def) => {
    const ov = cfg.agents[def.key];
    const globalDir = resolveGlobalDir(def, ov?.globalDir);
    const installed = fs.existsSync(globalDir);
    const sync = ov?.sync ?? cfg.defaultSync;
    const active = cfg.activeAgents.includes(def.key);
    return {
      ...def,
      globalDir,
      installed,
      sync,
      active,
      layers: def.shared ? [def.shared] : undefined,
      sharedWith: [],
      ...(ov?.mode ? { mode: ov.mode } : {}),
      ...(ov?.preset ? { preset: ov.preset } : {}),
      ...(ov?.explicitOn ? { explicitOn: ov.explicitOn } : {}),
      ...(ov?.explicitOff ? { explicitOff: ov.explicitOff } : {}),
    };
  });
  // 按解析后的 globalDir 分组，同目录者互为 sharedWith
  const byDir = new Map<string, AgentView[]>();
  for (const v of views) {
    const arr = byDir.get(v.globalDir) ?? [];
    arr.push(v);
    byDir.set(v.globalDir, arr);
  }
  for (const v of views) {
    v.sharedWith = (byDir.get(v.globalDir) ?? []).filter((o) => o.key !== v.key).map((o) => o.name);
  }
  return views.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.installed ? 1 : 0) - (a.installed ? 1 : 0));
}

export interface AgentSkillRow {
  name: string;
  source: 'managed' | 'owned';
  /** 期望部署与否（wanted） */
  wanted: boolean;
  /** 物理是否存在于技能目录 */
  present: boolean;
  /** 存储/部署方式：软链 / 复制到目录 / 本体(自带) / 待部署(pending) */
  store: 'symlink' | 'copy' | 'own' | 'pending';
  /** 来源原因：套餐基准 / 手动覆盖 / 自带 */
  reason: 'preset' | 'manual' | 'own';
  /** 套餐基准里被显式关闭（offOverride）→ 该行不 wanted，提示"套餐成员·已停用" */
  offOverride?: boolean;
  /** 来源套餐名（reason=preset 时） */
  preset?: string;
  /** 来源资产库 id；自带时为空 */
  repo?: string;
  skillId?: string;
  dir?: string;
  link?: boolean;
  /** 关闭该技能时应走哪个叠加集：'off'=加入 explicitOff（套餐基准成员）；'on'=移出 explicitOn */
  disableVia?: 'off' | 'on';
}

/**
 * 构建某 agent 技能行的完整并集 = 期望集 ∪（目录已存在）。
 * 每行用 wanted × present 表达状态，并用 reason/offOverride 决定唯一操作；
 * 返回自带技能与期望缺失（待部署）也一并列出。
 */
export function agentSkillRows(agentKey: string, cfg: HubConfig, allSkills: Skill[], ctx: DesiredContext): AgentSkillRow[] {
  const def = findBuiltin(agentKey);
  if (!def) return [];
  const dir = resolveGlobalDir(def, cfg.agents[agentKey]?.globalDir);
  const desired = ctx.desired;
  const rows: AgentSkillRow[] = [];
  const presentNames = new Set<string>();
  const presentLstat = new Map<string, fs.Dirent | 'symlink'>();

  // 1) 扫描目录，记录是否存在及各目录项类型
  if (fs.existsSync(dir)) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      presentNames.add(ent.name);
      presentLstat.set(ent.name, ent); // isSymbolicLink() 可用
    }
  }

  const isOff = (name: string) => ctx.offIds.has(name) || ctx.offNames.has(name);

  // 2) 期望集行（无论是否存在）：wanted=true
  for (const skill of desired.values()) {
    const inBase = ctx.baselineNames.has(skill.name);
    const inOn = ctx.onNames.has(skill.name);
    const present = presentNames.has(skill.name);
    const ent = presentLstat.get(skill.name);
    const isLinkEnt = !!ent && (ent === 'symlink' || (typeof ent !== 'string' && ent.isSymbolicLink()));
    let store: AgentSkillRow['store'] = 'pending';
    if (present) store = isLinkEnt ? 'symlink' : 'copy';
    rows.push({
      name: skill.name, source: 'managed', wanted: true, present, store,
      reason: inBase ? 'preset' : 'manual',
      preset: ctx.presetOf.get(skill.name),
      repo: skill.source, skillId: skill.id,
      dir: present ? path.join(dir, skill.name) : undefined,
      link: present ? isLinkEnt : undefined,
      disableVia: inBase && !inOn ? 'off' : 'on',
    });
  }

  // 3) 目录中存在但不在期望集的行（残留 or 自带）
  for (const name of presentNames) {
    if ([...desired.values()].some((s) => s.name === name)) continue; // 已在期望集，跳过
    const ent = presentLstat.get(name);
    if (!ent) continue;
    const isLink = ent === 'symlink' || (typeof ent !== 'string' && ent.isSymbolicLink());
    if (isLink) {
      // 软链但不期望：来自套餐但已被关闭 / 或旧遗留 → 残留行
      const offOverride = ctx.baselineNames.has(name) && isOff(name);
      const src = allSkills.find((s) => s.name === name);
      rows.push({
        name, source: 'managed', wanted: false, present: true, store: 'symlink',
        reason: 'preset', offOverride,
        preset: ctx.presetOf.get(name),
        skillId: src?.id, repo: src?.source,
        dir: path.join(dir, name), link: true,
      });
    } else {
      const p = path.join(dir, name);
      if (!isSkillDir(p)) continue; // 只把真正的技能目录视作自带
      rows.push({ name, source: 'owned', wanted: false, present: true, store: 'own', reason: 'own', dir: p, link: false });
    }
  }

  return rows.sort((a, b) => Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name));
}

/** 判断目录是否为带 SKILL.md 的技能目录 */
function isSkillDir(p: string): boolean {
  try {
    return fs.existsSync(path.join(p, 'SKILL.md')) || fs.existsSync(path.join(p, 'SKILL.md', 'README.md'));
  } catch { return false; }
}
