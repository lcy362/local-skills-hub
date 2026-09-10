import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** 展开 ~ 为用户主目录 */
export function expandTilde(p: string): string {
  return p.replace(/^~(?=$|[\\/])/, os.homedir());
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function isDirectory(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

export function exists(p: string): boolean {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

/** 建立软链（目标已存在则卸载后重建） */
export function symlinkDir(target: string, link: string): void {
  fs.rmSync(link, { recursive: true, force: true });
  ensureDir(path.dirname(link));
  fs.symlinkSync(target, link, 'dir');
}

/** 复制目录树 */
export function copyDir(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

/** 读取目录下是否含 SKILL.md 的根目录 */
export function readDirNames(p: string): string[] {
  try { return fs.readdirSync(p, { withFileTypes: true }).map((d) => d.name); }
  catch { return []; }
}

/** 递归列出所有子目录 */
export function walkDirs(p: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readDirNames(dir)) {
      const child = path.join(dir, name);
      if (isDirectory(child)) { out.push(child); walk(child); }
    }
  };
  walk(p);
  return out;
}