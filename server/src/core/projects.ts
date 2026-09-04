import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { listAgents, resolveProjectDir } from './agents.js';

/** 项目应匹配的 skill：skill 的标签 ∩ 项目标签 非空 */
export function desiredSkillsForProject(cfg: ConfigStore, projectTags: string[], allSkills: Skill[]): Skill[] {
  const tagSet = new Set(projectTags);
  if (tagSet.size === 0) return [];
  return allSkills.filter((s) => {
    const tags = cfg.data.skillMeta[s.id]?.tags ?? [];
    return tags.some((t) => tagSet.has(t));
  });
}

export interface ProjectSyncResult {
  project: string;
  copied: string[];
  removed: string[];
  agentLinks: { agent: string; created: string[] }[];
  errors: string[];
}

/**
 * 项目级同步：
 * 1) 把标签匹配的 skill 本体复制到 <project>/.agents/skills
 * 2) 其他 agent 的项目级目录软链到 .agents（共享同一份副本，服务团队协作）
 */
export function syncProject(cfg: ConfigStore, projectPath: string, allSkills: Skill[]): ProjectSyncResult {
  const res: ProjectSyncResult = { project: projectPath, copied: [], removed: [], agentLinks: [], errors: [] };
  const proj = cfg.data.projects.find((p) => path.resolve(p.path) === path.resolve(projectPath));
  if (!proj) { res.errors.push('项目未登记'); return res; }

  const desired = desiredSkillsForProject(cfg, proj.tags, allSkills);
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

  // 其他 agent 的项目级目录软链到 .agents
  for (const a of listAgents(cfg.data)) {
    if (!a.project) continue;
    if (cfg.data.agents[a.key]?.sync === 'copy') continue; // 复制模式 agent 也复制本体到各自项目目录
    const target = path.join(agentsRoot);
    const linkDir = resolveProjectDir(a, projectPath, cfg.data.agents[a.key]?.projectDir);
    if (!linkDir) continue;
    fs.mkdirSync(linkDir, { recursive: true });
    const created: string[] = [];
    for (const entry of seen) {
      const lp = path.join(linkDir, entry);
      const src = path.join(target, entry);
      if (!fs.existsSync(src)) continue;
      if (fs.existsSync(lp) && fs.lstatSync(lp).isSymbolicLink() && fs.realpathSync(lp) === fs.realpathSync(src)) continue;
      if (fs.existsSync(lp)) fs.rmSync(lp, { recursive: true, force: true });
      fs.symlinkSync(src, lp, 'dir');
      created.push(entry);
    }
    res.agentLinks.push({ agent: a.key, created });
  }
  return res;
}

export function addProject(cfg: ConfigStore, projectPath: string, tags: string[]): void {
  const abs = path.resolve(projectPath);
  if (!fs.existsSync(abs)) throw new Error(`路径不存在: ${abs}`);
  if (cfg.data.projects.some((p) => path.resolve(p.path) === abs)) throw new Error('项目已登记');
  cfg.data.projects.push({ path: abs, tags });
  cfg.save();
}
