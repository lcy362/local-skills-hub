# Skills Hub 彻底重构技术方案

> 依据 PRD（`docs/prd/*`）与约束（`docs/key-conventions.md`）**从零重写前后端**，不受现有代码干扰，按 PRD 流程重新实现所有功能。
> 决策：全栈重写 · 自研 Design Token · **零新增运行时依赖**。

---

## Context（为什么做）

现有前端是 69KB 的 monolith `App.tsx`，技能展示在 资产库/Agent/项目 三处**实现重复、体验不一**；后端 `routes.ts` 也是 monolith，且未覆盖 PRD 的新流程（首启建库向导、第三方库两套标签、收集/接管两阶段）。本次按 PRD 从零重构，重点：**通用组件抽取 + 各模块一致体验 + 现代优雅 UI**。

---

## 目录结构（目标）

```
client/src/
  main.tsx  App.tsx（shell + 路由分派）
  api/            types.ts（数据契约）、client.ts（fetch 封装）
  state/          store.ts（轻量状态：reload 回调 + 当前 tab/选中项）
  styles/         tokens.css（Design Token）、base.css、ui 层样式
  components/
    ui/           通用基元：Button / Modal / Badge / Tag / Chip / Segment
                  Field(Input/Select/Textarea) / Switch / Toast / EmptyState / Spinner
    skill/        统一技能展示：SkillCard / SkillList / SkillBadge / SkillActions（核心一致性）
    layout/        AppShell / NavRail / Topbar / PageHeader
  views/          Onboarding / Library / Agents / AgentDetail
                  Presets / Projects / ProjectDetail / Health（每页一个目录）
server/src/
  index.ts        Express 装配
  api/            routes.ts（按资源分文件）、error.ts（统一错误）、validate.ts
  domain/         纯业务：agents / presets / projects / tags / scan / sync / collect / merge
  infra/          config-store.ts / fs-helpers.ts（读写、软链、布局识别）
```

---

## 一、后端：按 PRD 流程重写

### 1.1 分层
- **infra**：ConfigStore（读写 `~/.skills-hub/config`，schema）、FS 助手（扫布局、建软链/复制、读 frontmatter）。
- **domain**：纯逻辑，不碰 HTTP。每个 PRD 流程一个模块。
- **api**：薄路由，只做参数解析 + 调 domain + 回包；统一 `{ data }` / `{ error }` 信封；`validate` 校验。

### 1.2 关键领域模型与流程（对照 PRD）
| PRD 流程 | 后端模块 | 要点 |
|---|---|---|
| 流程一 首启建库 | `domain/onboarding.ts` | 向导状态机：问现状 → A(导入)/B(归集)；A 实时纳入不复制；B collect + 接管两阶段 |
| 收集/接管 | `domain/collect.ts` | **收集=复制、接管=软链替换，两个独立操作**；同名走 merge confirm |
| 合并确认 | `domain/merge.ts` | 返回同名候选（版本/描述/来源），由客户端仲裁后选保留 |
| 流程二 第三方库 | `domain/sources.ts` | 登记第三方库；**两套标签体系**：探测仓库自带(frontmatter)与 hub(仓库内/外文件)，按可探测自动显示/隐藏、可分别启用 |
| 流程三 资产管理 | `domain/tags.ts presets.ts agents.ts` | 标签载体按来源选择；preset 成员=name@source 引用；Agent 期望=基准 ∪ explicitOn − explicitOff；activeAgents 只同步活跃 |
| 流程四 项目协作 | `domain/projects.ts` | `.agents/skills` 复制本体 + 项目级软链；投放以目录结构为事实 |
| 流程五 治理体检 | `domain/diagnose.ts` | 七类检查 + 标签一致性检查；期望 vs 物理 diff |

### 1.3 数据契约
复用 skill 统一形状 `SkillView { id(name@source), name, source, dir, description, version, tags }`；新增状态视图：`SkillCardView { skill, reason, store, state, offOverride, actions[] }`，让前端**一份组件渲染三种上下文**。

---

## 二、前端：Design Token + 统一组件

### 2.1 Design Token（`styles/tokens.css`，零依赖）
CSS 变量，语义化：
- **Color**：`--c-bg / --c-surface / --c-surface-2`（层级）、`--c-ink-1/2/3`（文字）、`--c-accent`（主色+悬停/按压）、`--c-good / --c-warn / --c-bad / --c-info`、`--c-line`；**支持浅/深两套**（`[data-theme]` 切换）。
- **Space**：`--sp-1..--sp-7`（4px 基准）。
- **Radius**：`--r-sm/md/lg/full`。
- **Shadow**：`--sh-1/2/3`（浮层/卡片/弹窗）。
- **Type**：`--fs-12..--fs-24`、字重、行高。
- **Motion**：`--ease / --dur`（150/250ms）。

### 2.2 通用 UI 基元（`components/ui/`）
`Button`（primary/ghost/danger/sm + loading）、`Modal`（无障碍 focus 管理）、`Badge`（语义 tone）、`Tag`（可删）、`Chip`（筛选）、`Segment`（列表/卡片切换）、`Field/Select/Textarea`、`Switch`、`Toast`（顶部消息，统一替代 msgbar）、`EmptyState`、`Spinner`。整套统一样式入口，行为一致。

### 2.3 统一技能展示 —— 核心一致性（`components/skill/`）
把资产库/Agent/项目三处的技能展示收敛为**一套组件 + 一组适配适配**：
- `SkillCard`（卡片）/ `SkillList`（列表行）：统一的 标题+来源+描述+标签+徽标+footer 骨架。
- `SkillBadge`：reason/store/state 三种徽标统一。
- `SkillActions`：按 `SkillCardView.actions[]` 渲染按钮（开关/收编/合并/删除/清理/启停），不再各自手写。
- **适配层**：Library→只读+标签；Agent→开关+软链状态+收编/合并/删除；Project→开关+复制状态+清理。三者消费同一 `SkillCardView`，**视觉与交互一致**。

### 2.4 Shell 与视图
- `AppShell` + `NavRail`（五个入口，含计数）+ `Topbar`（刷新/立即生效/全局 toast）+ `PageHeader`。
- 轻量状态：`store.ts`（当前 tab、选中项、reload 总线），不引入路由库，用组件状态驱动。
- 视图：`Onboarding`（首启向导，检测无 repos 时引导）、`Library`、`Agents`+`AgentDetail`、`Presets`、`Projects`+`ProjectDetail`、`Health`。每页复用 `ui/*` + `skill/*`。

---

## 三、实施步骤（里程碑）

1. **M0 骨架**：目录结构、`styles/tokens.css`、`api/types.ts`、`state/store.ts`、`App` shell + NavRail/Topbar + 空视图。
2. **M1 后端 domain/infra + api**：config-store、扫描、collect/merge、sources、tags/presets/agents、projects、diagnose；补 `/onboarding`、`/sources` 两套标签、`/skills/merge` 等新端点。
3. **M2 通用组件 + 三处技能展示统一**：`ui/*` 全套，`skill/*` 收敛，代理/项目复用。
4. **M3 视图落地**：Library → Agents/AgentDetail → Presets → Projects/ProjectDetail → Health，逐页接入 `skill/*`。
5. **M4 首启向导 + 收尾**：Onboarding 向导态，空/加载/错误态补齐，深浅主题。

---

## 四、验证方式

- `cd server && npm run build`（若配置实验性 TS）或 `npm run dev` 确认可启动；`client` 用 `vite build` 验证类型与构建。
- 端到端手工流程：首启向导 → 建库/归集 → 打标签 → preset → 投 Agent → 项目同步 → 体检中心，逐流程核对 PRD 步骤。
- 一致性检查：三处技能展示视觉/交互截图对比一致。
- 完整性：用 `diagnose` 对账期望 vs 物理，无漂移。

---

## 风险与注意

- **零依赖约束**：UI 库、路由、CSS 框架均自研，工作量集中在组件基建，前期投入高但对后续统一性回报大。
- **前端 monolith 拆分**：逐视图从 `App.tsx` 迁移时保持功能不回归，用 `store.ts` 提供全局 reload 保证跨视图一致。
- **完整擦除现有代码**：以 PRD 为准重写，允许丢弃旧实现未对齐处。