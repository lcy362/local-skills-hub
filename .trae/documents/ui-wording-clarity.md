# 文案可理解性梳理 — 让页面标签/按钮"自己说清楚"

## Context（背景）
用户反馈：页面里很多标签、按钮看不懂。经排查，问题主要分三类：

1. **"听起来不像术语、却说不清意思"的半中文** —— 这是核心痛点，必须让文案自解释。
   例：技能卡片上显示的「索引」「自建」「待定」；Assets(技能库)里点击标签打开的「打标签」操作；来源页「只读关联」「已收编」「hub 标签」等。
2. **真正的技术词** —— 用户认可这类难懂是"合理的"，但选择"两者兼顾"，即：能保留术语，但应补上认读说明（光标悬浮提示）。
   例：「符号链接」(symlink)、布局 `nested/flat`。
3. **未本地化的英文残留** —— 部分枚举值/分组名直接以英文原文漏给用户端，纯属遗漏，需补译文。
   例：列表行里渲染的是 `reason`/`store` 的英文键（`index`、`symlink`…）；诊断页 summary 键与分组名是 `Repos/Agents…`；Agents 卡片的 `symlink/copy`、`preset/manual`。

目标产出：一套统一、自解释、带悬浮说明的中文文案；同时共用徽标标签，消除"卡片"与"列表"显示不一致的问题。

## 工程改动（共用与基础设施）

### 1. UI 基础组件支持 tooltip —— `client/src/components/ui/Badge.tsx`
给 `Badge` 增加可选 `title?: string`，透传到渲染的 `<span>` 上（`<span title=...>`），用于徽标悬浮认读说明。

### 2. 统一徽标文案映射 —— `client/src/components/skill/SkillBadges.tsx`
已有的 `REASON_LABEL` / `STORE_LABEL` / 状态徽标作为单一文案来源，改为自解释文案并补 `title`：
- reason：`索引`→`扫描收录`（悬浮"通过扫描仓库自动发现"）；`标签`→`按标签引入`；`手动`→`手动添加`；`预设`→`预设引入`；`自建`→`自建`（悬浮"本仓库自行维护"）
- store：`符号链接`→`软链引用`（悬浮"引用仓库中的共享副本，不复制文件"）；`副本`（悬浮"仓库中保存了一份独立副本"）；`待定`→`待部署`；`自建`
- state：`残留`→`多余`（悬浮"已不需要但仍存有文件，可清理"）；`待生成`→`待部署`（悬浮"已启用但尚未落地，下次同步生效"）；`已关闭`→`已强制停用`（悬浮"被显式关闭"）；`启用/未启用/使用中`

### 3. 列表行不再显示英文枚举 —— `client/src/components/skill/SkillListRow.tsx`
当前第 33–34 行直接渲染 `item.reason` / `item.store`（英文键）。改为复用 `SkillBadges` 导出的中文映射（引入 `REASON_LABEL` / `STORE_LABEL`），与卡片视图一致。

### 4. 操作按钮文案 + 悬浮说明 —— `server/src/domain/cards.ts`（`acts()`）
- `collect` `收编到仓库` → 保留，补 title「把该技能复制进统一仓库，供各 Agent/项目共享」
- `merge` `合并保留` → 补 title「多个同名版本时，保留并合并该来源」
- `clean` `清理` → 补 title「删除这个不再需要的技能」
- `delete` `删除` title 已为「移除本地技能目录」，保留
- `noop` `待同步` title「将在下次同步时部署」，保留
- `toggle` `停用` → 补 title「停用此技能」
`SkillActions.tsx` 已透传 `title`，无需改动。

## 页面级文案改动

### 5. 技能库 `client/src/views/Library.tsx`
- 标签：`仅未打标签` → `只看未打标签的`；`按标签浏览` → `按标签筛选`
- ReposSection「收集」按钮：补 title「扫描并收录该仓库的技能」
- 仓库行副标题（`layout · root` 技术词）悬浮提示原样保留（属合理术语）
- 标签管理弹窗 footer「一致性检查」→ `检查标签一致性`；「执行」→ `应用更改`
- 导入弹窗「预览 / 开始导入」保留

### 6. 来源 `client/src/views/Sources.tsx`（外部技能库）
- 标题 `第三方 skill 库` → `第三方技能库`；副标题 `共 N 个库` → `共 N 个库`（保留）
- 两列开关字段标 `自带`/`hub` → `自带标签体系` / `统一标签体系`
- 徽标补 title：`只读关联`→「以只读方式引用，不复制技能进库」；`已收编`→「技能已复制到统一仓库」
- `自带标签可探测`/`hub 标签可探测`/`无自带标签` 补简短 title
- 布局 select `nested`/`flat` 保持（合理术语），弹窗内可不补说明，成本低可加 hint 文本

### 7. Agents `client/src/views/Agents.tsx`
- 弹窗标题 `收编 addable 技能` → `添加技能`；其中的「收编」按钮 → `添加`（agent 详情里主动作「收编」同理 → `添加`，悬浮「把该技能加入此 Agent」）
- 卡片/详情徽标 `a.sync`(symlink/copy)、`a.mode`(preset/manual) 由英文原文改为中文：`symlink→软链`、`copy→副本`、`preset→预设`、`manual→手动`
- 导航与顶栏 `Agents` 本地化：见第 10 条

### 8. Projects `client/src/views/Projects.tsx`
- 「投放 Agent」→ `部署到 Agent`；「已投放」→ `已部署`
- 「添加 / 同步」保留；「同步」补 title「重新部署该项目技能」

### 9. 诊断 `client/src/views/Health.tsx`
- 新增一份 `KEY_LABEL` 映射，把 summary 键与分组名中英文键本地化：
  `repos→仓库`、`skills→技能`、`agents→智能体`、`presets→预设`、`projects→项目`、`sources→来源`、`tags→标签`、`sync→同步`、`config→配置`，未知键原样保留（capitalize 逻辑可去掉）

### 10. 导航/顶栏标题 `client/src/App.tsx` + `client/src/components/layout/NavRail.tsx`
- 导航 `Agents` → `智能体`；`Projects` → `项目`
- 顶栏标题同步：agents→{t:'智能体', s:'Agent 技能管理'}；projects→{t:'项目', s:'项目技能关联'}

## 说明与取舍
- 一律不改变任何功能/数据结构；仅改展示文案与悬浮提示。
- 分类为"合理术语"的内容（软链、副本布局、Agent 等）保留术语、补认读说明；"不该难懂"的内容全部改写为自解释。
- 文案来源单一化：徽标文案收敛到 `SkillBadges`，卡片/列表视图共用，避免两边不一致。

## 验证
1. 构建：`cd client && npx tsc --noEmit`（若仓库有脚本，按其脚本校验）+ 后端 `cd server && npx tsc --noEmit`。
2. 本地启动前后端，逐页人工目检：
   - 技能库卡片 vs 列表：徽标文案一致、无英文键（index/symlink…）
   - 技能卡片与来源页：悬浮徽标/按钮可见认读说明
   - 来源页开关字段、Agents 弹窗、Projects「部署」、诊断页 summary/分组均显示中文
   - 导航与各页顶栏「智能体」「项目」生效