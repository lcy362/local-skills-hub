import fs from 'node:fs';
import path from 'node:path';
import { Repo, ForeignSource, Layout } from '../config/types.js';
import { Skill, readSkill, hasSkill } from './skill.js';
import { expandTilde } from './agents.js';
import { log } from '../infra/logger.js';

/**
 * 扫描一个根目录下的 skill。
 * flat: 直接子目录含 SKILL.md 即 skill
 * nested: 递归查找含 SKILL.md 的目录
 * auto: 自动检测（先按 flat，无结果再递归）
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

/** 解析布局：auto 在扫描期自动检测（SR-04） */
export function resolveLayout(root: string, layout: Layout): 'flat' | 'nested' {
  if (layout !== 'auto') return layout;
  if (!fs.existsSync(root)) return 'flat';
  return detectLayoutAbs(root).layout;
}

/* ---------- 带索引清单的库（EK-01 第三类结构） ---------- */

interface CatalogEntry { name: string; dir?: string }

/**
 * 读取「带索引清单」的 skill 库（如 ume-skills 的 skill-store/candidate-catalog.json）。
 * 清单仅用于补充元数据与定位本体；本体仍以 SKILL.md 为准，缺失者不计入。
 */
export function readCatalog(root: string, source: string): Skill[] {
  const candidates = [
    path.join(root, 'candidate-catalog.json'),
    path.join(root, 'skill-store', 'candidate-catalog.json'),
    path.join(root, 'catalog.json'),
  ];
  const out: Skill[] = [];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { continue; }
    const list: unknown = Array.isArray(raw)
      ? raw
      : typeof raw === 'object' && raw !== null
        ? ((raw as Record<string, unknown>).skills ?? (raw as Record<string, unknown>).candidates ?? [])
        : [];
    if (!Array.isArray(list)) continue;
    const entries: CatalogEntry[] = [];
    for (const it of list) {
      if (typeof it === 'string') { entries.push({ name: it }); continue; }
      if (typeof it !== 'object' || it === null) continue;
      const o = it as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name : typeof o.id === 'string' ? o.id : '';
      if (!name) continue;
      const rel = typeof o.path === 'string' ? o.path : typeof o.dir === 'string' ? o.dir : '';
      entries.push({ name, dir: rel || undefined });
    }
    for (const e of entries) {
      const dir = e.dir
        ? path.isAbsolute(e.dir) ? e.dir : path.join(root, e.dir)
        : path.join(root, e.name);
      if (!hasSkill(dir)) continue;
      const s = readSkill(dir)!!;
      s.source = source;
      s.id = `${s.name}@${source}`;
      out.push(s);
    }
    break; // 命中首个可用清单即可
  }
  return out;
}

/** 扫描一个源目录：清单优先（有则补），再按布局扫描本体，按 id 去重 */
function scanRoot(root: string, source: string, layout: Layout): Skill[] {
  if (!fs.existsSync(root)) return [];
  const byId = new Map<string, Skill>();
  for (const s of readCatalog(root, source)) byId.set(s.id, s);
  const resolved = resolveLayout(root, layout);
  for (const s of scanDir(root, source, resolved)) byId.set(s.id, s);
  return [...byId.values()];
}

export function scanRepo(repo: Repo): { source: string; path: string; skills: Skill[] } {
  const root = repo.root ? expandTilde(repo.root) : path.join(expandTilde(repo.path), 'skills');
  if (!fs.existsSync(root)) log.warn('scanner', `仓库目录不存在，跳过`, { source: repo.id, path: root });
  return { source: repo.id, path: root, skills: scanRoot(root, repo.id, repo.layout) };
}

export function scanForeign(src: ForeignSource): { source: string; path: string; skills: Skill[] } {
  const root = expandTilde(src.path);
  if (!fs.existsSync(root)) log.warn('scanner', `外部来源目录不存在，跳过`, { source: src.id, path: root });
  return { source: src.id, path: root, skills: scanRoot(root, src.id, src.layout) };
}

/** 聚合所有仓库与外部来源的 skill */
export function scanAll(repos: Repo[], sources: ForeignSource[]) {
  const started = Date.now();
  const bySource = new Map<string, { path: string; skills: Skill[] }>();
  for (const r of repos) {
    const res = scanRepo(r);
    bySource.set(res.source, { path: res.path, skills: res.skills });
  }
  for (const s of sources) {
    const res = scanForeign(s);
    bySource.set(res.source, { path: res.path, skills: res.skills });
  }
  const skills = [...bySource.values()].flatMap((x) => x.skills);
  log.debug('scanner', '扫描完成', { sources: bySource.size, skills: skills.length, ms: Date.now() - started });
  return { bySource, skills };
}
