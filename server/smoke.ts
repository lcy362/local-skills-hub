import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
process.env.SKILLS_HUB_CONFIG = path.join(base, 'config.json');

const { ConfigStore } = await import('./src/config/store.js');
const { scanAll } = await import('./src/core/scanner.js');
const { syncActive } = await import('./src/core/sync.js');
import * as presets from './src/core/presets.js';
import * as active from './src/core/active.js';

const store = new ConfigStore();
const cfg = store.data;

// 临时仓库：skills/alpha（扁平）+ skills/分类/beta（嵌套） 测试 auto 布局
const repoDir = path.join(base, 'repo');
const mkSkill = (d, name) => { fs.mkdirSync(path.join(d, name), { recursive: true }); fs.writeFileSync(path.join(d, name, 'SKILL.md'), `---\nname: ${name}\ndescription: 测试skill ${name}\nversion: 1.0.0\n---\n正文`); };
mkSkill(path.join(repoDir, 'skills'), 'alpha');
mkSkill(path.join(repoDir, 'skills', 'devops'), 'beta');

cfg.repos.push({ id: 'default', path: repoDir, layout: 'auto' });

// 外部来源：嵌套分类（模拟 ume-skills）
const extDir = path.join(base, 'ext');
mkSkill(path.join(extDir, 'skills', 'frontend'), 'gamma');
cfg.foreignSources.push({ id: 'ume', name: 'ume-skills', path: extDir, layout: 'nested', linked: true });

// 活跃 agent 目标目录（用覆盖指到临时目录，避免污染真实 ~/.trae-cn）
const targetDir = path.join(base, 'agent-tmp');
cfg.agents['trae-cn'] = { globalDir: targetDir, sync: 'symlink' };
store.save();

const lib = scanAll(cfg.repos, cfg.foreignSources);
console.log('发现 skills =', lib.skills.map((s) => s.id).sort());

const alpha = lib.skills.find((s) => s.name === 'alpha');
presets.create(store, 'demo');
presets.update(store, 'demo', { skills: [alpha.id] });
presets.setActive(store, 'demo', true);
active.set(store, ['trae-cn']);

// 直接调同步引擎（不经过 HTTP）
const results = syncActive(store, lib.skills);
console.log('同步结果 =', JSON.stringify(results, null, 2));

const link = path.join(targetDir, 'alpha');
const isLink = fs.lstatSync(link).isSymbolicLink();
console.log('校验软链:', path.basename(link), 'isSymlink=', isLink, '→', fs.readdirSync(targetDir));
console.log(isLink && fs.readdirSync(link).includes('SKILL.md') ? '✅ 最小闭环通过' : '❌ 失败');

// ---- 批次1: 收编 smoke ----
{
  const lib2 = scanAll(store.data.repos, store.data.foreignSources);
  const { previewGroups, applyAdoption } = await import('./src/core/integrate.js');
  const groups = previewGroups(store, lib2);
  console.log('\n[integrate] 候选分组 =', groups.map((g) => `${g.name}(${g.candidates.map((c) => c.source).join(',')})`).join(' ; '));
  const res = applyAdoption(store, lib2, [
    { name: 'gamma', selectId: 'gamma#ext:ume' },
  ]);
  console.log('[integrate] 收编 =', JSON.stringify(res, null, 2));
  const adopted = path.join(repoDir, 'skills', 'gamma');
  console.log('收编后仓库含 gamma =', fs.existsSync(path.join(adopted, 'SKILL.md')));
}

// ---- 批次2: 项目级 skill smoke ----
{
  const { addProject, syncProject } = await import('./src/core/projects.js');
  const projBase = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-proj-'));
  addProject(store, projBase, ['frontend']);
  // 给 gamma 打 frontend 标签（gamma 已在仓库内）
  store.data.skillMeta['alpha@default'] = { tags: ['frontend'] };
  store.save();
  const lib3 = scanAll(store.data.repos, store.data.foreignSources);
  const res = syncProject(store, projBase, lib3.skills);
  console.log('\n[project] .agents 复制 =', res.copied, '| agent项目目录软链 =', res.agentLinks.map((x) => `${x.agent}`).join(','));
  const ag = path.join(projBase, '.agents', 'skills');
  console.log('.agents 内容 =', fs.existsSync(ag) ? fs.readdirSync(ag) : 'none');
  // 校验某 agent 项目目录软链
  const traeLink = path.join(projBase, '.trae', 'skills');
  console.log('.trae/skills 内容 =', fs.existsSync(traeLink) ? fs.readdirSync(traeLink).map((n) => `${n}(link=${fs.lstatSync(path.join(traeLink, n)).isSymbolicLink()})`) : 'none');
  if (fs.existsSync(ag) && fs.readdirSync(ag).includes('alpha')) console.log('✅ 项目级同步通过');
  else console.log('❌ 项目级同步失败');
}

// ---- 批次3: 批量导入 + 诊断 smoke ----
{
  const { importDirs } = await import('./src/core/import.js');
  const ext2Dir = path.join(base, 'ext2');
  mkSkill(path.join(ext2Dir, 'skills', 'viz'), 'echarts');
  mkSkill(path.join(ext2Dir, 'skills', 'viz'), 'd3');
  const imp = importDirs(store, [ext2Dir], 'default');
  console.log('\n[import] =', JSON.stringify(imp, null, 2));
  const { diagnose } = await import('./src/core/diagnose.js');
  const diag = diagnose(store);
  console.log('[diagnose] 项数 =', diag.items.length, '| config =', diag.config);
  console.log('仓库含新技能 echarts =', fs.existsSync(path.join(repoDir, 'skills', 'echarts', 'SKILL.md')));
}
