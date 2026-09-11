# Skills Hub 关键约定（v1 草案）

> 本文档梳理贯穿全项目的「设计约定」——即所有功能演进都必须遵守的底层规则。
> 每条约定附：含义、现状佐证（对应代码/PRD 条款）、对后续开发的约束。
> 与 `docs/data-flow.md`（数据流向图）配套阅读。

---

## 一、数据本体类

### C1. 文件即本体（File is the body）
- **含义**：skill 本体只以普通文件目录形式存在于磁盘（`SKILL.md` + 附带文件），工具自身不保存任何 skill 内容副本到私有存储。
- **佐证**：config.json 中没有 skill 注册表；资产库列表每次由 `scanAll` 实时扫描得出；README「你的 skill 是你的文件」。
- **约束**：任何新功能不得把 skill 内容（描述、正文、脚本）写入 config 或数据库；需要元信息时要么扫描文件，要么引用文件。

### C2. 开放格式，无工具专有格式（NFR-03 / SR-03）
- **含义**：仓库与 `.agents` 目录只遵循 `SKILL.md` 开源约定，不引入本工具私有的清单文件、索引文件或目录结构。
- **佐证**：flat 布局即 skills.sh 等社区主流布局；离开本工具后仓库照常可用。
- **约束**：新增元数据需求时，优先找生态已有位置承载；确实没有时才允许 config 承载（见 C5 的「可推导性」判断）。

### C3. 管理信息与外部本体分离
- **含义**：当 skill 来自外部（第三方仓库，SKILL.md 是别人的内容、会随上游更新），用户自己的归类（标签）不写入其本体文件，放仓库内文件（默认 `.claude-plugin/marketplace.json`）或仓库外文件。
- **佐证**：`RepoTags` 的 `repo-file` / `external-file` 模式及 UI 提示文案。
- **约束**：标签写回逻辑必须先判断仓库来源归属（自有 vs 外部）再选载体。

---

## 二、状态与事实类

### C4. 以文件目录状态为准（Directory state is truth）
- **含义**：凡是「物理上看得见」的状态，一律以目录结构为唯一事实，不在 config 里再存一份快照。
- **佐证**：
  - 项目「投放给了哪些 Agent」= `<project>/.<agent>/skills` 软链是否存在，不写 config（`PUT /projects/:id/agents` 注释「以实际目录结构为唯一事实」）；
  - Agent 技能清单 = 实时扫描其技能目录（自带 / 软链 / 复制 / 残留均从目录形态判断）。
- **约束**：新状态优先考虑「能否由目录推导」；禁止在 config 中缓存目录快照（会导致双事实漂移）。

### C5. config 只存「不可推导的管理决策」
- **含义**：config.json 的每一项都必须满足「无法从文件系统推导」。判定标准：这是一个**用户决策**（决定做什么），而不是一个**物理结果**（已经是什么）。
- **佐证**：repos（注册了哪些仓库）、agents overrides（每 Agent 的策略与显式开关）、activeAgents（用户选的活跃集合）、presets（用户定义的套餐）、projects（登记 + 投放策略）、skillMeta（标签兜底）。
- **约束**：往 config 加字段前先自问「这条信息删掉后能否从目录/文件重新推导？」能推导的不加。

### C6. 期望集推导式，不落盘（Desired is computed, not stored）
- **含义**：每个 Agent / 项目的「应该装什么」永远是运行时计算结果：`基准(套餐/标签命中) ∪ explicitOn − explicitOff`，不保存计算结果。
- **佐证**：`desiredContext` 每次请求现算；`diffSync` 用「期望 vs 物理」对账。
- **约束**：期望集的输入因子（套餐、显式开关、标签）才是持久化对象；任何地方不得缓存 desired。

### C7. 幂等（NFR-05）
- **含义**：扫描、导入、收编、同步全部可重复执行；重复执行不产生重复本体、不产生悬空链接、diff 为空即无操作。
- **佐证**：scanner 跳过失效软链；sync 以 diff 为驱动（缺则建、多则删）。
- **约束**：新写的写操作必须先算 diff 再动手；不允许「无脑追加」式写入。

---

## 三、标识与命名类

### C8. `name@source` 逻辑唯一，`name` 物理唯一
- **含义**：逻辑层（资产库、套餐、显式开关）用 `name@source` 精确标识一个 skill，允许跨来源重名共存；物理层（投影到目录）按 `name` 归一化，同一目录名只落一份。
- **佐证**：`sync.ts nameOf()` 归一化；scanner `s.id = name@source`。
- **约束**：配置层（explicitOn/explicitOff/preset.skills）统一存 `name@source`，仅投影层做 name 归一化（对应差距 G2，待定稿）。

### C9. 去重收敛，不扩散（README「降低生态碎片化」）
- **含义**：同名 skill 自动去重保留一份；重复、分歧、失效引用集中在体检中心看清、就地处理，而不是放任多副本膨胀。
- **佐证**：import/collect 同名跳过；体检中心「重复 skill / 分歧 / 失效引用」。
- **约束**：所有复制类操作（import、collect、syncProject）默认带同名去重。

---

## 四、同步类

### C10. 触发式同步，无常驻（AA-02 / §8.4）
- **含义**：全局同步只在操作触发点执行（套餐变更、活跃集合变更、显式开关、标签变更、手动按钮），不常驻 watcher；watcher 仅为复制模式的可选增量手段。
- **佐证**：`CopyWatcher` 仅在存在可观察源时启动，去抖 800ms；路由层 `touch()` / 显式 `syncActive`。
- **约束**：新功能不得引入常驻扫描线程；「实时」一律通过在操作路径上插入同步动作实现。

### C11. 软链优先，复制回退（SY-01~03）
- **含义**：每条（skill, Agent）同步关系默认软链（零冗余、即时可见）；对不跟随软链的场景降级为复制，复制需额外同步机制（手动 / watcher）。
- **佐证**：`defaultSync: 'symlink'`；AgentSkillRow 按 store 形态展示「软链 / 复制 / 本体」。
- **约束**：新增投影场景（如新类型目标目录）默认软链，复制必须显式选择。

### C12. 活跃即实时，非活跃即懒（AA-03/04）
- **含义**：结构性变更只自动作用于活跃 Agent 集合；非活跃 Agent 保持现状，等用户进入时手动同步；加入活跃集合即就位。
- **佐证**：`touch()` 只对 `activeAgents` 成员触发；Agent 详情页「立即生效」。
- **约束**：任何自动同步逻辑的作用域都必须是 activeAgents，不得静默扩散到全部 Agent。

### C13. 只读尊重，不侵入外部数据
- **含义**：只读关联的外部来源（foreignSources.linked=true）只读不写；Agent 目录里「自带」技能不被本工具擅自改动；删除操作限定在「非期望」状态（残留/已停用）。
- **佐证**：`DELETE /agents/:key/skills/:name` 校验 `wanted` 才拒删；scanner 对失效软链只跳过不修复。
- **约束**：写操作前先判断目标归属（自有仓库 / 收编副本 / 外部只读 / Agent 自带），只对自己接管的内容动手。

---

## 五、生态兼容类

### C14. 标签落在生态共识位置
- **含义**：标签优先写 SKILL.md frontmatter 顶层 `tags`（40+ 工具原生读取、随 git 版本化）；其次 Claude Plugin 的 `plugins[].keywords` 结构；最后才是本地 config 兜底。
- **佐证**：`TagsMode = auto | frontmatter | repo-file | external-file`；UI「🛡 推荐」文案。
- **约束**：标签相关新功能必须基于载体抽象（repo-tags），不得直接读写 config.skillMeta 绕过载体。

### C15. 多布局宽容读取（SR-04 / EK-01）
- **含义**：对外部目录不苛求结构——flat / nested / 带索引清单都能读；扫描以 `SKILL.md` 存在为准，不以目录深度为准。
- **佐证**：`scanDir` 递归发现、`detectLayoutAbs` 自动识别、`layout: auto`。
- **约束**：新增读取场景一律「以 SKILL.md 为锚」实现发现逻辑。

---

## 六、边界类

### C16. 全本地，数据不出机（NFR-01）
- **含义**：所有读写发生在本机文件系统；网络仅限将来可选的开源库拉取。
- **约束**：新功能不得引入上报、遥测或云端依赖。

### C17. 可诊断（NFR-06）
- **含义**：任何「期望 ≠ 物理」的状态（失效软链、复制冲突、权限问题、双事实漂移）都必须在体检中心可见，并给出可操作修复。
- **佐证**：`/diagnose` 汇总 Agent/同步/重复/失效软链/仓库/项目/标签七类检查。
- **约束**：每引入一种新状态或新载体，必须同步在 diagnose 中增加对应检查项。

---

## 七、前端约定类

> 后端约定保证「数据不漂移」，前端约定保证「同一件事只有一处实现、只有一份状态」。

### F1. URL 是页面状态的唯一来源（NFR: 可刷新 / 可分享）
- **含义**：一级页面、二级详情标识、页面内筛选与搜索条件全部写进 hash 地址（`#/<tab>[/<sub>][?<query>]`），组件内部 state 只承载「弹窗开关」这类瞬时 UI。
- **佐证**：`state/router.ts` 的 `useRoute` / `useQueryParam` / `useQueryFlag` / `useQueryValue`；`views/Library.tsx` 的详情用 `route.sub`，筛选用 query。
- **约束**：新增页面时，详情选中项与筛选条件必须走 router；不得在组件内 `useState` 保存「当前在看哪一个」。高频输入（搜索）用 `{ replace: true }`，避免污染历史栈。

### F2. 近似展示复用通用组件，不内联重写
- **含义**：凡是「一组实体的列表」——技能、预设、项目、Agent、仓库、来源、整合候选——都映射为同一份展示契约后交给同一个容器渲染，保证各页风格与交互一致。
- **佐证**：`components/common/EntityList.tsx`（卡片优先，可切列表，偏好全局共享）、`components/common/FilterBar.tsx`（搜索 + 筛选 + 可折叠条件组）、`components/skill/SkillList.tsx`、`components/skill/AddableSkillList.tsx`。
- **约束**：新增列表型 UI 时先扩 `EntityItem` 契约或 `FilterBar` 的插槽；不得在新视图里手写 `.entity-row` / `.entity-card` 结构。一套交互只允许一份实现（例如开关+文字标签统一用 `ui/SwitchLabel`）。

### F3. 视觉一律走 token，组件不内联色值
- **含义**：颜色、字号、间距、圆角、动效时长与缓动、字体族全部引用 `client/src/styles/tokens.css` 的命名变量；同一条工具条内的可交互控件统一高度（`--control-h`）。
- **佐证**：`--c-*` / `--sp-*` / `--fs-*` / `--r-*` / `--dur-*` / `--ease` / `--ff-*` / `--control-h`；暗色主题由 `html[data-theme="dark"]` 整块覆写。
- **约束**：需要新色值或新字体时，先在 token 块中登记命名变量再引用；不得在组件里写 hex / 字体名。（标题用 `--ff-display`，正文用 `--ff-sans`，注意标题字重需落在已加载的 500/600/700 内。）

### F4. 路径输入统一可调起系统选择器
- **含义**：凡是需要填写文件/目录**绝对路径**的地方，都要能一键调起系统原生选择器，而不是只让用户手打。
- **佐证**：`components/ui/PathField.tsx`（`PathField` 单行 / `PathListField` 多行）、`api/picker.ts` → `core/picker.ts`（macOS osascript / Windows PowerShell / Linux zenity·kdialog）；用户取消返回 `null` 不报错。
- **约束**：新增路径输入必须使用 `PathField`；只有**相对路径**（如 `.my-tool/skills`）因系统选择器无法表达，才允许保留纯文本输入并注明。

---

## 汇总：一条判定流程（新功能自查用）

```
新功能要保存一条信息？
 ├─ 它是用户决策吗？ ──否──▶ 不存，由目录/文件推导（C4/C5/C6）
 ├─ 是 skill 内容吗？ ──是──▶ 只能存在于文件本体（C1/C2）
 ├─ 是标签吗？ ──是──▶ 走载体抽象，按来源选 frontmatter/仓库内外文件（C3/C14）
 └─ 是策略/开关吗？ ──是──▶ 存 config，标识用 name@source（C5/C8）
                               └─ 写操作：先 diff、幂等、限自有作用域（C7/C10/C12/C13）
                                   └─ 体检中心补检查项（C17）
```
