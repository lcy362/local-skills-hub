import type { AgentSkillRow } from '../core/agents.js';
import type { ProjectSkillRow } from '../core/projects.js';

/* ---------- SkillCardView（前端 api/types.ts 契约） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'tag' | 'index';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
export type SkillActionKind = 'toggle' | 'enable' | 'disable' | 'collect' | 'merge' | 'delete' | 'clean' | 'noop';
export type SkillState = 'on' | 'wanted-pending' | 'off' | 'off-override' | 'residual' | 'own-in-use';

export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason; store: SkillStore; state: SkillState;
  offOverride?: boolean; linkTarget?: string; preset?: string; actions: SkillAction[];
}

interface CommonRow { wanted: boolean; present: boolean; store: SkillStore; reason: SkillReason; offOverride?: boolean }

const action = (kind: SkillActionKind, label: string, extra: Partial<SkillAction> = {}): SkillAction => ({ kind, label, ...extra });

/** 由 wanted × present × offOverride 推导 state */
function stateOf(r: CommonRow): SkillState {
  if (r.reason === 'own') return 'own-in-use';
  if (r.wanted && r.present) return 'on';
  if (r.wanted && !r.present) return 'wanted-pending';
  return r.offOverride ? 'off-override' : 'residual';
}

/** 依据 reason+store+state 推导可执行操作 */
function acts(r: CommonRow): SkillAction[] {
  if (r.reason === 'own') {
    return [
      action('collect', '收编到仓库'),
      action('merge', '合并保留'),
      action('delete', '删除', { title: '移除本地技能目录' }),
    ];
  }
  if (r.store === 'pending' && r.wanted) return [action('noop', '待同步', { disabled: true, title: '将在下次同步时部署' })];
  if (r.offOverride) return [action('enable', '启用'), action('delete', '删除')];
  if (!r.wanted) return [action('clean', '清理')];
  return [action('toggle', '停用')];
}

/** agent 上下文行 → SkillCardView */
export function agentCard(row: AgentSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: row.reason, offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: row.reason, store: row.store, state: stateOf(r),
    offOverride: row.offOverride, linkTarget: row.linkTarget, preset: row.preset,
    actions: acts(r),
  };
}

export function agentCards(rows: AgentSkillRow[]): SkillCardView[] { return rows.map(agentCard); }

/** 项目上下文行 → SkillCardView */
export function projectCard(row: ProjectSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: row.reason, offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: row.reason, store: row.store, state: stateOf(r),
    offOverride: row.offOverride,
    actions: acts(r),
  };
}

export function projectCards(rows: ProjectSkillRow[]): SkillCardView[] { return rows.map(projectCard); }