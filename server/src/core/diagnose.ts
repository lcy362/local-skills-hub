import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, expandTilde } from './agents.js';
import { diffSync } from './sync.js';
import { Skill } from './skill.js';
import { Candidate } from './integrate.js';
import { CONFIG_PATH } from '../config/defaults.js';

export type DiagStatus = 'ok' | 'warn' | 'error';

export type DiagDimension =
  | 'agent' | 'sync' | 'dup' | 'durability'
  | 'config' | 'repo' | 'project';

export interface DiagItem {
  key: string;
  status: DiagStatus;
  message: string;
  /** 机器可读附加负载：供前端「修复/同步」按钮使用（如 sync 的 SyncDiff） */
  detail?: unknown;
}

export interface DiagGroups {
  agent: DiagItem[];
  sync: DiagItem[];
  dup: DiagItem[];
  durability: DiagItem[];
  config: DiagItem[];
  repo: DiagItem[];
  project: DiagItem[];
}

export interface DiagSummary { total: number; ok: number; warn: number; error: number }

export interface DiagnoseResult {
  config: string;
  summary: Record<DiagDimension, DiagSummary>;
  groups: DiagGroups;
  items: DiagItem[];
}

interface Deps {
  lib: { skills: Skill[] };
  candidates: Candidate[];
  desired: Map<string, Skill>;
}

const DIMS: DiagDimension[] = ['agent', 'sync', 'dup', 'durability', 'config', 'repo', 'project'];

/** 纯只读体检，覆盖 7 维度：config/repo/project/agent/sync/durability/dup */
export function diagnose(cfg: ConfigStore, deps: Deps): DiagnoseResult {
  const groups: DiagGroups = { agent: [], sync: [], dup: [], durability: [], config: [], repo: [], project: [] };
  const items: DiagItem[] = [];

  // ---- config 配置解析 ----
  if (fs.existsSync(CONFIG_PATH)) groups.config.push({ key: 'config', status: 'ok', message: `配置已加载: ${CONFIG_PATH}` });
  else groups.config.push({ key: 'config', status: 'warn', message: '配置不存在，将用默认值' });

  // ---- repo 仓库与外部源存在性 ----
  if (cfg.data.repos.length === 0) groups.repo.push({ key: 'repos', status: 'warn', message: '未配置 skill 仓库' });
  for (const r of cfg.data.repos) {
    const home = expandTilde(r.path);
    if (!fs.existsSync(home)) {
      groups.repo.push({ key: `repo:${r.id}`, status: 'error', message: `仓库 ${r.id} 目录缺失: ${home}` });
      continue;
    }
    const p = path.join(home, 'skills');
    groups.repo.push({ key: `repo:${r.id}`, status: fs.existsSync(p) ? 'ok' : 'error', message: `仓库 ${r.id} @ ${p}` });
  }
  for (const f of cfg.data.foreignSources) {
    const home = expandTilde(f.path);
    groups.repo.push({ key: `fsrc:${f.id}`, status: fs.existsSync(home) ? 'ok' : 'error', message: `外部源 ${f.id}: ${home}` });
  }

  // ---- project 项目存在性 ----
  if (cfg.data.projects.length === 0) groups.project.push({ key: 'projects', status: 'ok', message: '未登记项目（无需校验）' });
  for (const p of cfg.data.projects) {
    const home = expandTilde(p.path);
    if (!fs.existsSync(home)) {
      groups.project.push({ key: `project:${home}`, status: 'error', message: `项目路径缺失: ${home}` });
      continue;
    }
    const ag = path.join(home, '.agents', 'skills');
    groups.project.push({ key: `project:${home}`, status: fs.existsSync(ag) ? 'ok' : 'warn', message: `项目 ${home}（已登记，未生成 .agents/skills）` });
  }

  // ---- agent 列表 ----
  const active = new Set(cfg.data.activeAgents);
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    const isActive = active.has(a.key);
    groups.agent.push({
      key: `agent:${a.key}`,
      status: isActive ? 'ok' : 'warn',
      message: `${a.name}: ${a.globalDir} (${a.sync})${isActive ? '' : ' 未设为活跃'}`,
    });
  }
  for (const k of cfg.data.activeAgents) {
    const a = listAgents(cfg.data).find((x) => x.key === k);
    if (a && !a.installed) groups.agent.push({ key: `agent:${k}`, status: 'warn', message: `活跃 agent ${k} 目录未安装` });
  }

  // ---- sync 是否已同步（只读比对） ----
  const diffs = diffSync(cfg, deps.lib.skills);
  for (const d of diffs) {
    const parts: string[] = [];
    if (d.missing.length) parts.push(`缺 ${d.missing.length}`);
    if (d.extra.length) parts.push(`多 ${d.extra.length}`);
    if (d.brokenLink.length) parts.push(`失效 ${d.brokenLink.length}`);
    const bad = parts.length > 0;
    groups.sync.push({
      key: `sync:${d.agent}`,
      status: bad ? 'warn' : 'ok',
      message: `${d.agent}: ${d.desiredNames.length} 期望${bad ? ' · ' + parts.join(' / ') : ' 已同步'}`,
      detail: d,
    });
  }
  if (diffs.length === 0) groups.sync.push({ key: 'sync:none', status: 'ok', message: '无活跃 agent，未比对' });

  // ---- durability 失效软链 ----
  let hasBroken = false;
  for (const a of listAgents(cfg.data)) {
    if (!a.installed || !active.has(a.key)) continue;
    if (!fs.existsSync(a.globalDir)) continue;
    for (const ent of fs.readdirSync(a.globalDir)) {
      const p = path.join(a.globalDir, ent);
      let lstat;
      try { lstat = fs.lstatSync(p); } catch { continue; }
      if (lstat.isSymbolicLink() && !fs.existsSync(p)) {
        hasBroken = true;
        groups.durability.push({ key: `broken:${ent}`, status: 'warn', message: `${a.name} 存在失效软链: ${ent}` });
      }
    }
  }
  if (!hasBroken) groups.durability.push({ key: 'broken', status: 'ok', message: '无失效软链' });

  // ---- dup 重复 skill（同名多来源汇总；完整交互交前端收编面板） ----
  const byName = new Map<string, Candidate[]>();
  for (const c of deps.candidates) {
    const arr = byName.get(c.name) ?? [];
    arr.push(c);
    byName.set(c.name, arr);
  }
  let dupCount = 0;
  for (const [name, arr] of byName) {
    if (arr.length <= 1) continue;
    dupCount++;
    groups.dup.push({ key: `dup:${name}`, status: 'warn', message: `${name} 有 ${arr.length} 个来源待收编`, detail: arr });
  }
  if (dupCount === 0) groups.dup.push({ key: 'dup', status: 'ok', message: '无同名多来源' });

  // ---- 扁平化 ----
  for (const d of DIMS) for (const it of groups[d]) items.push(it);

  const summary = {} as Record<DiagDimension, DiagSummary>;
  for (const d of DIMS) {
    const arr = groups[d];
    summary[d] = {
      total: arr.length,
      ok: arr.filter((x) => x.status === 'ok').length,
      warn: arr.filter((x) => x.status === 'warn').length,
      error: arr.filter((x) => x.status === 'error').length,
    };
  }

  return { config: CONFIG_PATH, summary, groups, items };
}