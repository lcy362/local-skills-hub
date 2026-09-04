import fs from 'node:fs';
import path from 'node:path';
import { Repo, ForeignSource, Layout } from '../config/types.js';
import { Skill, readSkill, hasSkill } from './skill.js';
import { expandTilde } from './agents.js';

/**
 * 扫描一个根目录下的 skill。
 * flat: 直接子目录含 SKILL.md 即 skill
 * nested: 递归查找含 SKILL.md 的目录
 * auto: 子孙一层优先，若无则递归
 */
export function scanDir(root: string, source: string, layout: Layout): Skill[] {
  const children = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).map((d) => d.name) : [];
  const out: Skill[] = [];
  for (const name of children) {
    const child = path.join(root, name);
    let isDir: boolean;
    try {
      const st = fs.lstatSync(child);
      if (st.isSymbolicLink()) {
        if (!fs.existsSync(child)) continue; // 失效软链，跳过
      }
      isDir = fs.statSync(child).isDirectory();
    } catch { continue; }
    if (!isDir) continue;
    if (hasSkill(child)) {
      const s = readSkill(child)!!;
      s.source = source;
      s.id = `${s.name}@${source}`;
      out.push(s);
    } else if (layout !== 'flat') {
      // nested / auto：继续递归
      out.push(...scanDir(child, source, 'nested'));
    }
  }
  return out;
}

/**
 * 自动识别一个（已存在的）skill 目录的布局形式。
 * 优先看 <path>/skills 子目录（仓库惯例），其次看 path 本身。
 * 直接子目录含 SKILL.md → flat；仅深层含 → nested；无技能 → 默认 flat（标准）。
 */
export function detectLayoutAbs(absPath: string): { layout: 'flat' | 'nested'; count: number; root: string } {
  const dirs = fs.existsSync(absPath) && fs.statSync(absPath).isDirectory() ? [absPath] : [];
  const skillsChild = path.join(absPath, 'skills');
  if (dirs.length && fs.existsSync(skillsChild) && fs.statSync(skillsChild).isDirectory()) dirs.push(skillsChild);
  for (const root of dirs) {
    let direct = 0;
    for (const name of fs.readdirSync(root, { withFileTypes: true })) {
      const child = path.join(root, name.name);
      try { if (name.isDirectory() && hasSkill(child)) direct++; } catch { /* ignore */ }
    }
    if (direct > 0) return { layout: 'flat', count: direct, root };
    const deep = scanDir(root, 'probe', 'nested');
    if (deep.length > 0) return { layout: 'nested', count: deep.length, root };
  }
  return { layout: 'flat', count: 0, root: skillsChild };
}

export function scanRepo(repo: Repo): { source: string; path: string; skills: Skill[] } {
  const root = repo.root ?? path.join(expandTilde(repo.path), 'skills');
  return { source: repo.id, path: root, skills: scanDir(root, repo.id, repo.layout) };
}

export function scanForeign(src: ForeignSource): { source: string; path: string; skills: Skill[] } {
  const root = expandTilde(src.path);
  const skills = fs.existsSync(root)
    ? scanDir(root, `ext:${src.id}`, src.layout)
    : [];
  return { source: src.id, path: root, skills };
}

/** 聚合所有仓库与外部来源的 skill */
export function scanAll(repos: Repo[], sources: ForeignSource[]) {
  const bySource = new Map<string, { path: string; skills: Skill[] }>();
  for (const r of repos) {
    const res = scanRepo(r);
    bySource.set(res.source, { path: res.path, skills: res.skills });
  }
  for (const s of sources) {
    const res = scanForeign(s);
    bySource.set(`ext:${s.id}`, { path: res.path, skills: res.skills });
  }
  const skills = [...bySource.values()].flatMap((x) => x.skills);
  return { bySource, skills };
}
