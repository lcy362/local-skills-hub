import { watch, FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { expandTilde } from './agents.js';

/**
 * 复制模式的增量同步 watcher（P2）。
 * 监听所有仓库的 skills 目录；文件变更(去抖)后触发回调，由调用侧重跑同步。
 * 启动后常驻。仅当存在可观察源时生效。
 */
export class CopyWatcher {
  private watcher?: FSWatcher;
  private timer?: NodeJS.Timeout;
  private onChange?: () => void;

  start(cfg: ConfigStore, onChange: () => void): void {
    this.stop();
    this.onChange = onChange;
    const roots = cfg.data.repos
      .map((r) => path.join(expandTilde(r.path), 'skills'))
      .filter((p) => fs.existsSync(p));
    if (roots.length === 0) return;
    this.watcher = watch(roots, { ignoreInitial: true, depth: 3, awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 } });
    const debounce = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.onChange?.(), 800);
    };
    this.watcher.on('all', debounce);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.watcher?.close().catch(() => {});
    this.watcher = undefined;
  }
}
