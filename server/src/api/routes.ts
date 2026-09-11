import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ConfigStore } from '../infra/config-store.js';
import { pickDirectory, pickFile } from '../infra/picker.js';
import { listAgents, agentSkillRows, findAgentDef, resolveGlobalDir } from '../core/agents.js';
import { scanAll, detectLayoutAbs } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive, diffSync, computeDesired, desiredContext } from '../core/sync.js';
import { previewGroups, applyAdoption, collectCandidates } from '../core/integrate.js';
import { addProject, syncProject, projectSkillRows, projectAddable, deployedAgents, pushProjectToRepo } from '../core/projects.js';
import { importDirs, previewImportDirs, adoptSource } from '../core/import.js';
import { previewCollect, collectAgentSkill } from '../core/collect.js';
import { migrateTagsToFrontmatter } from '../core/repo-tags.js';
import { takeover } from '../core/takeover.js';
import { applyFix } from '../core/fix.js';
import { diagnose } from '../core/diagnose.js';
import { mergeSkill } from '../core/merge.js';
import { Repo, ForeignSource, CustomAgent } from '../config/types.js';
import { agentCards, projectCards } from '../domain/cards.js';

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void; onConfigChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));
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
      res.json(result);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
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
    try { res.json(migrateTagsToFrontmatter(cfg, repo)); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
    const { agentKey, agentKeys, names } = req.body ?? {};
    const keys: string[] = Array.isArray(agentKeys)
      ? agentKeys
      : agentKey
        ? [String(agentKey)]
        : listAgents(cfg.data).filter((a) => a.installed).map((a) => a.key);
    if (keys.length === 0) return res.status(400).json({ error: '无已安装 agent 可归集' });
    try {
      const results = keys.map((k) => collectAgentSkill(cfg, repo, k, Array.isArray(names) ? names : undefined));
      touch();
      res.json({
        collected: results.flatMap((x) => x.collected),
        skipped: results.flatMap((x) => x.skipped),
        byAgent: results.map((x, i) => ({ agent: keys[i], ...x })),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // 接管：把 agent 源 skill 替换为指向仓库副本的软链（源改名备份，需显式 confirm）
  r.post('/repos/:id/takeover', (req, res) => {
    const { agentKey, name, confirm } = req.body ?? {};
    if (!agentKey || !name) return res.status(400).json({ error: 'agentKey/name required' });
    res.json(takeover(cfg, String(agentKey), String(name), req.params.id, confirm === true));
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
  // 收编：把只读关联的第三方仓库拷贝进仓库本体并接管（EK-03）
  r.post('/sources/:id/adopt', (req, res) => {
    const { repoId } = req.body ?? {};
    try {
      const result = adoptSource(cfg, req.params.id, repoId ? String(repoId) : undefined);
      touch();
      res.json(result);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
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
      res.json(p);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/presets/:name', (req, res) => {
    try {
      const p = presets.update(cfg, req.params.name, req.body ?? {});
      const lib = library();
      syncActive(cfg, lib.skills);
      res.json(p);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.post('/presets/:name/activate', (req, res) => {
    try {
      const activeFlag = req.body?.active !== false;
      const changed = presets.setActive(cfg, req.params.name, activeFlag);
      const lib = library();
      const results = syncActive(cfg, lib.skills);
      res.json({ changed, results });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.delete('/presets/:name', (req, res) => {
    presets.remove(cfg, req.params.name);
    touch();
    res.json({ ok: true });
  });

  // ---- integrate (收编/初始整合 IM-01~04) ----
  r.post('/integrate/preview', (_req, res) => {
    const lib = library();
    res.json({ groups: previewGroups(cfg, lib) });
  });
  r.post('/integrate', (req, res) => {
    const lib = library();
    const results = applyAdoption(cfg, lib, req.body?.decisions ?? []);
    cfg.save();
    touch();
    res.json({ results });
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
      res.json(pushProjectToRepo(cfg, proj.path, repoId ? String(repoId) : undefined, Array.isArray(names) ? names : undefined));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
    const result = importDirs(cfg, dirs, repoId);
    touch();
    res.json(result);
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
      res.json(result);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- sync ----
  r.get('/sync/status', (_req, res) => {
    const lib = library();
    res.json(diffSync(cfg, lib.skills));
  });
  r.post('/sync', (req, res) => {
    const lib = library();
    const only = Array.isArray(req.body?.agents) ? req.body.agents : undefined;
    const results = syncActive(cfg, lib.skills, only);
    res.json(results);
  });

  return r;
}
