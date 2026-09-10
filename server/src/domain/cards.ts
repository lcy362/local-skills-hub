import type { AgentSkillRow } from '../core/agents.js';
import type { ProjectSkillRow } from '../core/projects.js';

/* ---------- SkillCardView（前端 api/types.ts 契约） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
export type SkillActionKind = 'toggle' | 'collect' | 'merge' | 'delete';
export type SkillState = 'on' | 'off' | 'own-in-use';

export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason; store: SkillStore; state: SkillState;
  offOverride?: boolean; linkTarget?: string; preset?: string; actions: SkillAction[];
}

interface CommonRow { wanted: boolean; present: boolean; store: SkillStore; reason: SkillReason; offOverride?: boolean }

const action = (kind: SkillActionKind, label: string, extra: Partial<SkillAction> = {}): SkillAction => ({ kind, label, ...extra });

/** 归一化来源原因：项目行的 tag/index 归并为 manual（其对操作/展示无差异化影响），preset/manual/own 保留 */
function normReason(r: string): SkillReason {
  if (r === 'preset' || r === 'manual' || r === 'own') return r;
  return 'manual';
}

/** 由 wanted × reason 推导 state：自带 → 使用中；期望 → 启用；否则未启用 */
function stateOf(r: CommonRow): SkillState {
  if (r.reason === 'own') return 'own-in-use';
  return r.wanted ? 'on' : 'off';
}

/** 依据 reason 推导可执行操作（对应 PRD 收编/去重/取消分发） */
function acts(r: CommonRow): SkillAction[] {
  if (r.reason === 'own') {
    return [
      action('collect', '收编到仓库', { title: '把该技能复制进统一仓库，供各 Agent/项目共享' }),
      action('merge', '合并保留', { title: '多个同名版本时，保留并合并该来源' }),
      action('delete', '删除', { title: '移除本地技能目录' }),
    ];
  }
  return [action('toggle', r.wanted ? '停用' : '启用', { title: r.wanted ? '停用此技能（取消分发）' : '启用此技能' })];
}

/** agent 上下文行 → SkillCardView */
export function agentCard(row: AgentSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: normReason(row.reason), offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: r.reason, store: row.store, state: stateOf(r),
    offOverride: row.offOverride, linkTarget: row.linkTarget, preset: row.preset,
    actions: acts(r),
  };
}

export function agentCards(rows: AgentSkillRow[]): SkillCardView[] { return rows.map(agentCard); }

/** 项目上下文行 → SkillCardView */
export function projectCard(row: ProjectSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: normReason(row.reason), offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: r.reason, store: row.store, state: stateOf(r),
    offOverride: row.offOverride,
    actions: acts(r),
  };
}

export function projectCards(rows: ProjectSkillRow[]): SkillCardView[] { return rows.map(projectCard); }