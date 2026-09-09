# Skills Hub 数据管理与数据流向示意图（v1 草案）

> 目的：把「让 skill 成为个人资产」的理念翻译成一张可讨论的数据模型 + 数据流图，对齐现状代码后，作为后续功能完善的基准。
> 现状对照范围：`PRD.md`、`README.md`、`server/src`（config/core/api 全部）、`client/src/App.tsx`。

---

## 0. 设计原则（理念 → 数据原则）

| 理念 | 落到数据上的原则 |
|------|----------------|
| 文件即本体 | skill 本体只存在于文件系统；config 只存「引用 + 管理信息」，永不复制本体 |
| 不被工具绑定 | 元数据不写私有格式：标签优先写 SKILL.md frontmatter / marketplace.json 等生态共识位置 |
| 唯一事实源 | **期望集（desired）由配置推导**；各 Agent / 项目目录只是期望集的「物理投影」 |
| 降低碎片化 | 同名 skill 以 `name` 归一化去重，一个目录名只对应一份投影 |
| 触发式同步 | 数据流全部由用户操作触发（激活/切换/修改/手动），非常驻（复制 watcher 可选） |

**一句话模型**：

```
配置(config.json) ──推导──▶ 期望集(desired) ──投影──▶ 物理目录(软链/复制)
     ▲                                                        │
     └──────────── 体检/诊断 diffSync 对账 ◀───────────────────┘
```

---

## 1. 数据资产盘点：两个世界

### 1.1 文件系统世界（本体，唯一可信副本）

| 位置 | 内容 | 谁写它 |
|------|------|--------|
| `<repo>/skills/<source?>/<name>/` | 仓库 skill 本体（flat / nested 布局） | 导入 import、收编 collect、用户手工/git |
| 外部来源目录（foreignSources） | 第三方 skill 本体（只读关联，不拷贝） | 上游/用户 |
| `~/.<agent>/skills/` | Agent 全局技能目录：**软链 / 复制 / 自带本体** | 同步引擎 sync |
| `<project>/.agents/skills/` | 项目技能本体（**复制**，可提交 git） | 项目同步 syncProject |
| `<project>/.<agent>/skills/` | Agent 项目级目录：**软链 → .agents** | 项目同步 syncProject |
| 标签载体 | SKILL.md frontmatter / 仓库内文件 / 仓库外文件 | PATCH /skills/:id 写回 |

### 1.2 config.json 世界（管理元数据，`~/.skills-hub/config.json`）

| 字段 | 语义 | 指向 |
|------|------|------|
| `repos[]` | 仓库注册表：id / path / layout / root / **tags 载体配置** | 文件目录 |
| `foreignSources[]` | 外部来源：id / path / layout / linked(只读 or 收编) | 文件目录 |
| `agents{}` | 每 Agent 覆盖：globalDir / sync(软链\|复制) / mode(preset\|manual) / preset / **explicitOn[] / explicitOff[]** | — |
| `activeAgents[]` | 活跃 Agent 集合（实时同步作用域） | agents key |
| `presets[]` | 套餐：skills[](name@来源) + tags[] + active | skill id |
| `skillMeta{}` | 兼容模式的本地标签（仓库未配 tags 载体时） | skill id |
| `projects[]` | 项目：path / tags[] / explicitOn[] / explicitOff[] | 文件目录 |
| `defaultSync` | 默认同步策略 | — |

> 关键点：config 里**没有 skill 本体的注册表**——资产库列表每次由 `scanAll` 实时扫描文件系统得出。文件系统本身就是资产清单。

---

## 2. 数据实体关系图

```mermaid
erDiagram
    REPO ||--o{ SKILL_DIR : "扫描发现 (scanAll)"
    FOREIGN_SOURCE ||--o{ SKILL_DIR : "只读关联扫描"
    SKILL_DIR {
        string id "name@source"
        string name "目录名=全局去重键"
        string tags "来自标签载体"
    }
    REPO ||--o| REPO_TAGS : "标签载体配置"
    REPO_TAGS }o--|| TAG_CARRIER : "frontmatter / 仓库内文件 / 仓库外文件"

    PRESET }o--o{ SKILL_DIR : "skills[] (name@source)"
    AGENT_OVERRIDE }o--o{ SKILL_DIR : "explicitOn[] / explicitOff[]"
    AGENT_OVERRIDE ||--o| PRESET : "mode=preset 时的基准套餐"
    ACTIVE_AGENTS }o--|| AGENT_OVERRIDE : "实时同步作用域"

    PROJECT ||--o{ PROJECT_TAGS : "tags[]"
    PROJECT_TAGS }o--o{ SKILL_DIR : "标签命中=默认期望集"
    PROJECT ||--o{ SKILL_DIR : "explicitOn/Off 覆盖"

    SKILL_DIR ||--o{ AGENT_DIR_ENTRY : "投影: 软链/复制"
    SKILL_DIR ||--o{ PROJECT_AGENTS_ENTRY : ".agents 本体复制 → 项目级软链"
```

---

## 3. 总体数据流向图（架构 + 分层）

```mermaid
flowchart LR
    subgraph Browser["浏览器 (React + Vite :5173)"]
        UI[WebUI<br/>资产库 / AI 工具 / 技能套餐 / 项目 / 体检中心]
    end

    subgraph Server["本地服务 (Node :8787)"]
        direction TB
        API[REST API routes.ts]
        subgraph Core["服务层 core/"]
            direction TB
            SCANNER[scanner 扫描<br/>scanAll → 资产库实时视图]
            DESIRED[期望集计算<br/>desiredContext: 基准∪explicitOn−explicitOff]
            SYNC[同步引擎 sync<br/>diffSync → 软链/复制]
            PSYNC[项目同步 projects<br/>.agents 复制 + 项目级软链]
            TAGS[标签读写 repo-tags<br/>skill 文件 / 仓库内文件 / 仓库外文件]
            IMPORT[导入/收编<br/>import / collect / integrate]
            DIAG[体检中心 diagnose<br/>期望 vs 物理 对账]
            WATCH[CopyWatcher 可选<br/>仓库变更 → 重跑同步]
        end
        CFG[(config.json<br/>~/.skills-hub)]
    end

    subgraph FS["文件系统（本体世界）"]
        direction TB
        REPO[仓库目录<br/>skills 本体]
        EXT[外部来源目录<br/>只读]
        AGDIR[Agent 全局技能目录<br/>~/.xxx/skills]
        PAGENT[项目 .agents/skills<br/>本体复制]
        PLINK[Agent 项目级目录<br/>软链→.agents]
    end

    UI -- "HTTP (读: state/agents/skills)" --> API
    UI -- "HTTP (写: repos/presets/agents/projects/tags)" --> API
    API --> SCANNER & DESIRED & SYNC & PSYNC & TAGS & IMPORT & DIAG
    API -- "读写管理元数据" --> CFG
    SCANNER --> REPO & EXT
    DESIRED --> CFG
    SYNC -- "软链/复制 (触发式)" --> AGDIR
    PSYNC -- "复制" --> PAGENT
    PSYNC -- "软链" --> PLINK
    TAGS -- "写回标签" --> REPO
    IMPORT -- "复制入仓" --> REPO
    IMPORT -- "读取发现" --> EXT & AGDIR
    WATCH -- "去抖触发 onChange→syncActive" --> SYNC
    DIAG -- "只读对账" --> CFG & AGDIR & PAGENT
```

---

## 4. 核心数据流（四条关键链路）

### 4.1 资产入仓（Ingest：让资产从「散落」到「集中」）

```mermaid
flowchart LR
    A[Agent 技能目录<br/>自带本体] -- "collect 收集<br/>(仅复制, 不动 agent)" --> R
    B[任意外部目录] -- "importDirs 批量导入<br/>(识别→复制, 同名去重)" --> R
    C[第三方仓库] -- "收编 integrate<br/>(applyAdoption)" --> R
    C -. "只读关联 linked=true" .-> S[scanAll 实时纳入资产库]
    R[(仓库 <repo>/skills)]
    R --> S --> LIB[资产库视图<br/>id = name@source]
```

- 去重键 = skill 目录名（name）；`name@来源` 允许跨来源重名共存于逻辑层，但**投影时按 name 归一化只落一份**。
- 收集（collect）目前只复制不动 Agent 目录；「收编后 Agent 改软链」（PRD IM-03）由前端「合并去重」两步手动完成。

### 4.2 期望集 → 触发式分发（核心链路：切到即用）

```mermaid
flowchart LR
    subgraph Trigger["触发点（无 watcher，操作即同步）"]
        direction TB
        T1[技能套餐 激活/增删改]
        T2[活跃 Agent 集合变更]
        T3[Agent 手动开关 skill<br/>explicitOn/Off]
        T4[标签变更 PATCH]
        T5[手动「立即生效」]
        T6[CopyWatcher 仓库文件变更<br/>仅复制模式可选]
    end

    subgraph Calc["期望集计算 desiredContext(agent)"]
        direction TB
        BASE["基准 = 指定套餐成员<br/>或全部激活套餐并集<br/>(mode=manual 时为空)"]
        ON["∪ explicitOn"]
        OFF["− explicitOff"]
        D["desired: Map&lt;id, Skill&gt;"]
        BASE --> ON --> OFF --> D
    end

    subgraph Diff["对账 diffSync"]
        CMP["物理目录 vs desired<br/>name 归一化比对"]
    end

    D --> CMP
    Trigger --> Calc
    CMP -- "缺失 → 建" --> L1["软链 → 仓库本体<br/>(零冗余, 即时生效)"]
    CMP -- "不支持软链/指定复制" --> L2["复制 → 独立副本<br/>(需手动/watcher 再同步)"]
    CMP -- "多余 → 删(残留/已停用)" --> L3[移除目录或软链]
```

- 作用域：`touch()`（onChanged）只对 **activeAgents** 自动同步；非活跃 Agent 懒同步（进入详情页手动「立即生效」）。
- 投影幂等：重复执行 diff 为空即无操作（NFR-05）。

### 4.3 项目级链路（一套本体、多 Agent 共享）

```mermaid
flowchart LR
    PT[项目 tags + explicitOn/Off] -- "期望 = 标签命中 ∪ explicitOn − explicitOff" --> PD[项目期望集]
    PD -- "复制本体" --> AG["<project>/.agents/skills<br/>(可提交 git, 团队共享)"]
    AG -- "软链" --> PA1["<project>/.cursor/skills"]
    AG -- "软链" --> PA2["<project>/.claude/skills"]
    AG -. "PJ-05 回写仓库 (未实现)" .-> R[(仓库)]
    R -. "PJ-05 双向同步 (未实现)" .-> AG
```

- 标签是「投放策略」而非目录快照：标签变化 → 立即重投（沿用当前已投放 Agent 集合）。
- 投放对象（哪些 Agent 的项目目录建软链）**以目录结构为事实**，不写入 config。

### 4.4 标签链路（元数据的载体选择）

```mermaid
flowchart TB
    U[UI 打标签] --> Q{仓库配置了<br/>tags 载体?}
    Q -- "skill 文件" --> W1[写 SKILL.md frontmatter 顶层 tags<br/>随 git 版本化 · 推荐]
    Q -- "仓库内文件 / 仓库外文件" --> W2[写 marketplace.json<br/>plugins[].keywords<br/>与外部本体解耦]
    Q -- "未配置（自动）" --> W3[写 config.skillMeta<br/>仅本地 · 提示用户配置载体]
    W1 & W2 & W3 --> RD[读取优先级:<br/>repo.tags 载体为唯一基准<br/>否则 skillMeta → frontmatter 自带]
    RD --> USED["被三处消费:<br/>① 资产库过滤 ② 技能套餐关联 ③ 项目标签命中"]
```

---

## 5. 现状对照：图上发现的差距（讨论重点）

按「数据一致性风险 / PRD 未落地」两类，我对照代码梳理出以下差距：

| # | 发现 | 类型 | 建议 |
|---|------|------|------|
| G1 | **标签双基准漂移**：PATCH 写载体失败时静默回退写 `skillMeta`，且未配载体的仓库读 frontmatter 自带 tags——同一 skill 的标签可能同时存在三处（frontmatter / skillMeta / 载体文件），无对账 | 数据一致性 | 明确「单一基准 + 只读兜底」：载体配置后 skillMeta 只作只读迁移源，体检中心增加标签漂移检测 |
| G2 | **期望集标识混用 id 与 name**：`explicitOn` 有时存 `name@source` 有时存纯 name（`nameOf` 归一化兜底），跨来源同名 skill 的 explicitOn 指向可能随扫描顺序漂移 | 数据一致性 | 统一约定：配置层一律存 id（name@source），仅投影层归一化为 name；写入时归一化 |
| G3 | **回写仓库（PJ-05）未实现**：项目 `.agents` 修改无法 push 回仓库，双向同步缺失 | PRD 未落地 | 新增 `POST /projects/:id/push`（方向可选）+ UI 按钮 |
| G4 | **收编后未改软链（IM-03）**：collect 只复制，Agent 目录仍是本体，需手动两步「合并去重」 | PRD 未落地 | collect 增加 `replace: true`：复制入仓 → 原位置替换为软链 |
| G5 | **触发机制两套并存**：部分路由走 `touch()`，部分（presets PUT / activate、projects）显式调 `syncActive`，语义重复且覆盖面不一致 | 代码结构 | 统一为「所有结构性变更 → touch()」单出口 |
| G6 | **activeAgents 集合变更未做「加入即就位」校验**：AA-04 要求加入即同步，当前依赖 `touch()` 全量重跑（结果等价，但非活跃→活跃切换时无「就位」反馈） | 体验 | `PUT /activeAgents` 返回该 Agent 的同步 diff 摘要 |
| G7 | **CopyWatcher 只监听仓库**：复制模式下 Agent 目录里手工改动的副本、`.agents` 变更不在监听范围 | 边界 | 暂可接受（P3 再扩），图上标注清楚即可 |
| G8 | **TECH.md 为空**：架构文档缺失，本次图可作为其底稿 | 文档 | 讨论定稿后回填 TECH.md |

---

## 6. 建议的讨论议题（定稿前需拍板）

1. **标签基准**（G1）：是否确定「仓库配置载体后，载体即唯一基准，skillMeta 仅一次性迁移」？体检中心是否加「标签漂移」检查项？
2. **标识约定**（G2）：配置层统一存 `name@source`，是否接受？
3. **回写设计**（G3）：`.agents → 仓库` 回写的方向、冲突策略（仓库为基准覆盖 or 时间戳 or 手动逐个确认）？
4. **收编即软链**（G4）：collect 默认是否直接替换为软链，还是保持「收集」与「接管」两个动作？
5. **触发统一**（G5）：全部收敛到 touch() 单出口？
6. 优先级排序：建议 G1/G2（数据一致性）→ G4（核心体验）→ G3（P2 收尾）→ G5/G6。
