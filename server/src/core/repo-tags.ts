/**
 * 仓库标签来源：
 * - auto:         检测仓库是否自带标签载体（frontmatter tags / .claude-plugin/marketplace.json），检测到即沿用其方式；否则视为无自带（空标签）
 * - frontmatter:  从每个 skill 的 SKILL.md frontmatter tags 维护
 * - repo-file:    仓库内单独标签文件维护（默认 .claude-plugin/marketplace.json；也可由 user 指定相对路径，结构为 { skillName: [tags] }）
 * - external-file:仓库外单独标签文件维护（user 指定绝对路径，结构为 { skillName: [tags] }）
 *
 * 约定：设定了来源的仓库，标签“以所选来源为唯一基准”，读写都作用于该载体。
 */
import fs from 'fs';
import path from 'path';
import * as YAML from 'yaml';
import { Repo, TagsMode } from '../config/types';
import { parseSkillMeta, readSkill, SKILL_FILE } from './skill';

/** 仓库默认的 Claude 生态标签载体 */
const MARKETPLACE_REL = '.claude-plugin/marketplace.json';

function isJson(file: string): boolean {
  return /\.(ya?ml)$/i.test(file) ? false : /\.json$/i.test(file) || !/\.(ya?ml)$/i.test(file) && !file.includes('.');
}

/** 读取映射 { skillName: [tags] } 支持的载体 */
function readTagMap(file: string): Record<string, string[]> | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const data = isJson(file) ? JSON.parse(raw) : YAML.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(data)) out[k] = Array.isArray(v) ? v.map(String) : [];
      return out;
    }
  } catch { /* ignore */ }
  return null;
}

function writeTagMap(file: string, map: Record<string, string[]>) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = isJson(file) ? JSON.stringify(map, null, 2) : YAML.stringify(map);
  fs.writeFileSync(file, body, 'utf-8');
}

/** 从 marketplace.json 读取 skill → keywords 映射（额外收集 unknown 标签） */
function readMarketplace(file: string): Record<string, string[]> {
  if (!fs.existsSync(file)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const plugins: any[] = Array.isArray(data?.plugins) ? data.plugins : [];
    const map: Record<string, string[]> = {};
    for (const p of plugins) if (p?.name) map[p.name] = Array.isArray(p.keywords) ? p.keywords.map(String) : [];
    // 兼容顶层 { skillName: [tags] } 形式
    if (Object.keys(map).length === 0) return readTagMap(file) ?? {};
    return map;
  } catch { return readTagMap(file) ?? {}; }
}

function writeMarketplace(file: string, skillName: string, tags: string[]) {
  let data: any;
  try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { data = {}; }
  let plugins: any[] = Array.isArray(data?.plugins) ? data.plugins : [];
  const hit = plugins.find((p) => p?.name === skillName);
  if (hit) hit.keywords = tags;
  else plugins.push({ name: skillName, keywords: tags });
  data.plugins = plugins;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 该仓库的标签载体解析出的 { skillName: [tags] }（含 frontmatter 探测） */
function resolveMap(repo: Repo, name: string, dir: string): Record<string, string[]> | null {
  const m = repo.tags?.mode;
  const base = repo.root || repo.path;
  if (m === 'repo-file') {
    const f = repo.tags?.file ? (path.isAbsolute(repo.tags.file) ? repo.tags.file : path.join(repo.path, repo.tags.file)) : path.join(base, MARKETPLACE_REL);
    return readTagMap(f) ?? {};
  }
  if (m === 'external-file') {
    return repo.tags?.file ? readTagMap(repo.tags.file) ?? {} : {};
  }
  // frontmatter/auto 的 frontmatter 分支
  return { [name]: readSkill(dir)?.tags ?? [] };
}

/** auto 检测：返回该仓库采用的默认来源模式；无法判定自带标签时返回 undefined */
export function detectAutoMode(repo: Repo, maybeSkills: { name: string; dir: string }[], skillCount: number): TagsMode | undefined {
  const base = repo.root || repo.path;
  if (repo.tags?.file) return 'repo-file';
  if (fs.existsSync(path.join(base, MARKETPLACE_REL))) return 'repo-file';
  if (skillCount > 0 && maybeSkills.some((s) => (readSkill(s.dir)?.tags ?? []).length > 0)) return 'frontmatter';
  return undefined;
}

/** 按仓库来源读取某个 skill 的标签（以所选来源为唯一基准） */
export function readTags(repo: Repo, name: string, dir: string): string[] {
  const m = repo.tags?.mode ?? 'auto';
  if (m === 'auto') {
    const found = detectAutoMode(repo, [{ name, dir }], 1);
    if (found == null) return [];
    if (found === 'repo-file') {
      const base = repo.root || repo.path;
      return readMarketplace(path.join(base, MARKETPLACE_REL))[name] ?? [];
    }
    return readSkill(dir)?.tags ?? [];
  }
  if (m === 'frontmatter') return readSkill(dir)?.tags ?? [];
  return (resolveMap(repo, name, dir) ?? {})[name] ?? [];
}

/** 把标签写回所选来源（frontmatter / 仓库内 / 仓库外载体）；frontmatter 写回失败返回 false */
export function writeTags(repo: Repo, name: string, dir: string, tags: string[]): boolean {
  const m = repo.tags?.mode ?? 'auto';
  const resolved = (m === 'auto') ? detectAutoMode(repo, [{ name, dir }], 1) : m;
  if (resolved == null) return false;
  if (resolved === 'frontmatter') return writeFrontmatterTags(path.join(dir, SKILL_FILE), tags);
  const base = repo.root || repo.path;
  if (resolved === 'repo-file') {
    const f = repo.tags?.file ? (path.isAbsolute(repo.tags.file) ? repo.tags.file : path.join(repo.path, repo.tags.file)) : path.join(base, MARKETPLACE_REL);
    if (repo.tags?.file || path.basename(f) !== 'marketplace.json') {
      const map = readTagMap(f) ?? {}; map[name] = tags; writeTagMap(f, map);
    } else {
      writeMarketplace(f, name, tags);
    }
    return true;
  }
  if (resolved === 'external-file') {
    if (!repo.tags?.file) return false;
    const map = readTagMap(repo.tags.file) ?? {}; map[name] = tags; writeTagMap(repo.tags.file, map);
    return true;
  }
  return false;
}

/** 更新 SKILL.md frontmatter 的 tags（顶层 tags，保留其他字段与正文） */
function writeFrontmatterTags(file: string, tags: string[]): boolean {
  if (!fs.existsSync(file)) return false;
  try {
    const md = fs.readFileSync(file, 'utf-8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
    if (!m) return false;
    const y = YAML.parse(m[1]) ?? {};
    y.tags = tags;
    const body = md.slice(m[0].length);
    fs.writeFileSync(file, `---\n${YAML.stringify(y).trimRight()}\n---\n${body}`, 'utf-8');
    return true;
  } catch { return false; }
}