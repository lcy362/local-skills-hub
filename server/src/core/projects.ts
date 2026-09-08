import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { readSkill } from './skill.js';
import { listAgents, resolveProjectDir } from './agents.js';
import { ProjectLink } from '../config/types.js';

/** 项目的期望集 = 标签命中 ∪ 逐个开启 − 逐个关闭 */
export function projectedSkills(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): Skill[] {
  const tagSet = new Set(proj.tags);
  const on = new Set(proj.explicitOn ?? []);
  const off = new Set(proj.explicitOff ?? []);
  return allSkills.filter((s) => {
    const tags = cfg.data.skillMeta[s.id]?.tags ?? [];
    const inTag = tagSet.size > 0 && tags.some((t) => tagSet.has(t));
    if (!(inTag || on.has(s.id))) return false;
    return !off.has(s.id);
  });
}

export interface ProjectSkillRow {
  skillId?: string;
  name: string;
  title?: string;
  description?: string;
  source: 'managed' | 'owned';
  wanted: boolean;
  present: boolean;
  store: 'copy' | 'pending' | 'own';
  /** 来源原因：标签命中 / 逐个开启 / 自带 */
  reason: 'tag' | 'manual' | 'own';
  /** 标签命中但被逐个关闭 */
  offOverride?: boolean;
  /** 关闭该技能时应走哪个叠加集：'off'=加入 explicitOff（标签命中成员）；'on'=移出 explicitOn */
  disableVia?: 'off' | 'on';
  repo?: string;
  dir?: string;
}

/** 构建项目技能行：期望集（并按项目配置覆盖）∪ 目录已存在。与 agent 技能行逻辑对齐。 */
export function projectSkillRows(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): ProjectSkillRow[] {
  const onIds = new Set(proj.explicitOn ?? []);
  const offIds = new Set(proj.explicitOff ?? []);
  const agentsRoot = path.join(proj.path, '.agents', 'skills');
  const presentNames = new Set<string>();
  const presentIsLink = new Map<string, boolean>();
  if (fs.existsSync(agentsRoot)) {
    for (const e of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
      presentNames.add(e.name);
      presentIsLink.set(e.name, e.isSymbolicLink());
    }
  }
  const rows: ProjectSkillRow[] = [];
  const desired = projectedSkills(cfg, proj, allSkills);

  // 1) 期望集行
  for (const s of desired) {
    const inTag = (cfg.data.skillMeta[s.id]?.tags ?? [])
      .some((t) => (proj.tags ?? []).includes(t));
    const inOn = onIds.has(s.id);
    const present = presentNames.has(s.name) && !presentIsLink.get(s.name);
    const off = offIds.has(s.id);
    rows.push({
      skillId: s.id, name: s.name, title: s.name, description: s.description,
      source: 'managed', wanted: true, present,
      store: present ? 'copy' : 'pending',
      reason: inOn ? 'manual' : 'tag',
      offOverride: inTag && off ? true : undefined,
      disableVia: inTag ? 'off' : 'on',
      repo: s.source,
      dir: present ? path.join(agentsRoot, s.name) : undefined,
    });
  }

  // 2) 目录中存在但不在期望集（残留 / 自带）
  const desiredNames = new Set(desired.map((s) => s.name));
  for (const name of presentNames) {
    if (desiredNames.has(name)) continue;
    const isLink = presentIsLink.get(name) ?? false;
    if (isLink) continue; // 软链不视作项目内技能，略过
    const p = path.join(agentsRoot, name);
    const meta = readSkill(p);
    rows.push({
      name, title: meta?.name ?? name, description: meta?.description,
      source: 'owned', wanted: false, present: true, store: 'own',
      reason: 'own', dir: p,
    });
  }

  return rows.sort((a, b) => Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name));
}

/** 可从资产库补入本项目的候选：不在期望集、不在目录、也未被逐个关闭 */
export function projectAddable(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): { id: string; name: string; repo: string }[] {
  const desired = new Set(projectedSkills(cfg, proj, allSkills).map((s) => s.name));
  const present = projectSkillRows(cfg, proj, allSkills).filter((r) => r.present).map((r) => r.name);
  const off = new Set(proj.explicitOff ?? []);
  const presentSet = new Set(present);
  return allSkills
    .filter((s) => !desired.has(s.name) && !presentSet.has(s.name) && !off.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, repo: s.source }));
}

export interface ProjectSyncResult {
  project: string;
  copied: string[];
  removed: string[];
  agentLinks: { agent: string; created: string[] }[];
  errors: string[];
}

/** 会以「项目目录软链 → .agents/skills」方式投放的 agent（有 project 目录且非复制模式） */
export function linkableAgents(cfg: ConfigStore) {
  return listAgents(cfg.data).filter((a) => a.project && cfg.data.agents[a.key]?.sync !== 'copy');
}

/** 某 agent 的项目技能目录 */
function agentLinkDir(cfg: ConfigStore, a: { key: string }, projectPath: string): string | undefined {
  return resolveProjectDir(listAgents(cfg.data).find((x) => x.key === a.key)!, projectPath, cfg.data.agents[a.key]?.projectDir);
}

/** 判断 p 是否为指向 target 的目录软链（.agents/skills 即"已投放"，为该 agent 的实际目录结构） */
function isSymlinkTo(p: string, target: string): boolean {
  try {
    if (fs.lstatSync(p).isSymbolicLink() && fs.existsSync(p)) return fs.realpathSync(p) === fs.realpathSync(target);
  } catch { /* skip */ }
  return false;
}

/** 从实际目录结构读取本项目已投放的 agent（项目技能目录为软链指向 .agents/skills 者），无需配置 */
export function deployedAgents(cfg: ConfigStore, projectPath: string): string[] {
  const target = path.join(projectPath, '.agents', 'skills');
  if (!fs.existsSync(target)) return [];
  const out: string[] = [];
  for (const a of linkableAgents(cfg)) {
    const linkDir = agentLinkDir(cfg, a, projectPath);
    if (linkDir && isSymlinkTo(linkDir, target)) out.push(a.key);
  }
  return out;
}

/**
 * 让项目技能目录软链与期望集合对齐（期望集=本次调用传入的 wantedAgents，缺省=沿用当前已投放者）。
 * 依据实际目录结构建/撤软链，不写任何配置。返回新建的 agent key 列表。
 */
export function ensureAgentLinks(cfg: ConfigStore, projectPath: string, wanted?: Set<string>): string[] {
  const created: string[] = [];
  const target = path.join(projectPath, '.agents', 'skills');
  fs.mkdirSync(target, { recursive: true });
  const setMode = !!wanted;
  for (const a of linkableAgents(cfg)) {
    const linkDir = agentLinkDir(cfg, a, projectPath);
    if (!linkDir) continue;
    const already = isSymlinkTo(linkDir, target);
    const want = setMode ? wanted!.has(a.key) : already;
    if (want) {
      if (already) continue; // 已投放且指向正确
      fs.mkdirSync(path.dirname(linkDir), { recursive: true });
      if (fs.existsSync(linkDir) && !fs.lstatSync(linkDir).isSymbolicLink()) {
        continue; // 真实目录：不覆盖，避免误删用户手动放置的 skill
      }
      if (fs.existsSync(linkDir)) fs.rmSync(linkDir, { recursive: true, force: true });
      fs.symlinkSync(target, linkDir, 'dir');
      created.push(a.key);
    } else if (already) {
      // setMode 下不再需要该 agent → 撤除软链（实际目录结构回到"未投放"）
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  }
  return created;
}

/**
 * 项目级同步：
 * 1) 把项目期望集（标签匹配 ∪ 逐个开启 − 逐个关闭）的 skill 本体复制到 <project>/.agents/skills
 * 2) 让项目投放的 agent 的项目技能目录软链到 .agents（共享同一份副本；投放状态即实际目录结构，不存配置）
 */
export function syncProject(cfg: ConfigStore, projectPath: string, allSkills: Skill[], wantedAgents?: Set<string>): ProjectSyncResult {
  const res: ProjectSyncResult = { project: projectPath, copied: [], removed: [], agentLinks: [], errors: [] };
  const proj = cfg.data.projects.find((p) => path.resolve(p.path) === path.resolve(projectPath));
  if (!proj) { res.errors.push('项目未登记'); return res; }

  const desired = projectedSkills(cfg, proj, allSkills);
  const agentsRoot = path.join(projectPath, '.agents', 'skills');
  fs.mkdirSync(agentsRoot, { recursive: true });
  const seen = new Set<string>();

  for (const s of desired) {
    seen.add(s.name);
    const dest = path.join(agentsRoot, s.name);
    const isSame = fs.existsSync(dest)
      && fs.readdirSync(dest).length > 0;
    // 简单判定：目标不存在或是软链(旧误链)则刷新；正文一致时跳过
    if (fs.existsSync(dest) && !fs.lstatSync(dest).isSymbolicLink()) continue;
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    try {
      fs.cpSync(s.dir, dest, { recursive: true });
      res.copied.push(s.name);
    } catch (e) { res.errors.push(`${s.name}: ${(e as Error).message}`); }
  }

  // 清理 .agents 里已不在期望集的受管目录（仅 dir，不删软链）
  for (const entry of fs.readdirSync(agentsRoot)) {
    if (seen.has(entry)) continue;
    const p = path.join(agentsRoot, entry);
    try {
      if (fs.lstatSync(p).isDirectory() && !fs.lstatSync(p).isSymbolicLink()) {
        // 仅清理含 SKILL.md 的受管项，避免误删用户自己的内容
        if (fs.existsSync(path.join(p, 'SKILL.md'))) { fs.rmSync(p, { recursive: true, force: true }); res.removed.push(entry); }
      }
    } catch { /* skip */ }
  }

  // 项目级 agent 软链：以实际目录结构为准（wantedAgents 缺省=沿用当前已投放者）
  const created = ensureAgentLinks(cfg, projectPath, wantedAgents);
  for (const key of created) res.agentLinks.push({ agent: key, created: [...seen] });
  return res;
}

export function addProject(cfg: ConfigStore, projectPath: string, tags: string[]): string {
  const abs = path.resolve(projectPath);
  if (!fs.existsSync(abs)) throw new Error(`路径不存在: ${abs}`);
  if (cfg.data.projects.some((p) => path.resolve(p.path) === abs)) throw new Error('项目已登记');
  cfg.data.projects.push({ path: abs, tags });
  cfg.save();
  return abs;
}
