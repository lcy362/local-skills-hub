import type { SkillCardView, SkillReason, SkillStore } from '../../api/types';
import Badge from '../ui/Badge';

const REASON_LABEL: Record<SkillReason, string> = {
  own: '未收编',
  preset: '预设引入',
  manual: '',
};

const REASON_TITLE: Record<SkillReason, string> = {
  own: '存在于当前 Agent/项目目录、但尚未纳入统一仓库管理，可执行「收编到仓库」',
  preset: '由预设组引入',
  manual: '由用户手动加入',
};

const STORE_LABEL: Partial<Record<SkillStore, string>> = {
  symlink: '软链引用',
  copy: '副本',
};

const STORE_TITLE: Partial<Record<SkillStore, string>> = {
  symlink: '通过软链接引用仓库中的共享副本，不复制文件',
  copy: '仓库中保存了一份独立副本',
};

export { REASON_LABEL, STORE_LABEL };

export function isOn(item: SkillCardView): boolean {
  return item.state === 'on' || item.state === 'own-in-use';
}

export function reasonBadge(item: SkillCardView) {
  const label = REASON_LABEL[item.reason];
  if (!label) return null; // manual 不再作为明显的来源标志展示
  return <Badge tone="accent" title={REASON_TITLE[item.reason]}>{label}</Badge>;
}

export function storeBadge(item: SkillCardView) {
  const label = STORE_LABEL[item.store];
  if (!label) return null; // own/pending 不展示，避免「自建/待待部署」这类含义不明徽标
  return <Badge tone="info" title={STORE_TITLE[item.store]}>{label}</Badge>;
}

/** 状态徽标；state 缺省时返回 null（该上下文无启用/停用语义） */
export function stateBadge(item: SkillCardView) {
  switch (item.state) {
    case 'on':
      return (
        <Badge tone="good" dot="good" title="已启用，Agent/项目正在使用">
          启用
        </Badge>
      );
    case 'own-in-use':
      return (
        <Badge tone="info" dot="good" title="由本地目录自维护并使用">
          使用中
        </Badge>
      );
    case 'off':
      return (
        <Badge tone="neutral" dot="neutral" title="此技能当前未启用">
          未启用
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * 统一渲染 reason / store / preset 三个徽标（卡片与列表行共用）。
 * 不含 state —— 状态由 EntityItem.status 单独展示在卡片右上角 / 行右侧。
 */
export function skillBadges(item: SkillCardView) {
  return (
    <>
      {reasonBadge(item)}
      {storeBadge(item)}
      {item.preset && <Badge tone="accent">{item.preset}</Badge>}
    </>
  );
}
