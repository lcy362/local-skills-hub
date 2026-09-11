import express from 'express';
import { ConfigStore } from './infra/config-store.js';
import { makeRouter } from './api/routes.js';
import { CONFIG_PATH } from './config/defaults.js';
import { CopyWatcher } from './core/watcher.js';
import { scanAll } from './core/scanner.js';
import { syncActive } from './core/sync.js';
import { log } from './infra/logger.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
const cfg = new ConfigStore();

// 定时/自动同步入口（reason 标识触发来源，便于日志排查）
function resync(reason: string = 'manual') {
  const lib = scanAll(cfg.data.repos, cfg.data.foreignSources);
  try {
    return syncActive(cfg, lib.skills, undefined, reason);
  } catch (e) {
    log.error('sync', `同步异常: ${(e as Error).message}`, { reason });
    return [];
  }
}
// 供自动化任务触发的句柄（可通过环境变量约定，或后续注册任务模块）
export { resync };

const watcher = new CopyWatcher();
const onChange = () => resync('watcher');

app.use('/api', makeRouter(cfg, {
  // 结构性变更（新增/删除仓库、导入 skill、收编、改 preset/标签/活跃集）后自动同步活跃 agent，无需点「立即同步」；
  // watcher 仅在用户显式开启且存在复制模式 agent 时才会真正启动（PRD §8.4）。
  onChanged: () => { resync('route'); watcher.start(cfg, onChange); },
  onConfigChanged: () => watcher.start(cfg, onChange),
}));

// 兜底错误处理：express 4 只捕获同步 throw，异步错误仍需各路由 try/catch
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('http', '未处理的请求异常', { message });
  res.status(500).json({ error: message });
});

// 启动时也需判断开关，默认关闭
watcher.start(cfg, onChange);

app.listen(PORT, () => {
  log.info('server', `服务已启动`, {
    port: PORT,
    config: CONFIG_PATH,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    env: process.env.NODE_ENV ?? 'development',
  });
  console.log(`[skills-hub] server http://localhost:${PORT}`);
  console.log(`[skills-hub] config  ${CONFIG_PATH}`);
  console.log(`[skills-hub] logs    ${log.getPath()}`);
});
