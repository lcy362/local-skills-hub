# 按 PRD 严格补齐全部功能 实施方案

## Context（为什么做）

项目已按 PRD 重构且流程基本可用，但经过沙箱实测 + 双 agent 审计发现 11 处 PRD 要求未落地。用户要求「所有功能严格按 prd 实现」，本次补齐全部差距。原则：**复用现有 core 函数与 ui/skill 统一组件，前端不造新样式，后端 routes 保持薄、逻辑进 core/domain。**

## 现有可复用资产（勿重复造轮子）

- 后端 `core/`：`scanDir/scanAll`、`integrate.previewGroups/collectCandidates/applyAdoption`、`sync.symlinkSkill/syncActive/diffSync`、`repo-tags.readTags/writeTags/detectAutoMode`(`auto|frontmatter|repo-file|external-file`)、`projects.deployedAgents`、`diagnose`。
- 前端 `components/ui/`：`Button/Modal/Badge/Tag/Chip/Segment/FieldInput/FieldSelect/FieldTextarea/Switch/Toast/EmptyState/Spinner/PageHeader/LoadingBoundary`。`components/skill/`：`SkillCard/SkillList/SkillListRow/SkillBadges/SkillActions/adapters`（统一按 `SkillCardView` 契约）。`api/types.ts` 已含 `SkillCardView/MergeCandidate/MergeGroup/SourceView.tagSystems`。
- 无路由库，tab 由组件状态驱动。

---

## 里程碑 A：后端契约与接管（先行，前端依赖它的端点）

**A1 契约扩展** `server/src/config/types.ts`
- `Repo.tags` 无新增字段（沿用既有 mode）；`ForeignSource.tagSystems?: { upstream?: boolean; hub?: boolean }`（已有）。

**A2 接管（差距1，核心）** 新增 `server/src/core/takeover.ts`
- 复用 `integrate.collectCandidates` 定位 agent 候选、`sync.symlinkSkill`、`repo-tags`。
- `takeover(cfg, agentKey, name, repoId)`：校验 repo 已含同名副本且源目录存在 → 把 agent 原目录改名为隐藏备份 `.original-<name>` → 用 `symlinkSkill` 建软链 `agentDir/<name> → repo/skills/<name>`（软链使 agent 实时读到副本迭代）。返回 `{ linked, backupDir }`。
- 安全：仅当副本已存在；内容不一致才警告需确认；操作需显式确认参数 `confirm:true`（不可逆语义，原目录保留为备份即未删数据）。区别于收编：收编只 cp 入 repo；接管替换源并留备份。
- `routes.ts` 新增 `POST /repos/:id/takeover`，body `{ agentKey, name, confirm }`，失败 400。

**A3 第三方库两套标签体系（差距2）** 补 `routes.ts` /sources
- `POST /sources`：合并 body 的 `tagSystems`({upstream,hub}) 落库。
- `GET /sources`：每项附带 `detected.tagSystems`（用 `detectAutoMode` 探测 upstream=frontmatter、hub=repo-file 是否可探测）。
- `PUT /sources/:id/tags`：独立启停 `{upstream,hub}`；状态读数沿用 `/state` 现有 readTags（按 source.tags 载体）。

---

## 里程碑 B：标签载体 + 标签元操作

**B1 自有→SKILL.md frontmatter（差距3，无数据丢失）** `server/src/core/repo-tags.ts`
- 新增 `migrateTagsToFrontmatter(cfg, repo)`：仅当 `repo.tags` 未配置时执行——用 `readTags`（fallback skillMeta）取当前 tags，调用 `writeTags(mode frontmatter)` 写回 SKILL.md，删除 `cfg.data.skillMeta` 中该 repo 的记录，最后 `repo.tags={mode:'frontmatter'}` 并 save。
- `routes.ts` 新增 `POST /repos/:id/tags-migrate` 触发；新建自有仓库(importAsRepo/addProject 无关)在后端默认复用该逻辑：打标签即落 frontmatter。

**B2 标签元操作（差距4）** 新增 `server/src/core/tag-ops.ts`
- `GET /tags/consistency`：校验 frontmatter vs skillMeta、外部载体缺失、孤儿标签，返回清单。
- `POST /tags/rename` `{oldTag,newTag}`、`POST /tags/merge` `{target,absorb}`：遍历仓库标签载体 + skillMeta 替换并写回，返回变更数。

---

## 里程碑 C：前端视图

**C1 Onboarding 合并/接管确认（差距6）**
- `views/Onboarding.tsx`：归集完成后调用 `/integrate/preview`，新增 `components/onboarding/MergePanel.tsx`（复用 `SkillListRow`/`Modal`/`Badge`）。按组显示 `MergeCandidate`（版本/描述/来源），选保留 → `POST /skills/merge`；接管 → 调用 A2 端点；跳过 → ignore。

**C2 第三方库登记（差距7）** 新建 `views/Sources.tsx`（挂 App tab）
- 登记：路径 + 布局(`FieldSelect`) + `Switch` 双标签体系启停（调 A3 的 PUT /sources/:id/tags）+ 自动探测结果显示；列表复用 `Badge`/`Modal`/`Button`。

**C3 Library 多维过滤（差距8）** `views/Library.tsx`
- `FieldInput` 文本搜索(名称/描述)、`FieldSelect` 按来源筛选、Chip「未打标签」筛选、`Segment` 列表/卡片切换；作用于现有 `shown` 之前。标签编辑逻辑保留。

**C4 标签元操作 UI（差距9）** Library 加「标签管理」`Button` → `Modal`：重命名/合并标签 + 一致性清单（调 B2 端点）+ `Toast`。

**C5 项目投放 Agent（差距10）** `views/Projects.tsx` 项目详情加 `agents` 区块：`GET /agents` 勾选 → `PUT /projects/:id/agents`（后端已存在）；用 `Switch`/`Badge`。

---

## 里程碑 D：Health 就地修复 + 验证

**D1 就地修复（差距5）** 新增 `server/src/core/fix.ts` + `routes.ts POST /fix`：
- 按 `diagnose` 的 key/detail 分发：missing → `diffSync` 喂 `syncActive`；失效软链 → `unlink` 重部署；目录缺失 → `mkdir`；孤儿/多余 → 移除。`views/Health.tsx` 每行按 `DiagItem` 渲染「修复」按钮。

**D2 验证**
- 沙箱：临时 `config.json`（temp repo + foreign source + project + 假 agent 目录），另起端口。
- 后端断言：A2 软链 `ls -l` 与备份目录存在；A3 `GET /sources` 含 tagSystems + detected；B1 迁移后 `skillMeta` 清空而 SKILL.md 有 tags；B2 rename/merge 后 readTags 一致；D1 `/fix` 后 diagnose 无漂移。
- 前端：`cd client && npm run build` 通过；`npm run dev` 手工走查 Onboarding→Sources→Library→Projects→Health 各动作逐一符合 PRD。

## 关键改动文件
- 后端：`server/src/api/routes.ts`、`server/src/config/types.ts`、`server/src/core/repo-tags.ts`；新增 `core/takeover.ts`、`core/tag-ops.ts`、`core/fix.ts`。
- 前端：`client/src/views/Onboarding.tsx`、`Library.tsx`、`Projects.tsx`（截图后逐视图自检）、`Health.tsx`；新增 `views/Sources.tsx`、`components/onboarding/MergePanel.tsx`；`App.tsx` 挂 tab。