# 合并「去重收编」+「状态体检」为新「体检中心」模块

## Context

当前左侧导航有 `integrate`（去重收编）与 `diag`（状态体检）两个独立 tab，功能分散、用户难以分辨。
目标：合并成一个「体检中心」(health) tab，做整全面体检，覆盖：agent 列表、重复 skill、是否已同步、失效软链、仓库与项目存在性、标签来源可用性、配置解析。原「去重收编」的选择保留项 → 应用收编交互并入体检页；「是否已同步」只读比对给告警，并提供「修复/同步」按钮一键同步。

用户已确认：导航命名「体检中心」；收编并入体检页；同步检测=只读比对+警告+一键修复；补充维度=失效软链/仓库与项目存在性/标签来源可用性/配置解析（全部采用）。

## 后端

### 1. `server/src/core/sync.ts` — 新增只读 `diffSync`
- 新类型 `SyncDiff { agent; desiredNames; missing; extra; brokenLink }`。
- 纯只读函数 `diffSync(cfg, allSkills): SyncDiff[]`：对每个**活跃 agent**，`computeDesired` 得期望 `skill.name` 集合，与 `resolveGlobalDir` 实际部署集合比对。
- 绝不调用 `deployAgent`/`symlinkSkill`/`copySkill`（无副作用）。`extra` 口径与 deploy 一致：真实目录不算可自动清除项（前端注明「仅软链项可一键清除」）。

### 2. `server/src/core/diagnose.ts` — 改造为分组输出
- 新增 `DiagStatus`/`DiagDimension`(8个)/`DiagItem.detail?`/`DiagGroups`/`DiagnoseResult`。
- `diagnose(cfg, deps: { lib; candidates; desired })` 纯只读，按 8 维度产出：
  - config / repo / project / agent / durability（沿用并细化）
  - **sync**：用 `diffSync` 产出，发散项 warn，`detail` 带 `SyncDiff`
  - **dup**：用 `deps.candidates` 按 name 分组，多来源组 warn 汇总（完整交互交给前端 dedupe 面板）
  - **tags**：按 `repo.tags` 检查标签载体文件存在性
- 返回含 `config`、`summary`、`groups`、`items`（扁平）。

### 3. `server/src/api/routes.ts`
- 增强 `GET /diagnose`：组装 deps 调新 `diagnose`。
- 新增 `GET /sync/status`：返回 `diffSync(...)`（只读）。
- 保留 `POST /sync`、`POST /integrate/preview`、`POST /integrate`。
- 补 import：`computeDesired`/`diffSync`、`collectCandidates`。

## 前端

### 4. `client/src/api.ts` 新增类型
`DiagStatus`/`DiagItem(detail?)`/`SyncDiff`/`DiagDimension`/`DiagSummary`/`DiagnoseResult`。

### 5. 新建 `client/src/HealthView.tsx`
- 新组件 `HealthView({ onMsg, refreshGlobal })`，UI 复用现有 CSS 类（panel/row/badge/tag/diagrow/dot/igroup/empty/msgbar）。
- 结构：概览盘（标题+config hint+「刷新」+「立即同步」）→ 诊断报告区（分区渲染 8 维度，dot+`status-*`；注意 error 态复用 `.status-bad`，因 CSS 无 `.status-error`）→ 同步告警区（有 warn 时给「修复/同步」主按钮，调 `POST /sync` 后重载报告）→ 重复 skill 收编区（迁移原 IntegrateView 单选→应用逻辑）。
- 加载/错误/空态齐备。

### 6. `client/src/App.tsx`
- `Tab` 类型移除 `'integrate' | 'diag'`，新增 `'health'`。
- `NAV` 合并为一项「体检中心」；`tabDesc` 加 `case 'health'`。
- `content` 用 `<HealthView onMsg={setMsg} refreshGlobal={reload} />` 替换两个旧视图。
- 删除 `IntegrateView`、`DiagView` 函数体；import `HealthView` 与新类型。

## 涉及文件
- server: `core/sync.ts`(改) · `core/diagnose.ts`(改) · `api/routes.ts`(改)
- client: `api.ts`(改) · `HealthView.tsx`(新建) · `App.tsx`(改)

## 验证
1. server `tsc` 通过；`GET /api/sync/status` 只读（curl，git status 无部署副作用）。
2. `GET /api/diagnose` 返回 8 分组 + summary；人为造 missing/extra/broken/项目缺失/标签文件缺失，确认各分组状态与 message。
3. client `tsc` 通过；浏览器导航只剩「体检中心」。
4. 闭环：点「修复/同步」后 `/diagnose` sync 归 ok；重复收编面板选保留→应用→ dup 汇总消失。
5. 回归：library/agents/presets/projects 切换不受影响。