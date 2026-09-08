import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ConfigStore } from '../config/store.js';
import { listAgents, agentSkillRows, findBuiltin, resolveGlobalDir } from '../core/agents.js';
import { scanAll, detectLayoutAbs } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive, diffSync, computeDesired, desiredContext } from '../core/sync.js';
import { previewGroups, applyAdoption, collectCandidates } from '../core/integrate.js';
import { addProject, syncProject } from '../core/projects.js';
import { importDirs, previewImportDirs } from '../core/import.js';
import { previewCollect, collectAgentSkill } from '../core/collect.js';
import { readTags, writeTags } from '../core/repo-tags.js';
import { diagnose } from '../core/diagnose.js';
import { pickDirectory, pickFile } from '../core/picker.js';
import { Repo, ForeignSource } from '../config/types.js';

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));
  // 结构性变更后自动同步活跃 agent（无需点「立即同步」），由入口注入实现
  const touch = () => opts?.onChanged?.();

  const library = () => scanAll(cfg.data.repos, cfg.data.foreignSources);

  r.get('/state', (_req, res) => {
    const lib = library();
    const repoOf = (src: string) => cfg.data.repos.find((x) => x.id === src);
    const skills = lib.skills.map((s) => {
      const repo = repoOf(s.source);
      // 有显式标签来源配置的仓库：以所选来源为唯一基准；否则兼容旧行为读 config.skillMeta
      const tags = repo?.tags ? readTags(repo, s.name, s.dir) : cfg.data.skillMeta[s.id]?.tags ?? s.tags;
      return {
        id: s.id, name: s.name, source: s.source, dir: s.dir,
        description: s.description, version: s.version,
        tags,
      };
    });
    res.json({ activeAgents: cfg.data.activeAgents, skills, presets: cfg.data.presets });
  });

  // ---- filesystem ----
  r.post('/filesystem/pick', (_req, res) => {
    try { res.json({ path: pickDirectory() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  r.post('/filesystem/pick-file', (_req, res) => {
    try { res.json({ path: pickFile() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- repos ----
  r.get('/repos', (_req, res) => res.json(cfg.data.repos));
  r.post('/repos', (req, res) => {
    const { id, path: p, layout, root, tags } = req.body as Repo;
    if (!id || !p) return res.status(400).json({ error: 'id/path required' });
    if (cfg.data.repos.some((x) => x.id === id)) return res.status(409).json({ error: `repo ${id} 已存在` });
    cfg.data.repos.push({ id, path: p, layout: layout ?? 'flat', root: root ?? undefined, tags: tags ?? undefined });
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
  r.put('/repos/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const { tags, layout } = req.body ?? {};
    if ('tags' in (req.body ?? {})) repo.tags = tags ?? undefined;
    if (layout) repo.layout = layout;
    cfg.save();
    res.json(cfg.data.repos);
  });
  r.post('/repos/scan/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(scanAll([repo], []));
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
    const { agentKey, names } = req.body ?? {};
    if (!agentKey) return res.status(400).json({ error: 'agentKey required' });
    try { res.json(collectAgentSkill(cfg, repo, agentKey, names)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ---- foreign sources ----

  r.get('/sources', (_req, res) => res.json(cfg.data.foreignSources));
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource;
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    cfg.data.foreignSources.push({ ...body, layout: body.layout ?? 'nested', linked: body.linked ?? true });
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

  // ---- agents / active ----
  r.get('/agents', (_req, res) => res.json(listAgents(cfg.data)));
  r.put('/agents/:key', (req, res) => {
    const key = req.params.key;
    const over = cfg.data.agents[key] ?? {};
    const body = req.body ?? {};
    const { sync, globalDir } = body;
    if (sync) over.sync = sync;
    if (globalDir) over.globalDir = globalDir;
    if ('mode' in body && body.mode) over.mode = body.mode;
    if ('preset' in body) { if (body.preset) over.preset = body.preset; else delete over.preset; }
    const setList = (field: 'explicitOn' | 'explicitOff') => {
      if (field in body) { const list = Array.isArray(body[field]) ? body[field] : []; if (list.length) over[field] = list; else delete over[field]; }
    };
    setList('explicitOn'); setList('explicitOff');
    cfg.data.agents[key] = over;
    cfg.save();
    // 管理模式相关变更：若该 agent 活跃则自动同步，否则等用户主动同步
    if (cfg.data.activeAgents.includes(key)) touch();
    res.json(cfg.data.agents[key]);
  });
  r.get('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    const lib = library();
    const ctx = desiredContext(cfg, lib.skills, key);
    const rows = agentSkillRows(key, cfg.data, lib.skills, ctx);
    // 可添加候选：资产库里尚未加入本 agent（不在显式开启，也不在期望集，也未物理存在）的技能
    const present = new Set(rows.filter((x) => x.present).map((x) => x.name));
    const inDesired = new Set(rows.filter((x) => x.wanted).map((x) => x.name));
    const addable = lib.skills
      .filter((s) => !inDesired.has(s.name) && !present.has(s.name) && !ctx.onNames.has(s.name))
      .map((s) => ({ id: s.id, name: s.name, repo: s.source }));
    res.json({ skills: rows, addable, active: cfg.data.activeAgents.includes(key) });
  });
  r.post('/agents/:key/sync', (req, res) => {
    const key = req.params.key;
    const r_ = syncActive(cfg, library().skills, [key]);
    res.json(r_[0] ?? { agent: key, created: [], removed: [], failed: [] });
  });
  // 删除 agent 技能目录中的某个技能（自带 or 残留 managed）：必须是「非期望」才可删
  r.delete('/agents/:key/skills/:skillName', (req, res) => {
    const key = req.params.key;
    const name = req.params.skillName;
    const def = findBuiltin(key);
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
  r.get('/activeAgents', (_req, res) => res.json(cfg.data.activeAgents));
  r.put('/activeAgents', (req, res) => {
    const keys = Array.isArray(req.body) ? req.body : req.body?.agents;
    const out = active.set(cfg, keys ?? []);
    touch();
    res.json(out);
  });

  // ---- skills / tags ----
  r.patch('/skills/:id', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    if (!Array.isArray(req.body?.tags)) return res.status(400).json({ error: 'tags required' });
    const tags = req.body.tags;
    // name@source 拆出：source 可能是仓库 id
    const at = id.lastIndexOf('@');
    const source = at >= 0 ? id.slice(at + 1) : '';
    const repo = cfg.data.repos.find((x) => x.id === source);
    // 显式标签来源的仓库：写回所选来源载体（以来源为唯一基准）
    if (repo?.tags) {
      const lib = library();
      const skill = lib.skills.find((s) => s.id === id);
      if (skill && writeTags(repo, skill.name, skill.dir, tags)) { touch(); return res.json({ tags, via: 'source' }); }
      // 载体写回失败（如 SKILL.md 无 frontmatter）→ 回退 config 覆盖
    }
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
    try { res.json(presets.create(cfg, String(req.body?.name))); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/presets/:name', (req, res) => {
    try {
      const p = presets.update(cfg, req.params.name, req.body ?? {});
      // 预设变更 → 触发式同步（仅活跃 agent）
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

  // ---- integrate (收编/初始整合) ----
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
    res.json(cfg.data.projects.map((p) => ({ ...p, hasAgents: fs.existsSync(path.join(p.path, '.agents', 'skills')) })));
  });
  r.post('/projects', (req, res) => {
    try {
      addProject(cfg, String(req.body?.path), Array.isArray(req.body?.tags) ? req.body.tags : []);
      res.json(cfg.data.projects);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/projects/:id/tags', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    if (Array.isArray(req.body?.tags)) proj.tags = req.body.tags;
    cfg.save();
    res.json(proj);
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
  r.post('/import/preview', (req, res) => {
    const dirs = Array.isArray(req.body?.dirs) ? req.body.dirs : [];
    res.json(previewImportDirs(dirs));
  });
  r.post('/import', (req, res) => {
    const dirs = Array.isArray(req.body?.dirs) ? req.body.dirs : [];
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
