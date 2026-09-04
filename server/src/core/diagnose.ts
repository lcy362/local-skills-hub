import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents } from './agents.js';
import { CONFIG_PATH } from '../config/defaults.js';

export interface DiagItem { key: string; status: 'ok' | 'warn' | 'error'; message: string }

export function diagnose(cfg: ConfigStore): { config: string; items: DiagItem[] } {
  const items: DiagItem[] = [];

  // config
  if (fs.existsSync(CONFIG_PATH)) items.push({ key: 'config', status: 'ok', message: `配置已加载: ${CONFIG_PATH}` });
  else items.push({ key: 'config', status: 'warn', message: '配置不存在，将用默认值' });

  // repos
  if (cfg.data.repos.length === 0) items.push({ key: 'repos', status: 'warn', message: '未配置 skill 仓库' });
  for (const r of cfg.data.repos) {
    const p = path.join(r.path, 'skills');
    items.push({ key: `repo:${r.id}`, status: fs.existsSync(p) ? 'ok' : 'error', message: `仓库 ${r.id} @ ${p}` });
  }

  // agents
  let hasLink = false;
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    const status = cfg.data.activeAgents.includes(a.key) ? 'ok' : 'warn';
    items.push({ key: `agent:${a.key}`, status: (status as any), message: `${a.name}: ${a.globalDir} (${a.sync})`, });
    // 检查失效软链
    if (fs.existsSync(a.globalDir)) {
      for (const ent of fs.readdirSync(a.globalDir)) {
        const p = path.join(a.globalDir, ent);
        let lstat;
        try { lstat = fs.lstatSync(p); } catch { continue; }
        if (lstat.isSymbolicLink() && !fs.existsSync(p)) {
          hasLink = true;
          items.push({ key: `broken:${ent}`, status: 'warn', message: `${a.name} 存在失效软链: ${ent}` });
        }
      }
    }
  }
  if (!hasLink) items.push({ key: 'broken', status: 'ok', message: '无失效软链' });

  return { config: CONFIG_PATH, items };
}
