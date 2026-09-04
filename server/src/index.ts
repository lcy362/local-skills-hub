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

app.use('/api', makeRouter(cfg));

// 定时/自动同步入口
function resync() {
  const lib = scanAll(cfg.data.repos, cfg.data.foreignSources);
  return syncActive(cfg, lib.skills);
}
// 供自动化任务触发的句柄（可通过环境变量约定，或后续注册任务模块）
export { resync };

const watcher = new CopyWatcher();
watcher.start(cfg, () => { resync(); });

app.listen(PORT, () => {
  console.log(`[skills-hub] server http://localhost:${PORT}`);
  console.log(`[skills-hub] config  ${CONFIG_PATH}`);
});
