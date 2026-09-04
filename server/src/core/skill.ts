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
  /** 是否软链（在 agent 目录中为链接占位） */
  link?: boolean;
}

export function parseSkillMeta(md: string): { name?: string; description?: string; version?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return {};
  try {
    const y = YAML.parse(m[1]) ?? {};
    return {
      name: typeof y.name === 'string' ? y.name : undefined,
      description: typeof y.description === 'string' ? y.description : undefined,
      version: typeof y.version === 'string' ? y.version : undefined,
    };
  } catch {
    return {};
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
  };
}

export function hasSkill(dir: string): boolean {
  return fs.existsSync(path.join(dir, SKILL_FILE));
}
