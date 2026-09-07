import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const SKILL_FILE = 'SKILL.md';

export interface Skill {
  /** name@来源 唯一标识 */
  id: string;
  name: string;
  source: string;
  /** skill 目录绝对路径 */
  dir: string;
  description?: string;
  version?: string;
  /** 从 SKILL.md frontmatter 解析出的标签（顶层 tags | metadata.tags，去重） */
  tags: string[];
  /** 是否软链（在 agent 目录中为链接占位） */
  link?: boolean;
}

/** 归一化 frontmatter 里的 tags 值：兼容数组 [a,b] 与逗号分隔字符串 "a, b" */
export function normalizeTags(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;，]/) : [];
  return [...new Set(arr.map((t) => String(t).trim()).filter(Boolean))];
}

/**
 * 解析 SKILL.md frontmatter。tags 兼容两种开源写法：
 * - 顶层 tags: [a, b]（社区主流，BCGov/agent-zero/intent 等）
 * - metadata.tags: [a, b]（agentskills.io 官方合规路径）
 * 两者合并去重，顶层优先。
 */
export function parseSkillMeta(md: string): { name?: string; description?: string; version?: string; tags: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return { tags: [] };
  try {
    const y = YAML.parse(m[1]) ?? {};
    const meta = typeof y.metadata === 'object' && y.metadata !== null ? y.metadata : {};
    return {
      name: typeof y.name === 'string' ? y.name : undefined,
      description: typeof y.description === 'string' ? y.description : undefined,
      version: typeof y.version === 'string' ? y.version : undefined,
      tags: [...normalizeTags(y.tags), ...normalizeTags(meta.tags)],
    };
  } catch {
    return { tags: [] };
  }
}

export function readSkill(dir: string): Skill | undefined {
  const skillmd = path.join(dir, SKILL_FILE);
  if (!fs.existsSync(skillmd)) return undefined;
  const raw = fs.readFileSync(skillmd, 'utf-8');
  const meta = parseSkillMeta(raw);
  return {
    id: '',
    name: meta.name || path.basename(dir),
    source: '',
    dir,
    description: meta.description,
    version: meta.version,
    tags: meta.tags,
  };
}

export function hasSkill(dir: string): boolean {
  return fs.existsSync(path.join(dir, SKILL_FILE));
}
