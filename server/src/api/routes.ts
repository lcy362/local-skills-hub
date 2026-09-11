import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ConfigStore } from '../infra/config-store.js';
import { log } from '../infra/logger.js';
import { pickDirectory, pickFile } from '../infra/picker.js';
import { listAgents, agentSkillRows, findAgentDef, resolveGlobalDir } from '../core/agents.js';
import { scanAll, detectLayoutAbs } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive, diffSync, computeDesired, desiredContext } from '../core/sync.js';
import { collectCandidates } from '../core/integrate.js';
import { addProject, syncProject, projectSkillRows, projectAddable, deployedAgents, pushProjectToRepo } from '../core/projects.js';
import { importDirs, previewImportDirs } from '../core/import.js';
import { previewCollect, collectAgentSkill } from '../core/collect.js';
import { migrateTagsToFrontmatter } from '../core/repo-tags.js';
import { takeover } from '../core/takeover.js';
import { applyFix } from '../core/fix.js';
import { diagnose } from '../core/diagnose.js';
import { mergeSkill } from '../core/merge.js';
import { Repo, ForeignSource, CustomAgent } from '../config/types.js';
import { agentCards, projectCards } from '../domain/cards.js';

/** server 版本号，/api/logs 上报给用户用于 issue 定位（优先 cwd，兼容 dev 的 src 路径） */
const SERVER_VERSION = (() => {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'),
  ];
  for (const pkg of candidates) {
    try {
      const v = (JSON.parse(fs.readFileSync(pkg, 'utf-8')) as { version?: string }).version;
      if (v) return v;
    } catch { /* 尝试下一个候选 */ }
  }
  return '0.0.0';
})();

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void; onConfigChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));

  // 请求日志：记录 method、path、status、耗时与 body 字段名（不记值，避免敏感信息落盘）
  r.use((req, res, next) => {
    if (req.path.startsWith('/logs')) return next();
    const started = Date.now();
    res.on('finish', () => {
      const body = req.body as unknown;
      const bodyKeys = body && typeof body === 'object'
        ? Object.keys(body as Record<string, unknown>)
        : undefined;
      log.info('http', `${req.method} ${req.originalUrl.split('?')[0]}`, {
        status: res.statusCode,
        ms: Date.now() - started,
        ...(bodyKeys && bodyKeys.length ? { bodyKeys } : {}),
      });
    });
    next();
  });
  // 结构性变更后自动同步活跃 agent，由入口注入实现
  const touch = () => opts?.onChanged?.();
  const touchConfig = () => opts?.onConfigChanged?.();

  const library = () => scanAll(cfg.data.repos, cfg.data.foreignSources);
  /** 仓库类变更的统一出参：两类仓库一起回传，便于类型转换后前端一次刷新 */
  const warehouses = () => ({ repos: cfg.data.repos, sources: cfg.data.foreignSources });

  r.get('/state', (_req, res) => {
    const lib = library();
    const skills = lib.skills.map((s) => ({
      id: s.id, name: s.name, source: s.source, dir: s.dir,
      description: s.description, version: s.version,
      // 标签：config.skillMeta 覆盖优先，其次 SKILL.md frontmatter
      tags: cfg.data.skillMeta[s.id]?.tags ?? s.tags,
      origin: cfg.data.skillMeta[s.id]?.origin,
    }));
    res.json({
      activeAgents: cfg.data.activeAgents,
      skills,
      presets: cfg.data.presets,
      repos: cfg.data.repos,
      sources: cfg.data.foreignSources,
      customAgents: cfg.data.customAgents,
      settings: { defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers },
    });
  });

  // ---- 全局设置（UI-03 设置） ----
  r.get('/settings', (_req, res) => {
    res.json({ defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers });
  });
  r.put('/settings', (req, res) => {
    const body = req.body ?? {};
    if (body.defaultSync === 'symlink' || body.defaultSync === 'copy') cfg.data.defaultSync = body.defaultSync;
    if (typeof body.watchers === 'boolean') cfg.data.watchers = body.watchers;
    cfg.save();
    touchConfig();
    res.json({ defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers });
  });

  // 合并仲裁（IM-02）：同名多来源时保留指定来源
  r.post('/skills/merge', (req, res) => {
    const { name, keepSource } = req.body ?? {};
    if (!name || !keepSource) return res.status(400).json({ error: 'name/keepSource required' });
    try {
      const result = mergeSkill(cfg, library().skills, String(name), String(keepSource));
      touch();
      log.info('http', '技能合并仲裁', { name: String(name), keepSource: String(keepSource), merged: result.merged.length });
      res.json(result);
    } catch (e) {
      log.error('http', `技能合并仲裁失败: ${(e as Error).message}`, { name: String(name), keepSource: String(keepSource) });
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // SKILL.md 预览（UI-03 资产库详情）
  r.get('/skills/:id/content', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const sk = library().skills.find((s) => s.id === id);
    if (!sk) return res.status(404).json({ error: 'skill not found' });
    const file = path.join(sk.dir, 'SKILL.md');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'SKILL.md not found' });
    let files: string[] = [];
    try { files = fs.readdirSync(sk.dir).filter((f) => f !== 'SKILL.md'); } catch { /* ignore */ }
    res.json({ id: sk.id, dir: sk.dir, content: fs.readFileSync(file, 'utf-8'), files });
  });

  // ---- filesystem ----
  // 调起系统原生选择器；path 为 null 表示用户取消。
  // 选择器会阻塞最多 120s，故使用异步 exec 避免占满事件循环。
  r.post('/filesystem/pick', async (_req, res) => {
    try { res.json({ path: await pickDirectory() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  r.post('/filesystem/pick-file', async (_req, res) => {
    try { res.json({ path: await pickFile() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- repos ----
  r.get('/repos', (_req, res) => res.json(cfg.data.repos));
  r.post('/repos', (req, res) => {
    const { id, path: p, layout, root } = req.body as Repo;
    if (!id || !p) return res.status(400).json({ error: 'id/path required' });
    if (cfg.data.repos.some((x) => x.id === id)) return res.status(409).json({ error: `repo ${id} 已存在` });
    // layout 缺省或 auto → 扫描期自动检测（SR-04）
    const wantLayout = layout ?? 'auto';
    cfg.data.repos.push({ id, path: p, layout: wantLayout, root: root ?? undefined });
    cfg.save();
    touch();
    res.json(cfg.data.repos);
  });
  r.delete('/repos/:id', (req, res) => {
    cfg.data.repos = cfg.data.repos.filter((x) => x.id !== req.params.id);
    cfg.save();
    touch();
    res.json(cfg.data.repos);
  });
  // 编辑自有仓库：改名称 / 路径 / 布局 / root；kind='source' 时转为第三方仓库。
  // 转换保持 id 不变，故 skill 标识 name@id 与标签、preset、项目引用均不受影响。
  // 注意：两类仓库扫描根不同（自有 = root ?? <path>/skills，第三方 = path），
  // 路径换算由调用方给出，接口只负责落库。
  r.put('/repos/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const { layout, path: p, root, name, kind } = req.body ?? {};
    if (layout) repo.layout = layout;
    if (p) repo.path = p;
    if (name !== undefined) repo.name = name || undefined;
    if (root !== undefined) repo.root = root || undefined;

    if (kind === 'source') {
      cfg.data.repos = cfg.data.repos.filter((x) => x.id !== repo.id);
      cfg.data.foreignSources.push({
        id: repo.id,
        name: repo.name ?? repo.id,
        path: repo.path,
        layout: repo.layout,
        linked: true,
      });
    }
    cfg.save();
    touch();
    res.json(warehouses());
  });
  r.post('/repos/scan/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(scanAll([repo], []));
  });

  // 自有仓库标签迁移到 SKILL.md frontmatter
  r.post('/repos/:id/tags-migrate', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    try {
      const result = migrateTagsToFrontmatter(cfg, repo);
      log.info('http', '标签迁移到 SKILL.md', { repo: repo.id, migrated: result.migrated, skipped: result.skipped.length });
      res.json(result);
    } catch (e) {
      log.error('http', `标签迁移失败: ${(e as Error).message}`, { repo: repo.id });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/repos/detect', (req, res) => {
    const { path: p } = req.body ?? {};
    if (!p) return res.status(400).json({ error: 'path required' });
    try { res.json(detectLayoutAbs(p)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // 从 agent 收集归拢 skill 到仓库（仅复制，不动 agent）
  r.get('/repos/:id/collect/preview', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(previewCollect(cfg, repo));
  });
  r.post('/repos/:id/collect', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const { agentKey, agentKeys, names, selections, replaceNames } = req.body ?? {};
    // 优先 selections（按 agent 指定 skill 明细）；兼容旧 agentKeys/agentKey（收全部）。
    // replaceNames：确认页明确选择「用 agent 版本覆盖仓库副本」的名字。
    const repl: string[] | undefined = Array.isArray(replaceNames) ? replaceNames.map(String) : undefined;
    const sel: { agentKey: string; names?: string[] }[] = Array.isArray(selections)
      ? selections.map((s: { agentKey: unknown; names?: unknown }) => ({
          agentKey: String(s.agentKey),
          names: Array.isArray(s.names) ? s.names.map(String) : undefined,
        }))
      : (Array.isArray(agentKeys)
          ? agentKeys
          : agentKey
            ? [String(agentKey)]
            : listAgents(cfg.data).filter((a) => a.installed).map((a) => a.key)
        ).map((k) => ({ agentKey: k, names: Array.isArray(names) ? names.map(String) : undefined }));
    if (sel.length === 0) return res.status(400).json({ error: '无已安装 agent 可归集' });
    try {
      const results = sel.map((s) => collectAgentSkill(cfg, repo, s.agentKey, s.names, repl));
      touch();
      const collected = results.flatMap((x) => x.collected);
      const skipped = results.flatMap((x) => x.skipped);
      log.info('http', '归集技能到仓库', { repo: repo.id, collected: collected.length, skipped: skipped.length });
      res.json({
        collected,
        skipped,
        byAgent: results.map((x, i) => ({ agent: sel[i].agentKey, ...x })),
      });
    } catch (e) {
      log.error('http', `归集技能失败: ${String(e)}`, { repo: repo.id });
      res.status(500).json({ error: String(e) });
    }
  });

  // 接管：把 agent 源 skill 替换为指向仓库副本的软链（源改名备份，需显式 confirm）
  r.post('/repos/:id/takeover', (req, res) => {
    const { agentKey, name, confirm } = req.body ?? {};
    if (!agentKey || !name) return res.status(400).json({ error: 'agentKey/name required' });
    try {
      const result = takeover(cfg, String(agentKey), String(name), req.params.id, confirm === true);
      log.info('http', '接管 agent 技能', { repo: req.params.id, agentKey: String(agentKey), name: String(name), confirm: confirm === true });
      res.json(result);
    } catch (e) {
      log.error('http', `接管失败: ${(e as Error).message}`, { repo: req.params.id, agentKey: String(agentKey), name: String(name) });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- foreign sources ----
  r.get('/sources', (_req, res) => res.json(cfg.data.foreignSources));
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource;
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    cfg.data.foreignSources.push({
      ...body,
      layout: body.layout ?? 'auto',
      linked: body.linked ?? true,
    });
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources);
  });
  r.delete('/sources/:id', (req, res) => {
    cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== req.params.id);
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources);
  });
  // 编辑第三方仓库：改名称 / 路径 / 布局 / 只读关联；kind='repo' 时转为自有仓库
  // （此时 root 由调用方给出，用于维持原扫描根不变）。
  r.put('/sources/:id', (req, res) => {
    const src = cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'source not found' });
    const { name, path: p, layout, linked, kind, root } = req.body ?? {};
    if (name !== undefined) src.name = name || src.id;
    if (p) src.path = p;
    if (layout) src.layout = layout;
    if (linked !== undefined) src.linked = linked === true;

    if (kind === 'repo') {
      cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== src.id);
      cfg.data.repos.push({
        id: src.id,
        name: src.name && src.name !== src.id ? src.name : undefined,
        path: src.path,
        layout: src.layout,
        root: root || undefined,
      });
    }
    cfg.save();
    touch();
    res.json(warehouses());
  });
  // ---- custom agents（AG-03） ----
  r.get('/agents/custom', (_req, res) => res.json(cfg.data.customAgents));
  r.post('/agents/custom', (req, res) => {
    const body = req.body as CustomAgent;
    if (!body?.key || !body?.name || !body?.globalDir) {
      return res.status(400).json({ error: 'key/name/globalDir required' });
    }
    if (cfg.data.customAgents.some((a) => a.key === body.key) || listAgents(cfg.data).some((a) => a.key === body.key)) {
      return res.status(409).json({ error: `agent ${body.key} 已存在` });
    }
    cfg.data.customAgents.push({
      key: body.key,
      name: body.name,
      globalDir: body.globalDir,
      projectDir: body.projectDir || undefined,
      recursive: body.recursive === true,
    });
    cfg.save();
    res.json(cfg.data.customAgents);
  });
  r.delete('/agents/custom/:key', (req, res) => {
    cfg.data.customAgents = cfg.data.customAgents.filter((a) => a.key !== req.params.key);
    delete cfg.data.agents[req.params.key];
    cfg.data.activeAgents = cfg.data.activeAgents.filter((k) => k !== req.params.key);
    cfg.save();
    touch();
    res.json(cfg.data.customAgents);
  });

  // ---- agents / active ----
  r.get('/agents', (_req, res) => res.json(listAgents(cfg.data)));
  r.put('/agents/:key', (req, res) => {
    const key = req.params.key;
    if (!findAgentDef(cfg.data, key)) return res.status(404).json({ error: 'unknown agent' });
    const over = cfg.data.agents[key] ?? {};
    const body = req.body ?? {};
    const { sync, globalDir, projectDir } = body;
    if (sync === 'symlink' || sync === 'copy') over.sync = sync;
    if (globalDir !== undefined) { if (globalDir) over.globalDir = globalDir; else delete over.globalDir; }
    if (projectDir !== undefined) { if (projectDir) over.projectDir = projectDir; else delete over.projectDir; }
    if ('mode' in body && (body.mode === 'preset' || body.mode === 'manual')) over.mode = body.mode;
    if ('preset' in body) { if (body.preset) over.preset = body.preset; else delete over.preset; }
    // 每关系同步策略（SY-01）：{ skill, sync } 写入 skillSync
    if ('skillSync' in body && body.skillSync && typeof body.skillSync === 'object') {
      over.skillSync = { ...(over.skillSync ?? {}), ...body.skillSync };
    }
    // 兼容前端 `skill + on` 语义：开启→显式开启列表；关闭→按情况写入停用列表或移出开启列表
    if ('skill' in body && typeof body.skill === 'string') {
      const name = body.skill;
      const on = body.on !== false;
      const onSet = new Set(over.explicitOn ?? []);
      const offSet = new Set(over.explicitOff ?? []);
      if (on) { onSet.add(name); offSet.delete(name); }
      else { onSet.delete(name); offSet.add(name); }
      over.explicitOn = onSet.size ? [...onSet] : undefined;
      over.explicitOff = offSet.size ? [...offSet] : undefined;
    }
    const setList = (field: 'explicitOn' | 'explicitOff') => {
      if (field in body) { const list = Array.isArray(body[field]) ? body[field] : []; if (list.length) over[field] = list; else delete over[field]; }
    };
    setList('explicitOn'); setList('explicitOff');
    cfg.data.agents[key] = over;
    cfg.save();
    if (cfg.data.activeAgents.includes(key)) touch();
    res.json(cfg.data.agents[key]);
  });
  r.get('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    const lib = library();
    const ctx = desiredContext(cfg, lib.skills, key);
    const rows = agentSkillRows(key, cfg.data, lib.skills, ctx);
    const present = new Set(rows.filter((x) => x.present).map((x) => x.name));
    const inDesired = new Set(rows.filter((x) => x.wanted).map((x) => x.name));
    const seenAddable = new Set<string>();
    const addable = lib.skills
      .filter((s) => !inDesired.has(s.name) && !present.has(s.name) && !ctx.onNames.has(s.name))
      .map((s) => ({ id: s.id, name: s.name, repo: s.source }))
      .filter((a) => { if (seenAddable.has(a.name)) return false; seenAddable.add(a.name); return true; });
    res.json({ skills: agentCards(rows), addable, active: cfg.data.activeAgents.includes(key) });
  });
  r.post('/agents/:key/sync', (req, res) => {
    const key = req.params.key;
    const r_ = syncActive(cfg, library().skills, [key]);
    res.json(r_[0] ?? { agent: key, created: [], removed: [], failed: [] });
  });
  r.delete('/agents/:key/skills/:skillName', (req, res) => {
    const key = req.params.key;
    const name = req.params.skillName;
    const def = findAgentDef(cfg.data, key);
    if (!def) return res.status(404).json({ error: 'unknown agent' });
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'skill not found' });
    const ctx = desiredContext(cfg, library().skills, key);
    const wanted = [...ctx.desired.values()].some((s) => s.name === name);
    if (wanted) return res.status(400).json({ error: '该技能正处于启用状态；请先关闭（移除期望）再删除' });
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true, removed: name });
  });
  // 活跃 Agent 集合（AA-01 / AA-04）
  r.get('/activeAgents', (_req, res) => res.json(cfg.data.activeAgents));
  r.put('/activeAgents', (req, res) => {
    const keys = Array.isArray(req.body) ? req.body : req.body?.agents;
    const out = active.set(cfg, keys ?? []);
    touch();
    log.info('http', '更新活跃 agent 集合', { agents: out.length });
    res.json(out);
  });

  // ---- skills / tags ----
  // 打标签：只写入 config.skillMeta（覆盖 SKILL.md frontmatter），满足 TG-01
  r.patch('/skills/:id', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    if (!Array.isArray(req.body?.tags)) return res.status(400).json({ error: 'tags required' });
    const tags = req.body.tags;
    const meta = cfg.data.skillMeta[id] ?? { tags: [] };
    meta.tags = tags;
    cfg.data.skillMeta[id] = meta;
    cfg.save();
    touch();
    res.json(meta);
  });

  // ---- presets ----
  r.get('/presets', (_req, res) => res.json(cfg.data.presets));
  r.post('/presets', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const p = presets.create(cfg, name);
      // 兼容前端一次传入 skills/tags/active
      if (Array.isArray(req.body?.skills)) p.skills = req.body.skills;
      if (Array.isArray(req.body?.tags)) p.tags = req.body.tags;
      if (typeof req.body?.active === 'boolean') p.active = req.body.active;
      cfg.save();
      touch();
      log.info('http', '创建预设', { name, skills: p.skills.length, tags: p.tags.length, active: p.active });
      res.json(p);
    } catch (e) {
      log.error('http', `创建预设失败: ${(e as Error).message}`, { name: String(req.body?.name ?? '') });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  r.put('/presets/:name', (req, res) => {
    try {
      const p = presets.update(cfg, req.params.name, req.body ?? {});
      const lib = library();
      const results = syncActive(cfg, lib.skills, undefined, 'route');
      const created = results.reduce((n, r) => n + r.created.length, 0);
      const removed = results.reduce((n, r) => n + r.removed.length, 0);
      log.info('http', '更新预设', { name: req.params.name, skills: p.skills.length, tags: p.tags.length, created, removed });
      res.json(p);
    } catch (e) {
      log.error('http', `更新预设失败: ${(e as Error).message}`, { name: req.params.name });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  r.post('/presets/:name/activate', (req, res) => {
    try {
      const activeFlag = req.body?.active !== false;
      const changed = presets.setActive(cfg, req.params.name, activeFlag);
      const lib = library();
      const results = syncActive(cfg, lib.skills, undefined, 'route');
      log.info('http', '预设激活切换', { name: req.params.name, active: activeFlag, changed });
      res.json({ changed, results });
    } catch (e) {
      log.error('http', `预设激活失败: ${(e as Error).message}`, { name: req.params.name });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  r.delete('/presets/:name', (req, res) => {
    presets.remove(cfg, req.params.name);
    touch();
    log.info('http', '删除预设', { name: req.params.name });
    res.json({ ok: true });
  });

  // ---- projects (项目级 skill) ----
  r.get('/projects', (_req, res) => {
    res.json(cfg.data.projects.map((p, i) => ({ ...p, id: i, agents: deployedAgents(cfg, p.path), hasAgents: fs.existsSync(path.join(p.path, '.agents', 'skills')) })));
  });
  r.post('/projects', (req, res) => {
    try {
      const p = addProject(cfg, String(req.body?.path), Array.isArray(req.body?.tags) ? req.body.tags : []);
      const wanted = Array.isArray(req.body?.agents) ? new Set<string>(req.body.agents as string[]) : undefined;
      syncProject(cfg, p, library().skills, wanted);
      res.json(cfg.data.projects);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/projects/:id/tags', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    if (Array.isArray(req.body?.tags)) proj.tags = req.body.tags;
    cfg.save();
    const syncResult = syncProject(cfg, proj.path, library().skills);
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  r.put('/projects/:id/agents', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const syncResult = syncProject(cfg, proj.path, library().skills, new Set<string>(Array.isArray(req.body?.agents) ? req.body.agents : []));
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  // 回写仓库（PJ-05）
  r.post('/projects/:id/push', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { repoId, names } = req.body ?? {};
    try {
      const result = pushProjectToRepo(cfg, proj.path, repoId ? String(repoId) : undefined, Array.isArray(names) ? names : undefined);
      log.info('http', '项目技能回写仓库', { repo: repoId ? String(repoId) : undefined, names: Array.isArray(names) ? names.length : undefined });
      res.json(result);
    } catch (e) {
      log.error('http', `项目技能回写失败: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.get('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    res.json({ skills: projectCards(projectSkillRows(cfg, proj, lib.skills)), addable: projectAddable(cfg, proj, lib.skills) });
  });
  r.put('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    // 兼容前端 `skill + on` 语义
    if ('skill' in (req.body ?? {}) && typeof req.body.skill === 'string') {
      const name = req.body.skill;
      const on = req.body.on !== false;
      const onSet = new Set(proj.explicitOn ?? []);
      const offSet = new Set(proj.explicitOff ?? []);
      if (on) { onSet.add(name); offSet.delete(name); }
      else { onSet.delete(name); offSet.add(name); }
      proj.explicitOn = onSet.size ? [...onSet] : undefined;
      proj.explicitOff = offSet.size ? [...offSet] : undefined;
    }
    const setList = (field: 'explicitOn' | 'explicitOff') => {
      if (field in (req.body ?? {})) {
        const list = Array.isArray(req.body[field]) ? req.body[field] : [];
        if (list.length) proj[field] = list; else delete proj[field];
      }
    };
    setList('explicitOn'); setList('explicitOff');
    cfg.save();
    const lib = library();
    const result = syncProject(cfg, proj.path, lib.skills);
    res.json({ ...result });
  });
  r.post('/projects/:id/sync', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    const result = syncProject(cfg, proj.path, lib.skills);
    cfg.save();
    res.json(result);
  });

  // ---- batch import / diagnose ----
  // 预览：GET(?path=) 与 POST({dirs}) 均可
  const importPreview = (req: express.Request, res: express.Response) => {
    const body = req.body ?? {};
    const dirs = Array.isArray(body.dirs)
      ? body.dirs
      : body.path
        ? [String(body.path)]
        : req.query?.path
          ? [String(req.query.path)]
          : [];
    res.json(previewImportDirs(dirs));
  };
  r.get('/import/preview', importPreview);
  r.post('/import/preview', importPreview);
  r.post('/import', (req, res) => {
    const dirs = Array.isArray(req.body?.dirs)
      ? req.body.dirs
      : req.body?.path
        ? String(req.body.path).split('\n').map((s: string) => s.trim()).filter(Boolean)
        : [];
    const repoId = req.body?.repoId;
    try {
      const result = importDirs(cfg, dirs, repoId);
      touch();
      const imported = result.reduce((n, x) => n + x.imported.length, 0);
      const skipped = result.reduce((n, x) => n + x.skipped.length, 0);
      log.info('http', '批量导入技能', { dirs: dirs.length, repo: repoId ?? undefined, imported, skipped });
      res.json(result);
    } catch (e) {
      log.error('http', `批量导入失败: ${(e as Error).message}`, { dirs: dirs.length, repo: repoId ?? undefined });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.get('/diagnose', (_req, res) => {
    try {
      const lib = library();
      res.json(diagnose(cfg, {
        lib,
        candidates: collectCandidates(cfg, lib),
        desired: computeDesired(cfg, lib.skills),
      }));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  // 就地修复：按 diagnose 项 key 分发（Health 视图调用）
  r.post('/fix', (req, res) => {
    const { key } = req.body ?? {};
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      const lib = library();
      const result = applyFix(cfg, { lib }, String(key));
      touch();
      log.info('http', '诊断项就地修复', { key: String(key) });
      res.json(result);
    } catch (e) {
      log.error('http', `诊断项修复失败: ${(e as Error).message}`, { key: String(key) });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- sync ----
  r.get('/sync/status', (_req, res) => {
    const lib = library();
    res.json(diffSync(cfg, lib.skills));
  });
  r.post('/sync', (req, res) => {
    try {
      const lib = library();
      const only = Array.isArray(req.body?.agents) ? req.body.agents : undefined;
      const results = syncActive(cfg, lib.skills, only, 'route');
      const created = results.reduce((n, r) => n + r.created.length, 0);
      const removed = results.reduce((n, r) => n + r.removed.length, 0);
      log.info('http', '手动同步', { agents: results.length, created, removed });
      res.json(results);
    } catch (e) {
      log.error('http', `手动同步失败: ${(e as Error).message}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- logs（开源后用户复制/下载上报问题） ----
  r.get('/logs', (req, res) => {
    const tail = Math.max(1, Math.min(Number(req.query.tail) || 200, 1000));
    const logPath = log.getPath();
    let lines: string[] = [];
    let size = 0;
    try {
      if (fs.existsSync(logPath)) {
        size = fs.statSync(logPath).size;
        lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).slice(-tail);
      }
    } catch (e) {
      log.error('http', `读取日志失败: ${(e as Error).message}`);
      return res.status(500).json({ error: (e as Error).message });
    }
    res.json({ path: logPath, size, lines, version: SERVER_VERSION });
  });
  r.get('/logs/download', (_req, res) => {
    const logPath = log.getPath();
    if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'no log file' });
    res.download(logPath, 'skills-hub.log');
  });

  return r;
}
