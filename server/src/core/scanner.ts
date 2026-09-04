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
    if (!fs.statSync(child).isDirectory()) continue;
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

export function scanRepo(repo: Repo): { source: string; path: string; skills: Skill[] } {
  const root = path.join(expandTilde(repo.path), 'skills');
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
