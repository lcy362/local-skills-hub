/**
 * 前端轻量日志：console + 内存环形缓冲（500 条）+ localStorage 持久化，
 * 供设置页「复制诊断信息」把最近事件随问题上报给维护者。
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const RING_MAX = 500;
const LS_KEY = 'skills-hub.log.v1';
const LS_LIMIT = 50 * 1024; // 50KB，超出截断保留尾部

interface Entry {
  ts: string;
  level: Level;
  mod: string;
  msg: string;
  meta?: Record<string, unknown>;
}

const ring: Entry[] = [];

function mask(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // 用户目录前缀替换为 ~，避免日志粘贴到 issue 时泄露本机路径
  const home = typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '';
  return home && value.includes(home) ? value.split(home).join('~') : value;
}

function push(entry: Entry): void {
  ring.push(entry);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  try {
    const tail = ring.slice(-100);
    let text = tail.map(format).join('\n');
    if (text.length > LS_LIMIT) text = text.slice(-LS_LIMIT);
    localStorage.setItem(LS_KEY, text);
  } catch { /* localStorage 不可用（隐私模式等）时仅保留内存 */ }
}

function format(e: Entry): string {
  return `${e.ts} [${e.level}] [${e.mod}] ${e.msg}${e.meta ? ` ${JSON.stringify(e.meta)}` : ''}`;
}

function write(level: Level, mod: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: Entry = {
    ts: new Date().toISOString(),
    level,
    mod,
    msg,
    meta: meta ? Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, mask(v)])) : undefined,
  };
  const line = format(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);
  push(entry);
}

export const log = {
  debug: (mod: string, msg: string, meta?: Record<string, unknown>) => write('debug', mod, msg, meta),
  info: (mod: string, msg: string, meta?: Record<string, unknown>) => write('info', mod, msg, meta),
  warn: (mod: string, msg: string, meta?: Record<string, unknown>) => write('warn', mod, msg, meta),
  error: (mod: string, msg: string, meta?: Record<string, unknown>) => write('error', mod, msg, meta),
  /** 最近 N 条（默认 200），供「复制诊断信息」使用 */
  tail: (n = 200): string[] => ring.slice(-n).map(format),
  clear: () => {
    ring.length = 0;
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  },
};
