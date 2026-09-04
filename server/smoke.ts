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
