import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { scanDir } from './scanner.js';
import { expandTilde } from './agents.js';

export interface ImportResult { source: string; imported: string[]; skipped: string[] }

/**
 * 批量导入：把若干外部 skill 目录(及其子级分类)一次性复制进某仓库 skills/。
 * 同名冲突自动加后缀(如 name-2)，避免覆盖。
 */
export function importDirs(cfg: ConfigStore, sourceDirs: string[], repoId?: string): ImportResult[] {
  const repo = cfg.data.repos.find((r) => r.id === repoId) ?? cfg.data.repos[0];
  const out: ImportResult[] = [];
  for (const sd of sourceDirs) {
    const abs = expandTilde(sd);
    const res: ImportResult = { source: sd, imported: [], skipped: [] };
    if (!fs.existsSync(abs)) { res.skipped.push(`(路径不存在)`); out.push(res); continue; }
    if (!repo) { res.skipped.push('(无仓库可导入)'); out.push(res); continue; }
    const skillsRoot = path.join(expandTilde(repo.path), 'skills');
    fs.mkdirSync(skillsRoot, { recursive: true });
    const found = scanDir(abs, 'import', 'nested');
    for (const s of found) {
      let dest = path.join(skillsRoot, s.name);
      let n = 1;
      while (fs.existsSync(dest)) dest = path.join(skillsRoot, `${s.name}-${++n}`);
      try {
        fs.cpSync(s.dir, dest, { recursive: true });
        res.imported.push(s.name);
      } catch (e) { res.skipped.push(`${s.name}(${(e as Error).message})`); }
    }
    out.push(res);
  }
  cfg.save();
  return out;
}
