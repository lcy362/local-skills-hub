# local-skills-hub — 个人 Skill 资产管理平台 PRD

> 展示名 / 品牌名：**Skills Hub**。仓库名：`local-skills-hub`（本地优先 + 集中仓库）。核心命题：让 skill 成为**个人资产**，一处沉淀、切到即用、跨 Agent 零成本迁移。
> 针对性场景：**来回切换 Agent 以使用免费 token** 时，skill 状态实时就位、无需手动搬运。

---

## 1. 背景与问题

AI 编码 Agent 生态碎片化：Claude、Cursor、Trae、OpenCode、Qoder、Windsurf、Codex、Clawdbot……各 Agent 的 skill 目录、配置格式、加载机制各不相同。个人的 skill 资产散落在各平台目录里，无法统一沉淀、无法复用、无法版本管理。

与此同时，一个现实诉求是：**用户会在多个提供免费/不同额度 token 的 Agent 之间来回切换**。切换时有两个痛点：

1. 本地已沉淀的 skill 并没有被当前正在使用的 Agent 读到（目录不同）。
2. 切换 Agent 后，之前配置好的 skill 组合（preset）无法快速、准确地"带过去"。

参考落地：

- **personal-skills-manager (pks)**：纯 bash CLI，集中仓库 `~/.local/share/pks/skills/`，15 个内置 Agent，项目级 `.skills/` 软链分发，无 preset/标签/GUI。
- **xingkongliang/skills-manager**：Tauri 桌面应用（React+TS+Rust+SQLite），支持 15+ 工具，具备 preset、标签、Global/Project/Linked Workspaces、Marketplace、多设备备份同步。

**Skills Hub 吸取二者能力，补齐 pks 缺失的 WebUI/preset/标签，并针对"活跃 Agent + preset 实时就位"做定向优化。**

---

## 2. 产品目标

1. **skill 成为个人资产**：建立可配置、可独立版本管理的非隐藏 skill 仓库，作为唯一事实源（source of truth）。
2. **跨 Agent 无缝迁移**：任意时刻切到"活跃 Agent"，仓库中的 skill 组合（preset）实时反映到该 Agent 的 skill 目录，无需手动操作。
3. **一处管理**：扫描、整合、去重、命名、打标签、按 preset/标签分发，全部收敛到一个 WebUI 完成。
4. **项目级协作**：项目内 skill 以 `.agents` 真实副本为准，符合开源规范，支持团队协作与回写仓库。

---

## 3. 非目标（本期不做）

- 不实现 Marketplace / AI 搜索（skills-manager 的 marketplace 不在本期范围，可后续接入）。
- 不做多设备云端同步/备份（skills-manager 的 Git 备份功能；仓库本身可被用户自行 git 管理）。
- 不做 skill 的语义版本冲突合并（依赖版本差异对比可后续补）。
- 不接管 Agent 的配置生成（如 AGENTS.md/CLAUDE.md 编写在项目级再做基础支持）。
- 不常驻后台 watcher 实时同步全局 skill（见 §8.4 触发式同步设计；复制模式的目录级同步可选 watched）。

---

## 4. 核心概念与术语

| 术语 | 说明 |
|------|------|
| **Skill** | 一个 skill 目录，含 `SKILL.md`（YAML 前置元数据 + Markdown）及可选附带文件/脚本。以 `name@来源` 全局唯一标识。 |
| **Skill 仓库（Repository）** | 集中存放 skill 的本体目录，**非隐藏、路径可配置**，可脱离本工具独立编辑/版本管理。可配置多个。 |
| **来源（Source）** | skill 的来源命名空间：某个仓库名、某个外部 skill 集目录名、或 `external`。用于区分重名 skill。 |
| **Agent** | 本机某个编码工具。每个 Agent 有一个（或多个）skill 目录，支持全局目录与项目级目录两种形态。 |
| **活跃 Agent** | 用户在 UI 中手动配置的"当前正在使用"的 Agent。预设/标签变更会**实时同步**到此 Agent。 |
| **Preset（预设）** | 一组 skill 的命名集合。激活→把集合内 skill 分发到目标 Agent；取消→移除。 |
| **标签（Tag）** | 给 skill 或项目打的标签，用于分组、过滤，以及"项目自动关联 skill"。 |
| **同步策略** | 每条 Agent-仓库同步关系可选 **软链（symlink）**或**复制（copy）**。软链零冗余、实时可见；复制兼容性最好、需同步机制。 |

---

## 5. 功能需求

### 5.1 Skill 仓库管理

- **SR-01 唯一事实源**：默认仓库为非隐藏目录，路径可配置（保存于配置文件中）。
- **SR-02 多仓库**：支持配置多个仓库，均为独立可 git 管理/编辑的非隐藏目录。
- **SR-03 去工具依赖**：仓库内容不使用本工具专有格式，skill 即普通 Markdown 目录，用户可用任意编辑器/工具直接修改或做版本管理。
- **SR-04 多布局支持**：仓库内默认布局为 `<repo>/skills/<source>/<skill-name>/`（扁平结构），此为标准开放格式，兼容开源社区的主流 skill 库布局（如 `skills.sh` 市场、skills-manager 社区库等）。同时支持**非标准布局**的读取，如嵌套分类式布局（`skills/<category>/<skill-name>/`，如 ume-skills），系统通过 `recursive_scan` 模式扫描深层目录中的 `SKILL.md` 来发现并纳入管理。用户可为每个外部 skill 集/仓库配置布局模式：`flat`（默认）、`nested`（递归扫描）、`auto`（自动检测）。无论何种布局，内部的 skill 都以 `SKILL.md` 文件为准。

### 5.2 Agent 管理

- **AG-01 覆盖生态**：内置支持 skills-manager 与 pks 清单的**并集**，路径映射以 skills-manager 的 `tool_adapters` 定义为准（含项目级覆盖、`recursive_scan`、`additional_scan_dirs`），并用 pks 补齐 skills-manager 未覆盖的目录（如 qoderwork、qoderworkcn、reasonix、clawdbot 等）。完整参考表见 §5.2.1。
- **AG-02 家族分组与共享目录标注**：对**家族性产品**在 UI 明确标注其归属与目录关系。包括：
  - **TRAE 家族**：国际版 `trae` → `~/.trae/skills`，中国版 `trae_cn` → `~/.trae-cn/skills`（同源，目录不同，勿混）。
  - **Qoder/千问家族**：`qoder`（`.qoder/skills`）、`qwen_code`（`.qwen/skills`）、以及 pks 侧的 `qoderwork`/`qoderworkcn`（国内/国际版），相关但目录各自独立。
  - **Claw/Clawbot 家族**（Lobster 类个人助理）：`openclaw`、`qclaw`、`easyclaw`、`autoclaw`、`workbuddy`、`hermes`——同属 concierge 架构生态，目录各自独立，标注家族名便于关联。
  - **共享目录（共享 `~/.agents/skills`）**：`cline`、`warp` 直接部署于该统一根目录；`codex`、`github_copilot`、`pi`、`deepseek_harness` 将其作为**只读发现源**（部署仍落各自目录）；`amp`、`replit` 共享 `.config/agents/skills`。UI 需对"共享同一目录"的 agent 给出角标/提示，避免重复分发或维护时误判。
- **AG-03 自定义目录**：Agent 路径不硬编码死，支持 `custom tools` 新增任意名称 + 自定义全局/项目 skill 目录（含是否 `recursive_scan`）。
- **AG-04 路径配置**：每个 Agent 的全局目录、项目级目录均可覆盖；覆盖后视为"已安装可用"，不受平台探测限制。
- **AG-05 手动覆盖**：个别 Agent 若与内置约定不符，用户可在 UI 覆盖其目录。

#### 5.2.1 Agent 内置目录参考表（以 skills-manager 为准 + pks 补齐）

| Agent key | 名称 | 全局 skill 目录 | 项目级目录 | 备注 / 家族 |
|-----------|------|----------------|-----------|------------|
| cursor | Cursor | `~/.cursor/skills` | `.cursor/skills` | — |
| claude_code | Claude Code | `~/.claude/skills` | `.claude/skills` | — |
| codex | Codex CLI | `~/.codex/skills` | `.codex/skills` | 另只读发现 `.agents/skills` |
| github_copilot | GitHub Copilot | `~/.copilot/skills` | `.copilot/skills` | 另只读发现 `.agents/skills` |
| grok | Grok | `~/.grok/skills` | `.grok/skills` | — |
| opencode | OpenCode | `~/.config/opencode/skills` | `.opencode/skills` | 全局/项目路径不同 |
| antigravity | Antigravity | `~/.gemini/antigravity/skills` | — | Gemini 系 |
| gemini_cli | Gemini CLI | `~/.gemini/skills` | — | Gemini 系 |
| amp / replit | Amp / Replit | `~/.config/agents/skills` | — | **共享 `.config/agents/skills`** |
| kilo_code | Kilo Code | `~/.kilocode/skills` | — | — |
| roo_code | Roo Code | `~/.roo/skills` | — | — |
| goose | Goose | `~/.config/goose/skills` | — | — |
| droid | Droid | `~/.factory/skills` | — | — |
| windsurf | Windsurf | `~/.codeium/windsurf/skills` | `.windsurf/skills` | pks 用 `.windsurf/skills`，以其实际存在为准 |
| trae | TRAE IDE | `~/.trae/skills` | `.trae/skills` | **TRAE 家族·国际** |
| trae_cn | TRAE CN | `~/.trae-cn/skills` | `.trae-cn/skills` | **TRAE 家族·中国**，同源自国际版 |
| cline | Cline | `~/.agents/skills` | `.agents/skills` | **部署于共享 `.agents`**，探测用 `.cline` |
| warp | Warp | `~/.agents/skills` | `.agents/skills` | **部署于共享 `.agents`** |
| omp_agent | OMP Agent | `~/.omp/agent/skills` | `.omp/skills` | 全局/项目路径不同（含 `agent` 段） |
| pi | Pi | `~/.pi/agent/skills` | `.pi/skills` | 另只读发现 `.agents/skills` |
| deepseek_harness | DeepSeek Harness | `~/.dsh/skills` | `.dsh/skills` | 另只读发现 `.agents/skills` |
| qoder | Qoder | `~/.qoder/skills` | `.qoder/skills` | **Qoder/千问家族** |
| qwen_code | Qwen Code | `~/.qwen/skills` | — | **Qoder/千问家族** |
| qoderwork / qoderworkcn | 千问工作(国际/国内) | `~/.qoderwork/skills` / `~/.qoderworkcn/skills` | 同名项目目录 | **Qoder/千问家族**（pks 补齐） |
| codebuddy | CodeBuddy | `~/.codebuddy/skills` | — | — |
| zencoder | Zencoder | `~/.zencoder/skills` | — | — |
| zcode | ZCode | `~/.zcode/skills` | `.zcode/skills` | — |
| openclaw | OpenClaw | `~/.openclaw/skills` | — | **Claw 家族**（Lobster） |
| qclaw | QClaw | `~/.qclaw/skills` | — | **Claw 家族**（Lobster） |
| easyclaw | EasyClaw | `~/.easyclaw/skills` | — | **Claw 家族**（Lobster） |
| autoclaw | AutoClaw | `~/.openclaw-autoclaw/skills` | — | **Claw 家族**（Lobster） |
| workbuddy | WorkBuddy | `~/.workbuddy/skills` | — | **Claw 家族**（Lobster） |
| hermes | Hermes Agent | `~/.hermes/skills` | — | Lobster；**`recursive_scan=true`（嵌套目录）** |
| clawdbot | Clawdbot | 见 pks | — | pks 补齐 |
| reasonix | DeepSeek Reasonix | `~/.reasonix/skills` | `.reasonix/skills` | pks 补齐 |
| teamwork | Teamwork | `~/teamwork/skills` | `teamwork/skills` | pks 补齐 |

> 其余 skills-manager 支持的 agent（kimi-code、augment、bob、command_code、continue、cortex、crush、iflow、junie、kiro、kode、mcpjam、mistral_vibe、mux、neovate、openhands、pochi、adal、deepagents、firebender 等）均遵循各自 `.xxx/skills` 约定，并入统一配置，不逐一列出。
>
> **实现约定**：内置清单以 skills-manager 为准并常驻更新，pks 补齐项做增量合并；所有路径仍可被用户覆盖（AG-04），实际生效以配置为准。

### 5.3 活跃 Agent 与实时同步（核心优化）

- **AA-01 活跃 Agent 配置（支持多个）**：UI 提供"活跃 Agent"多选器（≥1），用户手动维护一个**活跃 Agent 集合**（可记忆上次选择）；后续实时同步作用于集合内全部成员。
- **AA-02 触发式实时同步**：**不需要常驻 watcher**。当用户**操作引发 preset 激活/取消、Agent 切换、标签变更**时，同步动作在该触发点立即执行，把结果实时反映到**活跃 Agent** 的 skill 目录。
- **AA-03 非活跃 Agent 懒同步**：非活跃 Agent 不自动同步，用户手动点到某 Agent 时才刷新/再同步。
- **AA-04 切换即就位**：用户把某 Agent 加入/移出活跃集合时，即刻将该 Agent 当前应生效的 preset/标签组合同步到其目录（加入即就位、移出可回退），达到"切到即用"。

### 5.4 Preset（预设）

- **PR-01 创建/编辑/删除**：命名 preset，增删其包含的 skill。
- **PR-02 激活/取消**：激活→分发集合内 skill 到目标（默认活跃 Agent）；取消→移除。
- **PR-03 实时同步**：preset 的增删改、激活状态变化，实时同步到**活跃 Agent**；非活跃 Agent 留待手动。
- **PR-04 预设集导入**：兼容 skills-manager 的 preset 集概念，可导入既有 preset 数据。
- **PR-05 组合适用**：支持 preset 关联一组标签或一组显式 skill，二者皆可。

### 5.5 标签

- **TG-01 打标签**：给 skill 打任意标签；提供"未打标签"过滤，便于补齐。
- **TG-02 过滤浏览**：按标签/来源/skill 名过滤浏览整个资产库。
- **TG-03 项目关联**：给项目打标签，项目自动关联"相同标签"的 skill 集合（逻辑层，见 §5.6）。

### 5.6 项目级 Skill 管理

- **PJ-01 标签关联**：为项目打标签后，自动得到"该项目应配备的 skill 集合 = 打有相同标签的 skill"。**这是逻辑集合的自动派生**，与文件落地解耦。
- **PJ-02 本体目录 `.agents`**（符合开源规范）：项目内 skill **本体复制**到 `<project>/.agents/skills/`，因为项目 skill 涉及团队协作，必须有文件本体可提交 git。
- **PJ-03 其他 Agent 项目目录软链**：其余 Agent 的项目级 skill 目录，一律软链到 `.agents`，实现"一套本体、多 Agent 共享"。
- **PJ-04 分组解耦**：文件落地采用**同步动作**完成——手动触发或**定期/可选 watched 自动同步**；不随每次标签修改强制启动（分组决策与物理落地分离）。
- **PJ-05 回写仓库**：项目内修改的 skill 可回写（push）到仓库主目录；仓库主目录与 `.agents` 之间采用手动或定期同步，方向可选双向。

### 5.7 Skill 导入与初始整合

- **IM-01 扫描整合**：提供首次（及任意次）整合能力，扫描各 Agent 的全局/项目 skill 目录与各仓库，把 Agent 目录中的 skill 集中到仓库中。
- **IM-02 去重确认**：扫描发现**同名 skill**（含不同来源）时，列出候选让用户**确认保留哪个**，未被保留的归入对其他来源命名空间或丢弃。
- **IM-03 收编后软链**：整合完成后，Agent 目录不再保存 skill 本体，改为按每个 Agent 的同步策略链接到仓库（默认软链）。
- **IM-04 来源追溯**：整合时记录每个 skill 的来源（来自哪个 Agent/目录），便于回滚与追踪。

### 5.8 外部 skill 集 / 仓库导入

- **EK-01 读取异构目录**：可读取**不同层级形式**的既有 skill 集目录作为"来源"纳入管理，不要求移动本体。支持三类结构：
  - **扁平**（`skills/<skill>/SKILL.md`，主流标准，如 `skills.sh` 市场库）；
  - **嵌套分类**（`skills/<category>/<skill>/SKILL.md`，如 ume-skills / 部分 Hermes 插件目录）——用 `nested`/`recursive_scan` 递归发现；
  - **带索引清单的库**（如 ume-skills 的 `skill-store/candidate-catalog.json`）：优先读取清单做元数据，再按需定位 `SKILL.md` 本体。
- **EK-02 多仓库导入**：支持单个或**批量**添加仓库空间；可把某外部目录**一次性导入**到既有仓库目录下（落为某来源命名空间）。
- **EK-03 只读 vs 收编**：导入分两种：`只读关联`（不拷贝本体，仅引用）与 `收编`（拷贝进仓库并接管的后续版本）。

### 5.9 同步机制

- **SY-01 每关系策略**：每条（skill, Agent）同步关系可选择 软链 或 复制。
- **SY-02 默认软链**：默认软链，零冗余、即时可见；软链目标用绝对路径或在允许时相对路径。
- **SY-03 复制回退**：对不支持/不跟随软链的 Agent（或被平台周期性重建目录导致软链失效）可切换为复制。
- **SY-04 复制同步**：复制模式下，提供手动同步按钮，并可选择开启**目录级常驻 watcher** 做增量同步（此为可选、按需启用）。
- **SY-05 失败诊断**：任一同步动作失败（权限/只读/路径缺失）在 UI 给出可操作诊断与一键重试。

### 5.10 WebUI

- **UI-01 技术栈**：整体 WebUI，前端 + 后端全部 TypeScript 实现。
- **UI-02 架构**：本地 Web 服务（Node/Bun），浏览器访问；后端提供 REST/WS API，承担文件扫描、软链/复制、watcher、配置持久化。
- **UI-03 页面**：
  - **资产库（Library）**：浏览/搜索/过滤全部 skill（标签/来源/名字），打标签、查看详情（SKILL.md 预览）。
  - **Agent 工作台**：每个 Agent 一栏，展示其当前可见 skill、同步状态、同步策略开关；活跃 Agent 明确高亮。
  - **活跃 Agent 切换器**：一键切换活跃 Agent（触发 AA-04 就位同步）。
  - **Preset 管理**：预设列表、创建/激活/编辑、空间内即时生效。
  - **项目级管理**：项目列表、打标签、查看/执行同步与回写。
  - **仓库/来源管理**：多仓库、外部目录关联、批量导入、整合向导。
  - **设置**：活跃 Agent、Agent 自定义目录、仓库路径、同步策略默认值、watcher 开关。

---

## 6. 核心场景：切换 Agent 用免费 token

1. 用户已将 skill 统一沉淀到仓库，并维护好若干 preset（如 `code-review`、`weekly-report`、`react-best-practices`）。
2. UI 中把"活跃 Agent 集合"设为 `{ trae-cn, qoder }`，并激活 `code-review` preset。
3. 触发式同步立即把 preset 内 skill 以软链落到 `trae-cn`、`qoder` 各自的 skill 目录 → 两个当前在用的 Agent 立即可用。
4. 用户又切到 `qwen_code`（另一家免费 token）：
   - 把 `qwen_code` 加入活跃集合；
   - AA-04 即刻把 `code-review` preset（以及该 Agent 应生效的标签组合）同步到其目录；
   - 其余不在活跃集合的 Agent 保持现状，不被扰动。
5. 用户在任意活跃 Agent 中改了某个 skill → 回写仓库 → 切回时其他活跃 Agent 也能看到最新版本。

> 全程不常驻后台，同步均在"切换/激活/操作"这一触发点上立即完成，既满足实时就位，又避免后台进程与无谓扫描。

---

## 7. 项目级协作场景

1. 项目 `foo` 打标签 `react`。
2. 资产库中出现两个带 `react` 标签的 skill → 项目自动关联这两个 skill（逻辑层）。
3. 用户点击"同步到本项目"：本体复制到 `<foo>/.agents/skills/`，其余 Agent 项目目录软链至 `.agents`，可提交 git 供团队共享。
4. 团队成员修改 `.agents` 中 skill → 用户手动/定时 push 回仓库 → 个人资产保持更新。

---

## 8. 架构与技术选型

```
浏览器 (TS/React + Vite)
        │ HTTP/WS
        ▼
本地 Web 服务 (Bun/Node + TS)
  ├─ API 层 (REST/WS)         │  skill 管理 / preset / 标签 / agent / 项目
  ├─ 服务层                     │  扫描·整合·去重·分发
  ├─ 同步引擎 (软链/复制/watcher) │  §8.4
  └─ 配置存储 (JSON/文件)        │  仓库路径 / agent 目录 / 活跃 agent / 策略
            │
     文件系统读写 (仓库目录 · Agent 各 skill 目录 · 项目目录)
```

- **前端**：React/TS + Vite（参考两个既有项目的前端栈）。
- **后端**：Node 或 Bun + TS；负责全部文件系统副作用（扫描、软链、复制、watcher）与配置持久化。
- **配置存储**：JSON 文件（路径可配），记录仓库列表、Agent 目录、活跃 Agent、每关系同步策略、preset、标签。
- **元数据 vs 本体**：不做重 DB，skill 本体即文件；元数据（标签/preset/来源/策略）可放配置或轻量 JSON 索引。

### 8.4 同步触发模型

- **全局 skill 同步 = 触发式**（默认无 watcher）：
  - 触发点：preset 激活/修改、活跃 Agent 切换、标签变更、手动"同步"按钮。
  - 在触发点立即对该 Agent/目标执行软链或复制，实时就位。
- **复制目录级同步 = 可选 watched**：当某 Agent 选择"复制"策略时，可开启该目录的 watcher 做增量同步（仅此开启），否则用手动/按键。
- **项目 `.agents` 同步 = 手动 / 定期 / 可选 watched**。

---

## 9. 非功能需求

- **NFR-01 本机运行**：全本地，数据不出本机；网络仅用于后续可选的打开源库拉取。
- **NFR-02 兼容性**：软链在 macOS/Linux 原生支持；Windows 需软链权限提示或自动降级为复制。
- **NFR-03 无侵入**：不写任何 Agent 专有专有格式；仓库与 `.agents` 均符合开源/通用规范（SKILL.md 约定）。
- **NFR-04 可独立维护**：仓库目录本身可被 git/任意工具管理，本工具离开后资产仍可用。
- **NFR-05 幂等**：扫描、整合、去重、同步操作均可重复执行，不产生重复本体或悬空链接。
- **NFR-06 可诊断**：软链失效、复制冲突、权限问题均有可见状态与修复指引。

---

## 10. 存量分阶段落地（建议）

- **P0 · 骨架**：仓库/多来源/多 Agent 配置、资产库浏览与打标签、name@来源 标识、扫描整合（IM-01~03）。
- **P1 · 分发**：preset、活跃 Agent、触发式同步（AA-01~04、PR、SY 软链）。
- **P2 · 项目级**：项目标签关联、`.agents` 复制 + 其他 Agent 软链、回写/定期同步（PJ、SY 复制/watcher）。
- **P3 · 进阶**：外部异构目录读取、批量导入、复制同步 watcher、诊断面板（EK、SY-04/05）。

---

## 11. 主要取舍与开放项

| 取舍 | 决策 | 说明 |
|------|------|------|
| 命名 | `name@来源` 重名共存 | 允许同名多来源并存，UI 展示短名，保留开源库原样。 |
| 同步 | 软链为主 / 每关系可选复制 | 复制模式需额外同步机制（watcher/手动）。 |
| 实时性 | 触发式同步，免 watcher | 只在操作触发点执行，满足"切到即用"；复制级可另开 watcher。 |
| 存储 | 文件即本体 + 轻量元数据 | 不做重数据库，资产可脱离工具独立存在。 |
| 形态 | 本地 Web 服务 + 浏览器 | 满足 TS 全栈，天然支持文件操作与可选 watcher。 |

**开放项（进入设计阶段确认）**：Agent 并集清单的最终确切集合；`.agents/skills/` 在 `AGENTS.md`/通用规范中的落地细节；Windows 软链降级策略。