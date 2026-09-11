/**
 * 轻量结构化日志：级别 debug/info/warn/error，同时输出 console 与落盘。
 * 行格式（单行，便于 tail 与 issue 粘贴）：
 *   2026-09-11T10:00:00.000Z [info] [sync] msg {"k":"v"}
 * 落盘前统一脱敏：把 homedir 前缀替换为 ~，避免日志携带完整用户路径。
 * 轮转：超过阈值（默认 5MB）时 app.log → app.1.log → app.2.log，保留 3 份。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_PATH } from '../config/defaults.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = (process.env.SKILLS_HUB_LOG_LEVEL as LogLevel) || 'info';
const THRESHOLD = Number(process.env.SKILLS_HUB_LOG_MAX_MB ?? 5) * 1024 * 1024;

const LOG_DIR = path.join(path.dirname(CONFIG_PATH), 'logs');
const LOG_PATH = path.join(LOG_DIR, 'app.log');
const KEEP = 3; // 保留 app.log + app.1.log + app.2.log

/** 已写入的字节计数，用于触发轮转 */
let written = 0;

function mask(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const home = os.homedir();
  return value.includes(home) ? value.split(home).join('~') : value;
}

function maskMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = mask(v);
  return out;
}

function rotate(): void {
  if (written < THRESHOLD) return;
  // app.log → app.1.log → app.2.log，删除最旧的 app.KEEP-1.log
  const drop = path.join(LOG_DIR, `app.${KEEP - 1}.log`);
  if (fs.existsSync(drop)) fs.rmSync(drop);
  for (let i = KEEP - 2; i >= 0; i--) {
    const from = i === 0 ? LOG_PATH : path.join(LOG_DIR, `app.${i}.log`);
    const to = path.join(LOG_DIR, `app.${i + 1}.log`);
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  written = 0;
}

function write(level: LogLevel, mod: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;
  const line = `${new Date().toISOString()} [${level}] [${mod}] ${msg}${meta ? ` ${JSON.stringify(maskMeta(meta))}` : ''}\n`;
  if (level === 'debug') console.debug(line.trimEnd());
  else if (level === 'error') console.error(line.trimEnd());
  else console.log(line.trimEnd());
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotate();
    fs.appendFileSync(LOG_PATH, line, 'utf-8');
    written += Buffer.byteLength(line, 'utf-8');
  } catch { /* 日志写失败不阻塞业务 */ }
}

export const log = {
  debug: (mod: string, msg: string, meta?: Record<string, unknown>) => write('debug', mod, msg, meta),
  info: (mod: string, msg: string, meta?: Record<string, unknown>) => write('info', mod, msg, meta),
  warn: (mod: string, msg: string, meta?: Record<string, unknown>) => write('warn', mod, msg, meta),
  error: (mod: string, msg: string, meta?: Record<string, unknown>) => write('error', mod, msg, meta),
  getPath: () => LOG_PATH,
};
