import type { ReactNode } from 'react';
import Segment from '../ui/Segment';
import Tag from '../ui/Tag';
import EmptyState from '../ui/EmptyState';
import { useViewMode, VIEW_MODE_OPTIONS, type ViewMode } from '../../state/viewMode';

/**
 * 通用实体展示契约。
 * 技能、预设、项目、Agent、仓库、来源、整合候选等一切「列表型实体」
 * 都先映射成 EntityItem，再由 EntityList 统一渲染，保证各页面风格一致。
 */
export interface EntityItem {
  id: string;
  /** 主标题 */
  title: ReactNode;
  /** 副标题（路径 / id 等次要信息） */
  sub?: ReactNode;
  /** 描述正文（仅卡片视图展示） */
  desc?: ReactNode;
  /** 状态徽标：卡片右上角 / 列表行右侧 */
  status?: ReactNode;
  /** 附加徽标组：卡片描述下方 / 列表行副标题前 */
  badges?: ReactNode;
  tags?: EntityTag[];
  /** 卡片底部左侧的元信息（来源、路径…） */
  meta?: ReactNode;
  /** 开关类控件：列表行行首 / 卡片底部 */
  toggle?: ReactNode;
  /** 操作按钮组 */
  actions?: ReactNode;
  /** 整块点击（进入详情等） */
  onClick?: () => void;
  /** 置灰（未启用 / 失效） */
  muted?: boolean;
}

export interface EntityTag {
  label: string;
  onClick?: () => void;
}

function clickProps(item: EntityItem) {
  if (!item.onClick) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: item.onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.onClick?.();
      }
    },
  };
}

/** 卡片视图（默认） */
export function EntityCard({ item }: { item: EntityItem }) {
  const tags = item.tags ?? [];
  return (
    <article
      className={`entity-card ${item.muted ? 'is-off' : ''} ${item.onClick ? 'is-clickable' : ''}`}
      {...clickProps(item)}
    >
      <div className="entity-card__head">
        <div style={{ minWidth: 0 }}>
          <h3 className="entity-card__title">{item.title}</h3>
          {item.sub && <div className="entity-card__sub">{item.sub}</div>}
        </div>
        {item.status}
      </div>
      {item.desc && <p className="entity-card__desc">{item.desc}</p>}
      {item.badges && <span className="entity-card__badges">{item.badges}</span>}
      {tags.length > 0 && (
        <span className="entity-card__tags">
          {tags.map((t) => (
            <Tag key={t.label} onClick={t.onClick}>
              {t.label}
            </Tag>
          ))}
        </span>
      )}
      <div className="entity-card__foot">
        <span className="entity-card__meta">{item.meta}</span>
        {item.toggle}
        <span className="entity-row__actions">{item.actions}</span>
      </div>
    </article>
  );
}

/** 列表行视图 */
export function EntityRow({ item }: { item: EntityItem }) {
  const tags = item.tags ?? [];
  return (
    <div
      className={`entity-row ${item.muted ? 'is-off' : ''} ${item.onClick ? 'is-clickable' : ''}`}
      {...clickProps(item)}
    >
      {item.toggle}
      <div className="entity-row__main">
        <div className="entity-row__title">
          {item.title}
          {tags.map((t) => (
            <Tag key={t.label} onClick={t.onClick}>
              {t.label}
            </Tag>
          ))}
        </div>
        <div className="entity-row__sub">
          {item.badges}
          {item.sub}
        </div>
        {item.desc && <div className="entity-row__desc">{item.desc}</div>}
      </div>
      <div className="entity-row__right">
        {item.status}
        <span className="entity-row__actions">{item.actions}</span>
      </div>
    </div>
  );
}

export interface EntityListProps {
  items: EntityItem[];
  /** 区块标题 */
  title?: ReactNode;
  /** 工具栏右侧附加内容（与标题同一行，位于视图切换器左侧） */
  toolbar?: ReactNode;
  /** 是否展示「卡片 / 列表」切换器，默认展示 */
  toggle?: boolean;
  /** 空状态 */
  empty?: ReactNode;
  /** 强制布局（不跟随全局偏好），用于弹窗等固定形态 */
  mode?: ViewMode;
  /** 视图切换器已上移到筛选条时置 true，避免同一页出现两个切换入口 */
  hideToggle?: boolean;
}

/**
 * 通用实体列表容器：默认卡片视图，可切换为列表；
 * 视图偏好全局共享（localStorage），一处切换全站生效。
 */
export default function EntityList({ items, title, toolbar, toggle = true, empty, mode, hideToggle = false }: EntityListProps) {
  const [globalMode, setGlobalMode] = useViewMode();
  const current = mode ?? globalMode;
  const showToggle = toggle && !hideToggle;

  if (items.length === 0) {
    return (
      <>
        {title && <EntityToolbar title={title} toolbar={toolbar} />}
        {empty ?? <EmptyState title="暂无数据" />}
      </>
    );
  }

  return (
    <div>
      {(title || toolbar || showToggle) && (
        <EntityToolbar
          title={title}
          toolbar={toolbar}
          toggle={showToggle ? <Segment<ViewMode> value={current} onChange={setGlobalMode} options={VIEW_MODE_OPTIONS} /> : undefined}
        />
      )}
      <div style={{ marginTop: title || toolbar || showToggle ? 'var(--sp-4)' : 0 }}>
        {current === 'card' ? (
          <div className="entity-grid">
            {items.map((item) => (
              <EntityCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="entity-list">
            {items.map((item) => (
              <EntityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityToolbar({
  title,
  toolbar,
  toggle,
}: {
  title?: ReactNode;
  toolbar?: ReactNode;
  toggle?: ReactNode;
}) {
  return (
    <div className="entity-toolbar">
      {title && <span className="entity-toolbar__title">{title}</span>}
      {toolbar}
      <span style={{ flex: 1 }} />
      {toggle}
    </div>
  );
}
