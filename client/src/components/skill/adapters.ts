import type { SkillAction, SkillCardView } from '../../api/types';

/** SkillView（资产库技能）→ 统一展示 SkillCardView */
export function skillViewToCard(
  s: {
    id: string;
    name: string;
    source: string;
    dir: string;
    description?: string;
    tags: string[];
  },
  actions: SkillAction[] = []
): SkillCardView {
  return {
    id: s.id,
    name: s.name,
    title: s.name,
    source: s.source,
    dir: s.dir,
    description: s.description,
    tags: s.tags ?? [],
    reason: 'manual',
    store: 'own',
    state: 'on',
    actions,
  };
}
