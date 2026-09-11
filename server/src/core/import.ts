import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { scanDir, detectLayoutAbs } from './scanner.js';
import { expandTilde } from './agents.js';

export interface ImportResult { source: string; imported: string[]; skipped: string[] }

export interface ImportPreviewItem { source: string; layout: 'flat' | 'nested'; count: number; tags: string[]; error?: string }

/**
 * 导入前预览：逐目录识别布局、统计可导入 skill 数，并汇总解析出的标签。
 * count 与 importDirs 的 nested 扫描口径一致，保证预览 = 实际导入数。
 * tags 为该目录下所有 skill 从 SKILL.md 解析出的标签并集（顶层 tags | metadata.tags）。
 */
export function previewImportDirs(sourceDirs: string[]): ImportPreviewItem[] {
  const out: ImportPreviewItem[] = [];
  for (const sd of sourceDirs) {
    const abs = expandTilde(sd);
    if (!fs.existsSync(abs)) { out.push({ source: sd, layout: 'flat', count: 0, tags: [], error: '路径不存在' }); continue; }
    try {
      const det = detectLayoutAbs(abs);
      const found = scanDir(abs, 'probe', 'nested');
      out.push({
        source: sd, layout: det.layout, count: found.length,
        tags: [...new Set(found.flatMap((s) => s.tags))],
      });
    } catch (e) { out.push({ source: sd, layout: 'flat', count: 0, tags: [], error: String(e) }); }
  }
  return out;
}

/**
 * 批量导入：把若干外部 skill 目录(及其子级分类)一次性复制进某仓库 skills/。
 * 同名 skill 已在目标仓库中则跳过（去重），不会重复导入或生成 -2 副本。
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
      const dest = path.join(skillsRoot, s.name);
      if (fs.existsSync(dest)) { res.skipped.push(`${s.name}(已存在，去重跳过)`); continue; }
      try {
        fs.cpSync(s.dir, dest, { recursive: true });
        // 来源追溯（IM-04）
        const meta = cfg.data.skillMeta[`${s.name}@${repo.id}`] ?? { tags: [] };
        meta.origin = abs;
        cfg.data.skillMeta[`${s.name}@${repo.id}`] = meta;
        res.imported.push(s.name);
      } catch (e) { res.skipped.push(`${s.name}(${(e as Error).message})`); }
    }
    out.push(res);
  }
  cfg.save();
  return out;
}

/**
 * 收编第三方仓库（EK-03）：把「只读关联」的外部 skill 库拷贝进仓库本体并接管后续版本。
 * 收编后该来源标记 linked=false，本体由仓库持有；同名 skill 去重跳过。
 */
export function adoptSource(cfg: ConfigStore, sourceId: string, repoId?: string): { repo: string; imported: string[]; skipped: string[] } {
  const src = cfg.data.foreignSources.find((s) => s.id === sourceId);
  if (!src) throw new Error(`来源不存在: ${sourceId}`);
  const repo = cfg.data.repos.find((r) => r.id === repoId) ?? cfg.data.repos[0];
  if (!repo) throw new Error('无仓库可收编');
  const skillsRoot = repo.root ? expandTilde(repo.root) : path.join(expandTilde(repo.path), 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const found = scanDir(expandTilde(src.path), src.id, src.layout);
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const s of found) {
    const dest = path.join(skillsRoot, s.name);
    if (fs.existsSync(dest)) { skipped.push(`${s.name}(已存在，去重跳过)`); continue; }
    try {
      fs.cpSync(s.dir, dest, { recursive: true });
      const meta = cfg.data.skillMeta[`${s.name}@${repo.id}`] ?? { tags: [] };
      meta.origin = src.id;
      cfg.data.skillMeta[`${s.name}@${repo.id}`] = meta;
      imported.push(s.name);
    } catch (e) { skipped.push(`${s.name}(${(e as Error).message})`); }
  }
  src.linked = false;
  cfg.save();
  return { repo: repo.id, imported, skipped };
}
