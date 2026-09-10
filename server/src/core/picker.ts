import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** 用户主动关闭选择器的最长等待时间 */
const TIMEOUT = 120_000;

/**
 * 打开系统原生目录选择器，返回所选目录的绝对路径。
 * - 用户取消 → 返回 null
 * - 当前环境无可用选择器 → 抛错，前端回退为手动输入
 *
 * 支持：macOS（osascript）、Windows（PowerShell）、Linux（zenity / kdialog）。
 */
export async function pickDirectory(title = 'Skills Hub — 选择目录'): Promise<string | null> {
  return runPicker(title, 'dir');
}

/** 打开系统原生文件选择器，返回所选文件绝对路径（用于仓库外标签文件等）。其余同 pickDirectory。 */
export async function pickFile(title = 'Skills Hub — 选择文件'): Promise<string | null> {
  return runPicker(title, 'file');
}

type Kind = 'dir' | 'file';

async function runPicker(title: string, kind: Kind): Promise<string | null> {
  switch (process.platform) {
    case 'darwin':
      return runDarwin(title, kind);
    case 'win32':
      return runWindows(title, kind);
    default:
      return runLinux(title, kind);
  }
}

/** 目录去掉结尾斜杠，保持一致的路径写法 */
function normalize(p: string): string {
  return p.trim().replace(/[\\/]+$/, '');
}

function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** child_process 抛出的错误可能带数字 code（退出码）或字符串 code（ENOENT） */
function isCanceled(e: unknown): boolean {
  const raw = e as { message?: string; stderr?: string; signal?: string; code?: string | number };
  const msg = `${raw.message ?? ''} ${raw.stderr ?? ''}`.toLowerCase();
  return (
    raw.code === 1 ||
    raw.code === -128 ||
    raw.code === '1' ||
    raw.signal === 'SIGTERM' ||
    msg.includes('user canceled') ||
    msg.includes('-128')
  );
}

function unavailable(kind: Kind, err: NodeJS.ErrnoException): Error {
  return new Error(`无法调起系统${kind === 'dir' ? '目录' : '文件'}选择器：${err.message}。请手动输入路径。`);
}

async function runDarwin(title: string, kind: Kind): Promise<string | null> {
  const verb = kind === 'dir' ? 'choose folder' : 'choose file';
  try {
    const { stdout } = await exec('osascript', ['-e', `POSIX path of (${verb} with prompt "${escapeForAppleScript(title)}")`], {
      encoding: 'utf8',
      timeout: TIMEOUT,
    });
    const out = String(stdout ?? '').trim();
    return out ? normalize(out) : null;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (isCanceled(err)) return null;
    throw unavailable(kind, err);
  }
}

function windowsScript(title: string, kind: Kind): string {
  const escaped = title.replace(/'/g, "''");
  if (kind === 'dir') {
    return [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
      `$d.Description = '${escaped}';`,
      '$d.ShowNewFolderButton = $true;',
      "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
    ].join(' ');
  }
  return [
    'Add-Type -AssemblyName System.Windows.Forms;',
    '$d = New-Object System.Windows.Forms.OpenFileDialog;',
    `$d.Title = '${escaped}';`,
    '$d.CheckFileExists = $true;',
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }",
  ].join(' ');
}

async function runWindows(title: string, kind: Kind): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsScript(title, kind)],
      { encoding: 'utf8', timeout: TIMEOUT, windowsHide: true }
    );
    const out = String(stdout ?? '').trim().split(/\r?\n/).pop()?.trim() ?? '';
    return out ? normalize(out) : null;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (isCanceled(err)) return null;
    throw unavailable(kind, err);
  }
}

/** Linux：优先 zenity，其次 kdialog；两者都没有则明确报错由前端回退手动输入 */
async function runLinux(title: string, kind: Kind): Promise<string | null> {
  const attempts: [string, string[]][] =
    kind === 'dir'
      ? [
          ['zenity', ['--file-selection', '--directory', '--title', title]],
          ['kdialog', ['--getexistingdirectory', process.cwd()]],
        ]
      : [
          ['zenity', ['--file-selection', '--title', title]],
          ['kdialog', ['--getopenfilename', process.cwd()]],
        ];

  let last: NodeJS.ErrnoException | null = null;
  for (const [bin, args] of attempts) {
    try {
      const { stdout } = await exec(bin, args, { encoding: 'utf8', timeout: TIMEOUT });
      const out = String(stdout ?? '').trim();
      return out ? normalize(out) : null;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (isCanceled(err)) return null;
      last = err;
      // 命令不存在（ENOENT）时尝试下一个
      if (err.code !== 'ENOENT') break;
    }
  }
  throw last
    ? new Error(`无法调起系统${kind === 'dir' ? '目录' : '文件'}选择器：${last.message}。请手动输入路径。`)
    : new Error('当前环境未找到可用的原生选择器（zenity / kdialog），请手动输入路径。');
}
