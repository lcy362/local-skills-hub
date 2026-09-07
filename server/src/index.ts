import express from 'express';
import { ConfigStore } from './config/store.js';
import { makeRouter } from './api/routes.js';
import { CONFIG_PATH } from './config/defaults.js';
import { CopyWatcher } from './core/watcher.js';
import { scanAll } from './core/scanner.js';
import { syncActive } from './core/sync.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
const cfg = new ConfigStore();

// 定时/自动同步入口
function resync() {
  const lib = scanAll(cfg.data.repos, cfg.data.foreignSources);
  return syncActive(cfg, lib.skills);
}
// 供自动化任务触发的句柄（可通过环境变量约定，或后续注册任务模块）
export { resync };

const watcher = new CopyWatcher();
const onChange = () => resync();

app.use('/api', makeRouter(cfg, {
  // 结构性变更（新增/删除仓库、导入 skill、收编、改 preset/标签/活跃集）后自动同步活跃 agent，无需点「立即同步」；
  // 同时重建 watcher 以纳入变化后的仓库 roots，保证后续文件级改动也能被监听。
  onChanged: () => { resync(); watcher.start(cfg, onChange); },
}));
watcher.start(cfg, onChange);

app.listen(PORT, () => {
  console.log(`[skills-hub] server http://localhost:${PORT}`);
  console.log(`[skills-hub] config  ${CONFIG_PATH}`);
});
