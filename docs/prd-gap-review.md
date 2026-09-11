# Skills Hub — PRD 对齐结果

> 基准 `PRD.md` + `docs/prd/00-overview.md` 约束 C1–C17。
> 状态：已构建通过（`npm run build`），服务端 `smoke.ts` 全绿，HTTP 主链路已实测。

---

## 一、补齐的功能（PRD 有、原来没有）

| PRD 项 | 实现 | 位置 |
|---|---|---|
| **AA-01 / AA-04 活跃 Agent 多选器** | 「设置」页活跃集合列表（搜索/只看已安装），加入即同步就位；Agent 详情页也可「设为活跃」 | `views/Settings.tsx`、`views/Agents.tsx` |
| **PR-02 / PR-03 preset 激活→分发** | `desiredContext` 默认改回 `preset` 模式，激活 preset 即进期望集；Agent 可关联指定 preset | `core/sync.ts`、`views/Agents.tsx` |
| **PR-05 preset 关联标签** | preset.tags 与显式技能取并集；编辑弹窗可填标签 | `core/sync.ts`、`views/Presets.tsx` |
| **TG-03 / PJ-01 项目打标签** | 新建项目可填标签，详情页可编辑，标签命中 skill 自动进项目 | `views/Projects.tsx` |
| **UI-03 设置页** | 活跃集合 / 默认同步策略 / watcher 开关 / 自定义 Agent | `views/Settings.tsx`、`/settings` |
| **AG-03 自定义 Agent** | 新增任意名称 + 全局/项目目录 + 递归开关 | `/agents/custom`、`config.customAgents` |
| **AG-04 / AG-05 目录覆盖** | Agent 详情页「目录」弹窗可覆盖全局/项目目录 | `views/Agents.tsx` |
| **SY-01 每关系同步策略** | Agent 级默认 + 按技能单独覆盖（skillSync） | `core/sync.ts`、`views/Agents.tsx` |
| **SY-05 同步失败可见** | 同步结果 failed/warnings 直接展示并 toast | `views/Agents.tsx` |
| **NFR-02 Windows 降级** | 软链抛错自动降级为复制并写入 warnings | `core/sync.ts` |
| **PJ-05 回写仓库** | 项目详情「回写仓库」，可指定目标仓库 | `core/projects.ts`、`/projects/:id/push` |
| **UI-03 SKILL.md 预览** | 技能详情弹窗：元数据 + 标签编辑 + 来源追溯 + 正文预览 | `views/Library.tsx`、`/skills/:id/content` |
| **IM-01 整合向导** | 已移除：同名多来源的保留/收编由「归集」确认页（仓库版本入候选）覆盖 | — |
| **IM-04 来源追溯** | 收编/导入时写入 `skillMeta.origin`，详情展示 | `core/integrate.ts`、`core/import.ts` |
| **EK-01 带索引清单的库** | 支持 `candidate-catalog.json` 等清单定位本体 | `core/scanner.ts` |
| **EK-02 批量导入** | 导入弹窗改多行目录 | `views/Library.tsx` |
| **EK-03 收编第三方仓库** | 已由仓库级导入取代：自有仓库「导入」指向第三方库目录即完成拷贝（第三方库无需先登记） | `core/import.ts`、`/import`（repoId） |
| **SR-04 auto 布局** | 登记默认 auto，扫描期自动检测 | `core/scanner.ts` |
| **AG-01 清单补齐** | 补 `antigravity`/`omp_agent`/`pi`/`deepseek_harness`/`zencoder`/`zcode`/`autoclaw` + 20 个长尾，共 55 个 | `core/agents.ts` |
| **AG-02 家族/共享目录标注** | 卡片与详情页展示家族、共享目录、亦被谁读取 | `core/agents.ts`、`views/Agents.tsx` |

内置 agent key 已对齐 PRD 命名（`claude_code`/`trae_cn`/`qwen_code`/`kilo_code`/`roo_code`/`gemini_cli`），旧配置在 `ConfigStore` 加载时自动迁移。

---

## 二、移除/收敛的（脱离 PRD）

| 项 | 处理 |
|---|---|
| **A1 常驻 watcher 默认开启** | 改为 `config.watchers` 开关，**默认关闭**；且仅在存在复制模式 agent 时才真正启动。全局 skill 同步回到触发式（PRD §3/§8.4/C10） |
| **A2 INDEX.md 第二事实源** | `projectedSkills` 不再读回 INDEX.md；期望集纯由 config 推导。INDEX.md 降级为纯产物 |
| **B1 首启强制引导** | 删除 `Onboarding` 视图与 `onboarded` 状态；其能力并入「整合向导」「归集」「登记库」 |
| **B4 takeover 隐藏备份** | 保留为 API（IM-03），但不进主流程 |
| **孤儿 API** | `takeover`/`tags-migrate`/`repos/:id` PUT 等保留但不再假装被用；`collect`、`import/preview`、`filesystem/pick`、`filesystem/pick-file` 已修好并接线（见 §五） |

---

## 三、修复的 Bug

1. 「收集」按钮必返 400 却被吞 → 改为归集弹窗，显式选择 Agent 并传 `agentKeys`。
2. 导入预览用 GET 调 POST 路由必 404 → `/import/preview` 同时支持 GET/POST。
3. `smoke.ts` 中 `diagnose(store)` 少传 deps → 补齐并新增回写、preset 标签两组用例。

---

## 四、仍未做（本轮未纳入）

- **PJ-04 定期同步**：手动 + 可选 watcher 已具备，「定期」需调度器，未引入。
- **UI-02 WebSocket**：仍为纯 REST（PRD 中 WS 为可选）。
- **PR-04 预设集导入**：兼容 skills-manager preset 集的导入未实现。

---

## 五、UI 一致性与交互补齐（UI-03）

| 项 | 实现 | 位置 |
|---|---|---|
| **浏览/搜索/过滤（标签/来源/名字）** | 搜索、来源、标签、未打标签四类条件收敛进同一条筛选栏；条件生效时出现「重置」；标签组默认折叠，有选中时自动常驻展开 | `components/common/FilterBar.tsx`、`views/Library.tsx` |
| **列表展示统一（卡片优先）** | 技能 / 预设 / 项目 / Agent / 仓库 / 来源 / 整合候选共用 `EntityList`，默认卡片、可切列表，偏好全局记忆 | `components/common/EntityList.tsx` |
| **工具条控件对齐** | 新增 `--control-h` token，输入框/下拉/开关/按钮统一高度；右侧筛选簇设为不可压缩、作为整体换行 | `styles/tokens.css`、`styles/app.css` |
| **系统文件选择器** | 登记库路径、导入目录、新建项目路径、Agent 全局目录、自定义 Agent 目录均可一键调起原生选择器（相对路径除外） | `components/ui/PathField.tsx`、`core/picker.ts` |
| **字段语义修正** | 技能库是资产池、无启用/停用语义，`SkillCardView.state` 改为可选，缺省时不渲染状态徽标（此前恒显「启用」） | `components/skill/adapters.ts`、`SkillBadges.tsx` |
| **页面状态可刷新** | 一级页面、二级详情、筛选条件全部随 hash 地址持久化 | `state/router.ts` |

配套约定见 `docs/key-conventions.md` §七（前端约定类 F1–F4）。
