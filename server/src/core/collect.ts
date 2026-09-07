import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Repo } from '../config/types.js';
import { scanDir } from './scanner.js';
import { listAgents, expandTilde } from './agents.js';

export interface AgentCollectItem {
  name: string;
  description?: string;
  tags: string[];
  /** 是否已存在于目标仓库（重名将去重跳过） */
  exists: boolean;
}
export interface AgentCollectPreview {
  agentKey: string;
  agentName: string;
  installedDir: string;
  items: AgentCollectItem[];
}
export interface CollectResult { collected: string[]; skipped: string[] }

function skillsRootOf(repo: Repo): string {
  return path.join(expandTilde(repo.path), 'skills');
}

/**
 * 预览：列出所有「已安装」agent 目录内的 skill，并标注在目标仓库中是否已存在。
 * 仅扫描，绝不写盘、不动 agent。
 */
export function previewCollect(cfg: ConfigStore, repo: Repo): AgentCollectPreview[] {
  const root = skillsRootOf(repo);
  const out: AgentCollectPreview[] = [];
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    const items = scanDir(a.globalDir, `agent:${a.key}`, 'nested').map((s) => ({
      name: s.name,
      description: s.description,
      tags: s.tags,
      exists: fs.existsSync(path.join(root, s.name)),
    }));
    out.push({ agentKey: a.key, agentName: a.name, installedDir: a.globalDir, items });
  }
  return out;
}

/**
 * 从某个 agent 目录「收集归拢」skill 到目标仓库。
 * 仅把 skill 本体复制进仓库 skills/，绝不动 agent 里的技能列表；相同名字已存在则去重跳过。
 * names 为空表示收集该 agent 目录下全部未存在的 skill。
 */
export function collectAgentSkill(cfg: ConfigStore, repo: Repo, agentKey: string, names?: string[]): CollectResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  const res: CollectResult = { collected: [], skipped: [] };
  if (!a?.installed) { res.skipped.push(`(agent 未安装: ${agentKey})`); return res; }
  const skillsRoot = skillsRootOf(repo);
  fs.mkdirSync(skillsRoot, { recursive: true });
  const found = scanDir(a.globalDir, `agent:${a.key}`, 'nested');
  const want = names && names.length ? found.filter((s) => names.includes(s.name)) : found;
  for (const s of want) {
    const dest = path.join(skillsRoot, s.name);
    if (fs.existsSync(dest)) { res.skipped.push(`${s.name}(已存在，去重跳过)`); continue; }
    try {
      fs.cpSync(s.dir, dest, { recursive: true });
      res.collected.push(s.name);
    } catch (e) { res.skipped.push(`${s.name}(${(e as Error).message})`); }
  }
  cfg.save();
  return res;
}