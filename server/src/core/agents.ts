import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { HubConfig } from '../config/types.js';

export type ToolCategory = 'coding' | 'lobster';

export interface AgentDef {
  key: string;
  name: string;
  /** 相对 home 的全局目录 */
  global: string;
  /** 项目级相对目录，可空 */
  project?: string;
  category: ToolCategory;
  family?: string;
  /** 是否读取共享 ~/.agents 或 ~/.config/agents（仅发现/部署共享） */
  shared?: 'agents' | 'config-agents';
  recursive?: boolean;
}

// 对照 PRD §5.2.1（以 skills-manager 为准 + pks 补齐）
export const builtinAgents: AgentDef[] = [
  { key: 'cursor', name: 'Cursor', global: '.cursor/skills', project: '.cursor/skills', category: 'coding' },
  { key: 'claude', name: 'Claude Code', global: '.claude/skills', project: '.claude/skills', category: 'coding' },
  { key: 'opencode', name: 'OpenCode', global: '.config/opencode/skills', project: '.opencode/skills', category: 'coding' },
  { key: 'codex', name: 'Codex CLI', global: '.codex/skills', project: '.codex/skills', category: 'coding', shared: 'agents' },
  { key: 'github_copilot', name: 'GitHub Copilot', global: '.copilot/skills', project: '.copilot/skills', category: 'coding', shared: 'agents' },
  { key: 'grok', name: 'Grok', global: '.grok/skills', project: '.grok/skills', category: 'coding' },
  { key: 'trae', name: 'TRAE IDE', global: '.trae/skills', project: '.trae/skills', category: 'coding', family: 'TRAE' },
  { key: 'trae-cn', name: 'TRAE CN', global: '.trae-cn/skills', project: '.trae-cn/skills', category: 'coding', family: 'TRAE' },
  { key: 'qoder', name: 'Qoder', global: '.qoder/skills', project: '.qoder/skills', category: 'coding', family: 'Qoder' },
  { key: 'qwen-code', name: 'Qwen Code', global: '.qwen/skills', project: '.qwen/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderwork', name: 'QoderWork(国际)', global: '.qoderwork/skills', project: '.qoderwork/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderworkcn', name: 'QoderWork(国内)', global: '.qoderworkcn/skills', project: '.qoderworkcn/skills', category: 'coding', family: 'Qoder' },
  { key: 'codebuddy', name: 'CodeBuddy', global: '.codebuddy/skills', project: '.codebuddy/skills', category: 'coding' },
  { key: 'windsurf', name: 'Windsurf', global: '.codeium/windsurf/skills', project: '.windsurf/skills', category: 'coding' },
  { key: 'clawdbot', name: 'Clawdbot', global: '.clawdbot/skills', project: '.clawdbot/skills', category: 'coding', family: 'Claw' },
  { key: 'gemini-cli', name: 'Gemini CLI', global: '.gemini/skills', project: '.gemini/skills', category: 'coding' },
  { key: 'kilo-code', name: 'Kilo Code', global: '.kilocode/skills', category: 'coding' },
  { key: 'roo-code', name: 'Roo Code', global: '.roo/skills', category: 'coding' },
  { key: 'goose', name: 'Goose', global: '.config/goose/skills', category: 'coding' },
  { key: 'amp', name: 'Amp', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'replit', name: 'Replit', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'cline', name: 'Cline', global: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'warp', name: 'Warp', global: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'droid', name: 'Droid', global: '.factory/skills', category: 'coding' },
  { key: 'hermes', name: 'Hermes Agent', global: '.hermes/skills', category: 'lobster', family: 'Claw', recursive: true },
  { key: 'openclaw', name: 'OpenClaw', global: '.openclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'qclaw', name: 'QClaw', global: '.qclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'easyclaw', name: 'EasyClaw', global: '.easyclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'workbuddy', name: 'WorkBuddy', global: '.workbuddy/skills', category: 'lobster', family: 'Claw' },
  { key: 'reasonix', name: 'DeepSeek Reasonix', global: '.reasonix/skills', project: '.reasonix/skills', category: 'coding' },
  { key: 'teamwork', name: 'Teamwork', global: 'teamwork/skills', project: 'teamwork/skills', category: 'lobster' },
];

export function findBuiltin(key: string): AgentDef | undefined {
  return builtinAgents.find((a) => a.key === key);
}

export function resolveGlobalDir(def: AgentDef, override?: string): string {
  if (override) return expandTilde(override);
  return path.join(os.homedir(), def.global);
}
export function resolveProjectDir(def: AgentDef, cwd: string, override?: string): string | undefined {
  if (!def.project) return undefined;
  if (override) return path.join(cwd, override);
  return path.join(cwd, def.project);
}

export function expandTilde(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(2)) : p;
}

export interface AgentView extends AgentDef {
  globalDir: string;
  installed: boolean;
  sync: string;
  active: boolean;
  layers?: string[];
}

export function listAgents(cfg: HubConfig): AgentView[] {
  return builtinAgents
    .map((def) => {
      const ov = cfg.agents[def.key];
      const globalDir = resolveGlobalDir(def, ov?.globalDir);
      const installed = fs.existsSync(globalDir);
      const sync = ov?.sync ?? cfg.defaultSync;
      const active = cfg.activeAgents.includes(def.key);
      return {
        ...def,
        globalDir,
        installed,
        sync,
        active,
        layers: def.shared ? [def.shared] : undefined,
      };
    })
    .sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.installed ? 1 : 0) - (a.installed ? 1 : 0));
}
