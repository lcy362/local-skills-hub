import type { SkillCardView } from '../../api/types';

/** SkillView（手机库技能）→ 统一展示 SkillCardView */
export function skillViewToCard(s: {
  id: string;
  name: string;
  source: string;
  dir: string;
  description?: string;
  tags: string[];
}): SkillCardView {
  return {
    id: s.id,
    name: s.name,
    title: s.name,
    source: s.source,
    dir: s.dir,
    description: s.description,
    tags: s.tags ?? [],
    reason: 'index',
    store: 'own',
    state: 'on',
    actions: [{ kind: 'noop', label: '编辑标签' }],
  };
}