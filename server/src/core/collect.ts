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
  /** skill 本体目录（确认页展示「什么路径写入哪里」用） */
  dir: string;
  /** 是否已存在于目标仓库（重名将去重跳过） */
  exists: boolean;
  /** skill 本体是否为软链（区别于真实目录存储） */
  symlink: boolean;
  /** 软链解析后的真实目标（绝对路径）；悬空软链时为 readlink 原始值 */
  linkTarget?: string;
  /** 软链目标是否落在目标仓库内（如此前「接管」生成的仓库本体软链） */
  inRepo?: boolean;
}
export interface AgentCollectPreview {
  agentKey: string;
  agentName: string;
  installedDir: string;
  items: AgentCollectItem[];
}
export interface CollectResult { collected: string[]; skipped: string[] }

function skillsRootOf(repo: Repo): string {
  return repo.root ? expandTilde(repo.root) : path.join(expandTilde(repo.path), 'skills');
}

/**
 * 预览：列出所有「已安装」agent 目录内的 skill，标注是否已存在于目标仓库，
 * 并区分本体是真实目录还是软链（含指向）。仅扫描，绝不写盘、不动 agent。
 */
export function previewCollect(cfg: ConfigStore, repo: Repo): AgentCollectPreview[] {
  const root = skillsRootOf(repo);
  const out: AgentCollectPreview[] = [];
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    const items = scanDir(a.globalDir, `agent:${a.key}`, 'nested').map((s) => {
      const exists = fs.existsSync(path.join(root, s.name));
      const st = fs.lstatSync(s.dir, { throwIfNoEntry: false });
      const symlink = st?.isSymbolicLink() ?? false;
      let linkTarget: string | undefined;
      let inRepo: boolean | undefined;
      if (symlink) {
        try {
          linkTarget = fs.realpathSync(s.dir);
          // macOS 下 /tmp 是 /private/tmp 的软链，root 与 realpath 结果必须同口径比较
          const realRoot = fs.realpathSync(root);
          inRepo = linkTarget === realRoot || linkTarget.startsWith(realRoot + path.sep);
        } catch {
          // 悬空软链：realpath 失败，退回 readlink 原始值供展示
          try { linkTarget = fs.readlinkSync(s.dir); } catch { /* ignore */ }
        }
      }
      return {
        name: s.name,
        dir: s.dir,
        description: s.description,
        tags: s.tags,
        exists,
        symlink,
        linkTarget,
        inRepo,
      };
    });
    out.push({ agentKey: a.key, agentName: a.name, installedDir: a.globalDir, items });
  }
  return out;
}

/**
 * 从某个 agent 目录「收集归拢」skill 到目标仓库。
 * 仅把 skill 本体复制进仓库 skills/，绝不动 agent 里的技能列表；相同名字已存在则去重跳过，
 * 除非名字出现在 replaceNames（用户在确认页明确选择用 agent 版本覆盖仓库副本）。
 * names 为空表示收集该 agent 目录下全部未存在的 skill。
 */
export function collectAgentSkill(cfg: ConfigStore, repo: Repo, agentKey: string, names?: string[], replaceNames?: string[]): CollectResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  const res: CollectResult = { collected: [], skipped: [] };
  if (!a?.installed) { res.skipped.push(`(agent 未安装: ${agentKey})`); return res; }
  const skillsRoot = skillsRootOf(repo);
  fs.mkdirSync(skillsRoot, { recursive: true });
  const found = scanDir(a.globalDir, `agent:${a.key}`, 'nested');
  const want = names && names.length ? found.filter((s) => names.includes(s.name)) : found;
  for (const s of want) {
    const dest = path.join(skillsRoot, s.name);
    if (fs.existsSync(dest)) {
      if (replaceNames?.includes(s.name)) {
        // 防自毁：源本体与仓库副本是同一文件（如 agent 内软链指向仓库）时禁止覆盖，
        // 否则 rm 掉的正是软链指向的内容，agent 与仓库一起损坏
        let same = false;
        try { same = fs.realpathSync(s.dir) === fs.realpathSync(dest); } catch { /* ignore */ }
        if (same) { res.skipped.push(`${s.name}(源与仓库副本为同一本体，跳过覆盖)`); continue; }
        try { fs.rmSync(dest, { recursive: true, force: true }); }
        catch (e) { res.skipped.push(`${s.name}(覆盖失败: ${(e as Error).message})`); continue; }
      } else { res.skipped.push(`${s.name}(已存在，去重跳过)`); continue; }
    }
    try {
      fs.cpSync(s.dir, dest, { recursive: true });
      res.collected.push(s.name);
    } catch (e) { res.skipped.push(`${s.name}(${(e as Error).message})`); }
  }
  cfg.save();
  return res;
}