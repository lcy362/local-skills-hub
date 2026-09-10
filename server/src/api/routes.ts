import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ConfigStore } from '../infra/config-store.js';
import { pickDirectory, pickFile } from '../infra/picker.js';
import { listAgents, agentSkillRows, findBuiltin, resolveGlobalDir, expandTilde } from '../core/agents.js';
import { scanAll, detectLayoutAbs } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive, diffSync, computeDesired, desiredContext } from '../core/sync.js';
import { previewGroups, applyAdoption, collectCandidates } from '../core/integrate.js';
import { addProject, syncProject, projectSkillRows, projectAddable, deployedAgents } from '../core/projects.js';
import { importDirs, previewImportDirs } from '../core/import.js';
import { previewCollect, collectAgentSkill } from '../core/collect.js';
import { readTags, writeTags, migrateTagsToFrontmatter } from '../core/repo-tags.js';
import { takeover } from '../core/takeover.js';
import { renameTag, mergeTag, tagConsistency } from '../core/tag-ops.js';
import { applyFix } from '../core/fix.js';
import { diagnose } from '../core/diagnose.js';
import { Repo, ForeignSource } from '../config/types.js';
import { agentCards, projectCards } from '../domain/cards.js';
import { getOnboardState, importAsRepo, collectOnboard, mergeSkill } from '../domain/onboarding.js';

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));
  // 结构性变更后自动同步活跃 agent，由入口注入实现
  const touch = () => opts?.onChanged?.();

  const library = () => scanAll(cfg.data.repos, cfg.data.foreignSources);

  /** 第三方库标签：honor tagSystems 开关。hub(仓库内/外文件)优先，其次 upstream(frontmatter)。默认 auto=可探测即启。 */
  const foreignSkillTags = (f: ForeignSource, s: { tags: string[]; name: string }): string[] => {
    const up = f.tagSystems?.upstream ?? true;
    const hubEnabled = f.tagSystems?.hub ?? false;
    if (hubEnabled) {
      try {
        const file = path.join(expandTilde(f.path), '.claude-plugin', 'marketplace.json');
        if (!fs.existsSync(file)) return up ? s.tags : [];
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (Array.isArray(raw?.plugins)) {
          const hit = raw.plugins.find((p: { name?: string }) => p?.name === s.name);
          if (hit?.keywords) return hit.keywords.map(String);
        }
      } catch { /* ignore */ }
    }
    if (up) return s.tags;
    return [];
  };

  r.get('/state', (_req, res) => {
    const lib = library();
    const repoOf = (src: string) => cfg.data.repos.find((x) => x.id === src);
    const skills = lib.skills.map((s) => {
      const repo = repoOf(s.source);
      let tags: string[];
      if (repo) {
        tags = repo?.tags ? readTags(repo, s.name, s.dir) : cfg.data.skillMeta[s.id]?.tags ?? s.tags;
      } else if (s.source.startsWith('ext:')) {
        const f = cfg.data.foreignSources.find((x) => x.id === s.source.slice(4));
        tags = f ? foreignSkillTags(f, s) : cfg.data.skillMeta[s.id]?.tags ?? s.tags;
      } else {
        tags = cfg.data.skillMeta[s.id]?.tags ?? s.tags;
      }
      return {
        id: s.id, name: s.name, source: s.source, dir: s.dir,
        description: s.description, version: s.version,
        tags,
      };
    });
    res.json({
      onboarded: cfg.data.onboarded ?? false,
      activeAgents: cfg.data.activeAgents,
      skills,
      presets: cfg.data.presets,
      repos: cfg.data.repos,
      sources: cfg.data.foreignSources,
    });
  });

  // ---- onboarding 首启引导 ----
  r.get('/onboarding', (_req, res) => res.json(getOnboardState(cfg)));
  r.post('/onboarding/import', (req, res) => {
    const { path: p, agent } = req.body ?? {};
    if (!p) return res.status(400).json({ error: 'path required' });
    try {
      const result = importAsRepo(cfg, String(p), agent);
      touch();
      res.json(result);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.post('/onboarding/collect', (req, res) => {
    const { repoId, decisions, agent } = req.body ?? {};
    // 兼容两种调用：{decisions}（明细）或 {agent}（整 agent 归集）
    const decs = Array.isArray(decisions)
      ? decisions
      : agent
        ? [{ agent, name: '' }]
        : [];
    const rid = repoId ?? cfg.data.repos[0]?.id;
    if (!rid) return res.status(400).json({ error: 'repoId required' });
    try {
      const result = collectOnboard(cfg, String(rid), decs);
      touch();
      res.json(result);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.post('/skills/merge', (req, res) => {
    const { name, keepSource } = req.body ?? {};
    if (!name || !keepSource) return res.status(400).json({ error: 'name/keepSource required' });
    try {
      const result = mergeSkill(cfg, library().skills, String(name), String(keepSource));
      touch();
      res.json(result);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
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

  // 自有仓库标签迁移到 SKILL.md frontmatter（PRD 流程三-A）
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
    const { agentKey, names } = req.body ?? {};
    if (!agentKey) return res.status(400).json({ error: 'agentKey required' });
    try { res.json(collectAgentSkill(cfg, repo, agentKey, names)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // 接管：把 agent 源 skill 替换为指向仓库副本的软链（源改名备份，需显式 confirm）
  r.post('/repos/:id/takeover', (req, res) => {
    const { agentKey, name, confirm } = req.body ?? {};
    if (!agentKey || !name) return res.status(400).json({ error: 'agentKey/name required' });
    res.json(takeover(cfg, String(agentKey), String(name), req.params.id, confirm === true));
  });

  // ---- foreign sources ----

  r.get('/sources', (_req, res) => {
    // 附带两套标签体系的可探测性：upstream=frontmatter 自带；hub=仓库内 marketplace.json
    res.json(cfg.data.foreignSources.map((f) => {
      let upstream = false;
      try { upstream = scanAll([], [f]).skills.some((s) => (s.tags ?? []).length > 0); } catch { /* ignore */ }
      const hub = fs.existsSync(path.join(expandTilde(f.path), '.claude-plugin', 'marketplace.json'));
      return { ...f, detected: { tagSystems: { upstream, hub } } };
    }));
  });
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource;
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    cfg.data.foreignSources.push({
      ...body,
      layout: body.layout ?? 'nested',
      linked: body.linked ?? true,
      tagSystems: body.tagSystems ?? undefined,
    });
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources);
  });
  r.put('/sources/:id/tags', (req, res) => {
    const s = cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'source not found' });
    const b = req.body ?? {};
    s.tagSystems = {
      upstream: typeof b.upstream === 'boolean' ? b.upstream : (s.tagSystems?.upstream ?? true),
      hub: typeof b.hub === 'boolean' ? b.hub : (s.tagSystems?.hub ?? false),
    };
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources.find((x) => x.id === req.params.id));
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
    const { sync, globalDir, projectDir } = body;
    if (sync) over.sync = sync;
    if (globalDir) over.globalDir = globalDir;
    if (projectDir) over.projectDir = projectDir;
    if ('mode' in body && body.mode) over.mode = body.mode;
    if ('preset' in body) { if (body.preset) over.preset = body.preset; else delete over.preset; }
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
    const at = id.lastIndexOf('@');
    const source = at >= 0 ? id.slice(at + 1) : '';
    const repo = cfg.data.repos.find((x) => x.id === source);
    if (repo?.tags) {
      const lib = library();
      const skill = lib.skills.find((s) => s.id === id);
      if (skill && writeTags(repo, skill.name, skill.dir, tags)) { touch(); return res.json({ tags, via: 'source' }); }
    }
    const meta = cfg.data.skillMeta[id] ?? { tags: [] };
    meta.tags = tags;
    cfg.data.skillMeta[id] = meta;
    cfg.save();
    touch();
    res.json(meta);
  });

  // ---- 标签元操作 ----
  r.get('/tags/consistency', (_req, res) => res.json({ issues: tagConsistency(cfg) }));
  r.post('/tags/rename', (req, res) => {
    const { oldTag, newTag } = req.body ?? {};
    if (!oldTag || !newTag) return res.status(400).json({ error: 'oldTag/newTag required' });
    try { res.json(renameTag(cfg, String(oldTag), String(newTag))); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.post('/tags/merge', (req, res) => {
    const { target, absorb } = req.body ?? {};
    if (!target || !absorb) return res.status(400).json({ error: 'target/absorb required' });
    try { res.json(mergeTag(cfg, String(target), String(absorb))); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  // ---- presets ----
  r.get('/presets', (_req, res) => res.json(cfg.data.presets));
  r.post('/presets', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const p = presets.create(cfg, name);
      // 兼容前端一次传入 skills/active
      if (Array.isArray(req.body?.skills)) p.skills = req.body.skills;
      if (typeof req.body?.active === 'boolean') p.active = req.body.active;
      cfg.save();
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
  r.post('/import/preview', (req, res) => {
    // 兼容 {dirs:[]} 与 {path} / ?path=
    const dirs = Array.isArray(req.body?.dirs)
      ? req.body.dirs
      : req.body?.path
        ? [req.body.path]
        : req.query?.path
          ? [String(req.query.path)]
          : [];
    res.json(previewImportDirs(dirs));
  });
  r.post('/import', (req, res) => {
    const dirs = Array.isArray(req.body?.dirs) ? req.body.dirs : req.body?.path ? [req.body.path] : [];
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