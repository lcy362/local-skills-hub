import { useState } from 'react';
import { api, type ProjectSkillsResp, type SkillCardView, type AddableSkill } from '../api/types';
import SkillList from '../components/skill/SkillList';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

interface ProjectItem {
  id: string;
  path: string;
  tags: string[];
}

export default function Projects() {
  const { data, loading, error, reload } = useAsync<ProjectItem[]>(() => api('/projects'));
  const [selected, setSelected] = useState<ProjectItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Projects"
        sub={data ? `共 ${data.length} 个项目` : undefined}
        actions={<Button onClick={() => setCreateOpen(true)}>新建项目</Button>}
      />
      {selected ? (
        <ProjectDetail project={selected} onBack={() => setSelected(null)} />
      ) : (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '暂无项目', hint: '没有关联技能的项目，点击「新建项目」创建。', icon: '❐' }}
        >
          {(projects) => (
            <div className="skill-list">
              {projects.map((p) => (
                <button key={p.id} className="skill-row" style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => setSelected(p)}>
                  <div className="skill-row__main">
                    <div className="skill-row__title">{p.path}</div>
                    <div className="skill-row__sub">
                      {p.tags.join(', ') || '无标签'}
                    </div>
                  </div>
                  <div className="skill-row__right">→</div>
                </button>
              ))}
            </div>
          )}
        </LoadingBoundary>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />
    </>
  );
}

function CreateProjectModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [path, setPath] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open={open}
      title="新建项目"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!path.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api('/projects', { method: 'POST', body: JSON.stringify({ path }) });
                toast.push('已创建', 'good');
                onDone();
              } catch (e) {
                toast.push(e instanceof Error ? e.message : String(e), 'bad');
              } finally {
                setSaving(false);
              }
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <FieldInput label="项目路径" placeholder="/path/to/project" value={path} onChange={(e) => setPath(e.target.value)} />
    </Modal>
  );
}

function ProjectDetail({ project, onBack }: { project: ProjectItem; onBack: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<ProjectSkillsResp>(
    () => api(`/projects/${encodeURIComponent(project.id)}/skills`),
    [project.id]
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

  const handleAction = (item: SkillCardView) =>
    void busy(() =>
      api(`/projects/${encodeURIComponent(project.id)}/skills`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/projects/${encodeURIComponent(project.id)}/skills`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{project.path}</h2>
        {project.tags.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}
        <div className="detail-actions">
          <Button size="sm" onClick={() => setAddOpen(true)}>添加</Button>
          <Button size="sm" variant="primary" onClick={() => void busy(() => api(`/projects/${encodeURIComponent(project.id)}/sync`, { method: 'POST' }))}>
            同步
          </Button>
        </div>
      </div>

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该项目暂无技能', icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList
              title={`项目技能（${resp.skills.length}）`}
              items={resp.skills}
              onAction={handleAction}
            />
          </div>
        )}
      </LoadingBoundary>

      <Modal
        open={addOpen}
        title="添加技能"
        onClose={() => setAddOpen(false)}
        footer={<Button variant="ghost" onClick={() => setAddOpen(false)}>关闭</Button>}
      >
        {data && data.addable.length === 0 ? (
          <EmptyState title="没有可添加的技能" />
        ) : (
          <div className="skill-list">
            {(data?.addable ?? []).map((a) => (
              <div key={a.id} className="skill-row">
                <div className="skill-row__main">
                  <div className="skill-row__title">{a.name}</div>
                  <div className="skill-row__sub mono">{a.repo}</div>
                </div>
                <div className="skill-row__right">
                  <Button size="sm" variant="primary" onClick={() => collectAddable(a)}>添加</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}