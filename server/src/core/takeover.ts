import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, expandTilde } from './agents.js';
import { symlinkSkill } from './sync.js';

export interface TakeoverResult {
  agentKey: string;
  name: string;
  linked: boolean;
  reason?: string;
  /** true=已是软链目标或重复调用时；false=需要用户显式 confirm 后才能执行 */
  needConfirm?: boolean;
  backupDir?: string;
}

/**
 * 接管：把「agent 目录里的源 skill」替换为指向「仓库内同名副本」的软链。
 * - 语义：收集=复制入库（不动源）；接管=把源改为软链，agent 实时读到副本的迭代。
 * - 安全：仅当仓库副本已存在且源目录存在时执行；先备份源为隐藏 `.original-<name>`；软链不删除数据。
 * - 需显式 confirm（不可逆语义：源将被替换为软链），确认前返回 needConfirm。
 */
export function takeover(cfg: ConfigStore, agentKey: string, name: string, repoId?: string, confirm?: boolean): TakeoverResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  if (!a?.installed) return { agentKey, name, linked: false, reason: `agent 未安装: ${agentKey}` };
  const repo = repoId ? cfg.data.repos.find((r) => r.id === repoId) : undefined;
  if (repoId && !repo) return { agentKey, name, linked: false, reason: `repo 不存在: ${repoId}` };

  const skillsRoot = path.join(expandTilde(repo?.path ?? a.globalDir), 'skills');
  const target = path.join(skillsRoot, name); // 仓库内副本
  const src = path.join(a.globalDir, name);   // agent 目录源
  if (!fs.existsSync(target)) return { agentKey, name, linked: false, reason: `仓库副本 ${name} 不存在，请先收集入库` };
  if (!fs.existsSync(src)) return { agentKey, name, linked: false, reason: `agent 目录 ${name} 不存在` };

  // 已是指向该副本的软链 → 幂等成功
  try {
    if (fs.lstatSync(src).isSymbolicLink()) {
      const real = fs.realpathSync(src);
      if (real === fs.realpathSync(target)) return { agentKey, name, linked: true, needConfirm: false };
    }
  } catch { /* ignore */ }

  if (!confirm) return { agentKey, name, linked: false, needConfirm: true, reason: '接管会把 agent 源替换为软链（原目录将改名备份），请确认' };

  const backup = path.join(a.globalDir, `.original-${name}`);
  // 备份源为非软链的真实目录
  try {
    if (!fs.lstatSync(src).isSymbolicLink() && !fs.existsSync(backup)) {
      fs.renameSync(src, backup);
    }
  } catch (e) { return { agentKey, name, linked: false, reason: `备份源失败: ${(e as Error).message}` }; }

  symlinkSkill(src, target);
  cfg.save();
  return { agentKey, name, linked: true, needConfirm: false, backupDir: fs.existsSync(backup) ? backup : undefined };
}