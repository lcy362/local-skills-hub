import { execFileSync } from 'node:child_process';

/**
 * 打开系统原生目录选择器，返回所选目录的绝对路径。
 * 当前仅 macOS（通过 osascript / choose folder）；其他平台返回错误，
 * 前端应回退到手动输入。
 */
export function pickDirectory(): string {
  if (process.platform !== 'darwin') {
    throw new Error(`当前平台 ${process.platform} 原生目录选择器暂不可用，请手动输入路径`);
  }
  const out = execFileSync('osascript', [
    '-e',
    'POSIX path of (choose folder with prompt "Skills Hub — 选择目录")',
  ], { encoding: 'utf8', timeout: 120000 });
  const p = out.trim().replace(/\/$/, '');
  if (!p) throw new Error('未选择目录');
  return p;
}

/** 打开系统原生文件选择器，返回所选文件绝对路径（用于仓库外标签文件）。其余同 pickDirectory。 */
export function pickFile(): string {
  if (process.platform !== 'darwin') {
    throw new Error(`当前平台 ${process.platform} 原生文件选择器暂不可用，请手动输入路径`);
  }
  const out = execFileSync('osascript', [
    '-e',
    'POSIX path of (choose file with prompt "Skills Hub — 选择标签文件")',
  ], { encoding: 'utf8', timeout: 120000 });
  const p = out.trim();
  if (!p) throw new Error('未选择文件');
  return p;
}
