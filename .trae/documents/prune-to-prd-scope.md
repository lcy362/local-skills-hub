# 功能收敛到 PRD 范围 — 移除自加、含义不明的功能点

## Context（背景）
用户要求：按 PRD 的用户流程重新梳理功能，**只保留 PRD 中明确要求的功能**，把回话过程中**自行添加、含义不明**的功能点去掉。
此前已就位的大量"半技术、自解释不清"的标签/开关/状态即属于这类超纲实现。删除需精确，避免误伤 PRD 必需能力（收编、预设组合、项目关联、同步诊断等）。

**判定原则**：以 PRD 编号需求为准。实现中能对应到编号的保留；查不到编号、且早期被用户质疑"看不懂/没必要"的功能一律剪除。

## 保留（有 PRD 编号，不动）
- 仓库管理 多布局 `flat/nested/auto` + `recursive_scan` → SR-01~04
- 多 Agent 内置清单/目录覆盖 → AG-01~05
- 活跃 Agent 集合、触发式同步、切换即就位 → AA-01~04
- 预设 增删改/激活/导入/标签或显式组合 → PR-01~05
- 打标签、未打标签过滤、按标签/来源/名字过滤 → TG-01~02
- 项目标签关联逻辑集合、`.agents` 本体 + 其他 Agent 软链、手动/定期同步、回写 → PJ-01~05
- 扫描整合、去重确认（merge）、收编、来源追溯 → IM-01~04、EK-02/03
- 同步策略 软链/复制、失败诊断+一键重试 → SY-01~05、NFR-06
- 外部来源登记、`只读 vs 收编`、异构目录读取（含 flat/nested） → EK-01/03
- 资产库/Agent 工作台/Preset/项目/仓库来源 /诊断等页面 → UI-03、P3

## 删除清单（自加、含义不明、超出 PRD）

### 1) 两套标签体系 —— tagSystems(marketplace/hub) 全部移除
**依据**：PRD §3 明确"不实现 Marketplace"；§5.5 只要求打标签/过滤（TG-01/02）。
- `ForeignSource.tagSystems`（`upstream/hub`）字段：`server/src/config/types.ts`
- `foreignSkillTags`（hub/upstream 读取 `marketplace.json`）：`server/src/api/routes.ts`
- Sources 页"自带标签体系 / 统一标签体系"开关及"可识别"探测徽标：`client/src/views/Sources.tsx`
- 标签载体高级系统 `auto/frontmatter/repo-file/external-file` + `MARKETPLACE_REL`：`server/src/core/repo-tags.ts` → 删除该模块
- `/state`、/sources/* 里所有 tagSystems 分支：`server/src/api/routes.ts`
- **替换为**：标签统一读 `SKILL.md` frontmatter `tags` + 用户配置 `skillMeta` 覆盖（完全满足 TG-01/02），删除 marketplace/carrier 分支。

### 2) 标签高级操作 —— 重命名/合并/一致性检查 移除
**依据**：PRD TG 仅打标签(01)、过滤(02)；无重命名/合并/一致性。
- `server/src/core/tag-ops.ts`：删除 `renameTag`/`mergeTag`/`tagConsistency`，仅保留 `setTags`
- 路由 `/tags/rename` `/tags/merge` `/tags/consistency`：`server/src/api/routes.ts`
- 技能库"标签管理"弹窗/入口（含一致性检查、重命名、合并、应用更改）：`client/src/views/Library.tsx`（保留点击技能→编辑标签，即 TG-01）

### 3) 技能卡片过度状态机 —— 移除展示性细分与非 PRD 操作
**依据**：PRD 状态只区分 wanted/不 wanted、存在/缺失、软链/复制（AA/PR/SY）；无"残留/强制停用/待部署"细分。
- 移除非线性动作：`clean`(清理残留)、`enable`/`disable`(强制停用)、`off-override`：`server/src/core/cards.ts`、`server/src/core/agents.ts`(仅销毁 reactive 展示分支)、`client/src/components/skill/SkillActions.tsx`
- 保留：`collect`(收编 IM)、`merge`(去重 IM-02)、`delete`、`toggle`(停用=取消分发)
- 徽标收敛到 PRD 概念：来源(`name@来源`)、同步策略（软链/复制）、启用/停用；删除 `残留/多余/强制停用/待生成/未收编` 及 reason `tag/index`、store `own/pending` 等展示：`client/src/components/skill/SkillBadges.tsx`、`SkillListRow.tsx`

### 4) 诊断页裁剪到 NFR-06 —— 移除标签载体维度
**依据**：NFR-06 只要求"软链失效/复制冲突/权限"可见诊断；P3 为诊断面板。
- `server/src/core/diagnose.ts`：删除 `tags` 维度（标签载体/一致性检查）及 `MARKETPLACE_REL`；保留 `config/repo/project/agent/sync/durability(失效软链)/dup(待收编去重)`(分别映射 NFR-06/SY-05/IM-02)
- `client/src/views/Health.tsx`：移除 `tags` 分组展示（保留其它）

## 关键文件
- 服务端：`server/src/api/routes.ts`、`server/src/core/repo-tags.ts`(删)、`server/src/core/tag-ops.ts`、`server/src/core/diagnose.ts`、`server/src/core/cards.ts`、`server/src/core/agents.ts`(局部)、`server/src/config/types.ts`
- 前端：`client/src/views/Sources.tsx`、`client/src/views/Library.tsx`、`client/src/views/Health.tsx`、`client/src/components/skill/SkillBadges.tsx`、`client/src/components/skill/SkillActions.tsx`、`client/src/components/skill/SkillListRow.tsx`

## 验证
1. `cd server && npx tsc --noEmit`、`cd client && npx tsc --noEmit`
2. 启动本地服务逐页目检：
   - 来源页：无"标签体系"开关，仍可登记/删除/只读vs收编/layout
   - 技能库：可打标签、来源/名字/标签筛选、导入、收编；无"标签管理/一致性/重命名/合并"入口
   - 卡片徽标：仅 来源+软链/复制+启用状态，无残留/强制停用/待部署
   - 诊断页：无"标签载体/一致性"项，软链失效/同步失败/路径缺失仍在
3. 端到端收编流程仍可用（IM-01~03）；预设激活→分发→取消仍可用（PR/AA）