import { useState } from 'react';
import { api, type AgentView, type AgentSkillsResp, type SkillAction, type SkillCardView, type AddableSkill } from '../api/types';
import SkillList from '../components/skill/SkillList';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

export default function Agents() {
  const { data, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const [selected, setSelected] = useState<AgentView | null>(null);
  return (
    <>
      <PageHeader title="Agents" sub={data ? `共 ${data.length} 个 Agent` : undefined} actions={<Button variant="ghost" onClick={reload}>刷新</Button>} />
      {selected ? (
        <AgentDetail agent={selected} onBack={() => setSelected(null)} />
      ) : (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '暂无 Agent', hint: '系统中尚未登记任何 Agent。', icon: '◉' }}
        >
          {(agents) => (
            <div className="agent-grid">
              {agents.map((a) => (
                <button key={a.key} className="agent-card" onClick={() => setSelected(a)}>
                  <div className="agent-card__head">
                    <div>
                      <div className="agent-card__name">{a.name}</div>
                      <div className="agent-card__key mono">{a.key}</div>
                    </div>
                    {a.active ? (
                      <Badge tone="good" dot="good">
                        启用
                      </Badge>
                    ) : (
                      <Badge tone="neutral" dot="neutral">
                        停用
                      </Badge>
                    )}
                  </div>
                  <div className="agent-card__desc mono">{a.globalDir}</div>
                  <div className="agent-card__foot">
                    <span className="badge badge--info">{a.sync}</span>
                    {a.mode && <span className="badge badge--accent">{a.mode}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </LoadingBoundary>
      )}
    </>
  );
}

function AgentDetail({ agent, onBack }: { agent: AgentView; onBack: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<AgentSkillsResp>(
    () => api(`/agents/${encodeURIComponent(agent.key)}/skills`),
    [agent.key]
  );
  const [addOpen, setAddOpen] = useState(false);

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.push('已更新', 'good');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const handleAction = (item: SkillCardView, action: SkillAction) => {
    void busy(async () => {
      switch (action.kind) {
        case 'delete':
          await api(`/agents/${encodeURIComponent(agent.key)}/skills/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
          break;
        case 'collect':
          await api(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' });
          break;
        case 'enable':
        case 'disable':
        case 'toggle':
        default:
          await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: action.kind !== 'disable' }) });
      }
    });
  };

  const handleToggle = (item: SkillCardView) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) })
    );

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>
          ← 返回
        </Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{agent.name}</h2>
        <Badge tone={agent.active ? 'good' : 'neutral'} dot={agent.active ? 'good' : 'neutral'}>
          {agent.active ? '启用' : '停用'}
        </Badge>
        <div className="detail-actions">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            收编
          </Button>
          <Button size="sm" variant="primary" onClick={() => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' }))}>
            同步
          </Button>
        </div>
      </div>

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该 Agent 暂无技能', icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList
              title={`已管理技能（${resp.skills.length}）`}
              items={resp.skills}
              onToggle={handleToggle}
              onAction={handleAction}
            />
          </div>
        )}
      </LoadingBoundary>

      <Modal
        open={addOpen}
        title="收编 addable 技能"
        onClose={() => setAddOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setAddOpen(false)}>
            关闭
          </Button>
        }
      >
        {data && data.addable.length === 0 ? (
          <EmptyState title="没有可收编的技能" />
        ) : (
          <div className="skill-list">
            {(data?.addable ?? []).map((a) => (
              <div key={a.id} className="skill-row">
                <div className="skill-row__main">
                  <div className="skill-row__title">{a.name}</div>
                  <div className="skill-row__sub mono">{a.repo}</div>
                </div>
                <div className="skill-row__right">
                  <Button size="sm" variant="primary" onClick={() => collectAddable(a)}>
                    收编
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}