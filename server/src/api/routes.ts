import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ConfigStore } from '../config/store.js';
import { listAgents } from '../core/agents.js';
import { scanAll } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive } from '../core/sync.js';
import { previewGroups, applyAdoption } from '../core/integrate.js';
import { addProject, syncProject } from '../core/projects.js';
import { Repo, ForeignSource } from '../config/types.js';

export function makeRouter(cfg: ConfigStore): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));

  const library = () => scanAll(cfg.data.repos, cfg.data.foreignSources);

  r.get('/state', (_req, res) => {
    const lib = library();
    const skills = lib.skills.map((s) => ({
      id: s.id, name: s.name, source: s.source, dir: s.dir,
      description: s.description, version: s.version,
      tags: cfg.data.skillMeta[s.id]?.tags ?? [],
    }));
    res.json({ activeAgents: cfg.data.activeAgents, skills, presets: cfg.data.presets });
  });

  // ---- repos ----
  r.get('/repos', (_req, res) => res.json(cfg.data.repos));
  r.post('/repos', (req, res) => {
    const { id, path: p, layout } = req.body as Repo;
    if (!id || !p) return res.status(400).json({ error: 'id/path required' });
    if (cfg.data.repos.some((x) => x.id === id)) return res.status(409).json({ error: `repo ${id} 已存在` });
    cfg.data.repos.push({ id, path: p, layout: layout ?? 'flat' });
    cfg.save();
    res.json(cfg.data.repos);
  });
  r.delete('/repos/:id', (req, res) => {
    cfg.data.repos = cfg.data.repos.filter((x) => x.id !== req.params.id);
    cfg.save();
    res.json(cfg.data.repos);
  });
  r.post('/repos/scan/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(scanAll([repo], []));
  });

  // ---- foreign sources ----
  r.get('/sources', (_req, res) => res.json(cfg.data.foreignSources));
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource;
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    cfg.data.foreignSources.push({ ...body, layout: body.layout ?? 'nested', linked: body.linked ?? true });
    cfg.save();
    res.json(cfg.data.foreignSources);
  });
  r.delete('/sources/:id', (req, res) => {
    cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== req.params.id);
    cfg.save();
    res.json(cfg.data.foreignSources);
  });

  // ---- agents / active ----
  r.get('/agents', (_req, res) => res.json(listAgents(cfg.data)));
  r.put('/agents/:key', (req, res) => {
    const key = req.params.key;
    const over = cfg.data.agents[key] ?? {};
    const { sync, globalDir } = req.body ?? {};
    if (sync) over.sync = sync;
    if (globalDir) over.globalDir = globalDir;
    cfg.data.agents[key] = over;
    cfg.save();
    res.json(cfg.data.agents[key]);
  });
  r.get('/activeAgents', (_req, res) => res.json(cfg.data.activeAgents));
  r.put('/activeAgents', (req, res) => {
    const keys = Array.isArray(req.body) ? req.body : req.body?.agents;
    res.json(active.set(cfg, keys ?? []));
  });

  // ---- skills / tags ----
  r.patch('/skills/:id', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const meta = cfg.data.skillMeta[id] ?? { tags: [] };
    if (Array.isArray(req.body?.tags)) meta.tags = req.body.tags;
    cfg.data.skillMeta[id] = meta;
    cfg.save();
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

  // ---- sync ----
  r.post('/sync', (req, res) => {
    const lib = library();
    const only = Array.isArray(req.body?.agents) ? req.body.agents : undefined;
    const results = syncActive(cfg, lib.skills, only);
    res.json(results);
  });

  return r;
}
