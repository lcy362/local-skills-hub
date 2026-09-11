# 全链路日志与日志导出

## Context

本工具目前几乎没有任何日志：server 端只有启动两行 console.log，client 端零日志、无全局错误监听。排查问题只能靠猜测。本次为**所有关键环节**增加结构化日志（落盘 + console），并在设置页提供「复制诊断信息 + 下载日志」，为开源后用户把日志粘贴到 GitHub issue 报问题做准备。

**用户已确认**：上报形态为「一键复制诊断信息（markdown）+ 下载日志文件」，不做远端直传、不做诊断压缩包。

**风格约束**：不引入第三方日志库（server 仅 express/chokidar/yaml，client 仅 react），延续项目克制的自研风格。UI 文案与注释用中文。

## 一、Server 端日志基础设施

**新建 `server/src/infra/logger.ts`**（Node ESM，从 `../config/defaults.js` 引 CONFIG_PATH，defaults 无循环依赖）：

- API 形状：
  ```ts
  log.debug(mod, msg, meta?) / log.info / log.warn / log.error  // 同形
  log.getPath(): string   // app.log 绝对路径（/api/logs 用）
  log.flush(): void       // 测试/退出前落盘（appendFileSync 本身即同步，保留以备用）
  ```
- 行格式（单行，便于 tail 与 issue 粘贴）：`2026-09-11T10:00:00.000Z [info] [sync] msg {"k":"v"}`
- 同时写 console 与 `fs.appendFileSync` 到 `~/.skills-hub/logs/app.log`（`path.join(path.dirname(CONFIG_PATH), 'logs')`）。
- **脱敏**：meta 落盘前统一 `mask()`，把 homedir 前缀替换为 `~`。
- **轮转**：字节计数超阈值（默认 5MB，env `SKILLS_HUB_LOG_MAX_MB` 覆盖）时 `app.log → app.1.log → app.2.log` 依次 rename、删最旧、重建；保留 3 份。

## 二、Server 关键环节打点

| 文件 | 打点内容 |
|---|---|
| `server/src/index.ts` | 启动 info（port、CONFIG_PATH、node 版本、platform）；resync() 触发结果摘要；**error middleware**（4 参 `(err,req,res,next)`，挂 `/api` router 之后、listen 之前，兜底同步 throw，返回 500 并记日志） |
| `server/src/config/store.ts` | load：warn 配置缺失/JSON 解析失败（现被静默吞掉）、schemaVersion 迁移；save 加 try/catch，error 写失败原因（保留抛错） |
| `server/src/core/scanner.ts` | scanAll/scanDir：info 每 repo 扫描技能数+耗时；warn 目录不存在/读失败跳过 |
| `server/src/core/sync.ts` | syncActive：info 触发原因（给 syncActive 加可选参 `reason?`，调用方传 'route'/'watcher'/'manual'，向后兼容）；deployAgent：info 每 agent created/removed 数、warn failed 各项 reason、软链降级复制 |
| `server/src/core/watcher.ts` | start/stop：info 是否启用及原因、监听 roots；debug 合并去抖后的事件路径 |
| `server/src/api/routes.ts` | 请求日志中间件（`express.json` 之后）：info `method path status 耗时ms` + `bodyKeys`（只记字段名数组不记值）；各写路由（import/collect/takeover/merge/sync/fix/tags-migrate/presets）成功数 info、失败在现有 catch 里补一行 log.error |
| `server/src/core/diagnose.ts` | /diagnose：info summary 各分组 error 数 |

## 三、日志 API（routes.ts 内新增）

- `GET /api/logs?tail=N`（默认 200，上限 1000）→ `{ path, size, lines: string[], version }`（version 读 `server/package.json`，tsconfig 已开 resolveJsonModule）。返回已脱敏内容。
- `GET /api/logs/download` → `res.download(app.log 路径, 'skills-hub.log')`（express 4 原生）。

## 四、Client 端日志

- **新建 `client/src/log/logger.ts`**：console + 内存环形缓冲（500 条）+ localStorage 持久化（key `skills-hub.log.v1`，截断 50KB），API 形状 `log.info/mod/error(mod,msg,meta?)`。
- `client/src/main.tsx`：挂 `window.onerror` 与 `unhandledrejection` → log.error。
- `client/src/api/types.ts` 的 `api()`：在 `!res.ok` 分支与 fetch 网络异常处 `log.error('api', method+' '+path, { status, message })` 后原样 rethrow。
- 关键写操作（各页面现有 catch 处）可选补一行 log，以 API 层自动记日志为主，避免大改业务页。

## 五、设置页日志区块（client/src/views/Settings.tsx 新增 panel）

- 数据流：`useAsync(() => api('/api/logs'))`，刷新按钮 `reload()`。
- UI：日志文件路径（mono）；最近 ~200 行预览（pre-wrap + 等宽，max-height 滚动）；「下载日志」按钮（fetch → blob → `<a download>`）；「复制诊断信息」按钮——拼 markdown（标题、版本、platform、node 版本、配置路径、日志 tail）`navigator.clipboard.writeText` 后 toast「已复制，可在 GitHub issue 中粘贴」。

## 六、验证

1. `npm run dev`（server）+ client dev；操作：登记仓库、同步、开 watcher、导入、诊断修复 → `tail -f ~/.skills-hub/logs/app.log` 观察各环节日志。
2. 异常路径：`SKILLS_HUB_CONFIG` 指向坏 JSON 启动 → store warn 落盘；删 agent 目录后同步 → failed reason 落盘；未处理同步 throw → error middleware 500。
3. `curl 'localhost:8787/api/logs?tail=5'` 与 `curl -OJ localhost:8787/api/logs/download`。
4. `SKILLS_HUB_LOG_MAX_MB=0.001` 触发轮转，验证 app.1.log 生成与 3 份保留。
5. client：控制台 `throw new Error` → localStorage 有记录；设置页复制诊断信息 → 粘贴为 markdown；下载日志落盘。

## 修改/新建文件清单

- 新建：`server/src/infra/logger.ts`、`client/src/log/logger.ts`
- 修改：`server/src/index.ts`、`server/src/config/store.ts`、`server/src/core/scanner.ts`、`server/src/core/sync.ts`、`server/src/core/watcher.ts`、`server/src/core/diagnose.ts`、`server/src/api/routes.ts`、`client/src/main.tsx`、`client/src/api/types.ts`、`client/src/views/Settings.tsx`
