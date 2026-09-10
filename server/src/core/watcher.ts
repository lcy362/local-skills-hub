import { watch, FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { expandTilde } from './agents.js';

/**
 * 复制模式的增量同步 watcher（SY-04）。
 * PRD §3 / §8.4：watcher 是**可选项**，仅当用户显式开启（config.watchers）
 * 且存在采用「复制」策略的 agent 时才启动；全局 skill 同步默认仍是触发式。
 * 监听仓库 skills 目录；文件变更（去抖）后触发回调，由调用侧重跑同步。
 */
export class CopyWatcher {
  private watcher?: FSWatcher;
  private timer?: NodeJS.Timeout;
  private onChange?: () => void;

  /** 是否应当启用：开关打开 + 至少有一个 agent 处于复制模式 */
  static shouldRun(cfg: ConfigStore): boolean {
    if (!cfg.data.watchers) return false;
    const copyAgent = Object.values(cfg.data.agents).some((a) => a.sync === 'copy')
      || Object.values(cfg.data.agents).some((a) => Object.values(a.skillSync ?? {}).includes('copy'));
    const copyDefault = cfg.data.defaultSync === 'copy' && cfg.data.activeAgents.length > 0;
    return copyAgent || copyDefault;
  }

  start(cfg: ConfigStore, onChange: () => void): void {
    this.stop();
    if (!CopyWatcher.shouldRun(cfg)) return;
    this.onChange = onChange;
    const roots = cfg.data.repos
      .map((r) => (r.root ? expandTilde(r.root) : path.join(expandTilde(r.path), 'skills')))
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
