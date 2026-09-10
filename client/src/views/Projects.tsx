import { useState } from 'react';
import { api, type ProjectSkillsResp, type SkillCardView, type AddableSkill, type AgentView, type RepoView, type ProjectPushResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import AddableSkillList from '../components/skill/AddableSkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput } from '../components/ui/Field';
import { PathField } from '../components/ui/PathField';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

interface ProjectItem {
  id: number;
  path: string;
  tags: string[];
  agents?: string[];
  hasAgents?: boolean;
}

export default function Projects() {
  const { data, loading, error, reload } = useAsync<ProjectItem[]>(() => api('/projects'));
  const [selected, setSelected] = useState<ProjectItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const items: EntityItem[] = (data ?? []).map((p) => ({
    id: String(p.id),
    title: p.path,
    sub: p.tags.length ? p.tags.map((t) => `#${t}`).join(' ') : '无标签',
    onClick: () => setSelected(p),
    actions: <span style={{ color: 'var(--c-ink-3)' }}>→</span>,
  }));

  return (
    <>
      <PageHeader
        title="Projects"
        sub={data ? `共 ${data.length} 个项目` : undefined}
        actions={<Button onClick={() => setCreateOpen(true)}>新建项目</Button>}
      />
      {selected ? (
        <ProjectDetail project={selected} onBack={() => setSelected(null)} onChanged={reload} />
      ) : (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: '暂无项目', hint: '没有关联技能的项目，点击「新建项目」创建。', icon: '❐' }}
        >
          {() => <EntityList items={items} title={`全部项目（${items.length}）`} />}
        </LoadingBoundary>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />
    </>
  );
}

function CreateProjectModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [path, setPath] = useState('');
  const [tags, setTags] = useState('');
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
                await api('/projects', {
                  method: 'POST',
                  body: JSON.stringify({ path, tags: tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean) }),
                });
                toast.push('已创建', 'good');
                setPath(''); setTags('');
                onDone();
              } catch (e) {
                toast.push(e instanceof Error ? e.message : String(e), 'bad');
              } finally { setSaving(false); }
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label="项目路径" placeholder="/path/to/project" value={path} onChange={setPath} />
        <FieldInput
          label="标签（逗号分隔）"
          hint="打上标签后，资产库中同标签的 skill 会自动进入本项目"
          placeholder="react, frontend"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function ProjectDetail({ project, onBack, onChanged }: { project: ProjectItem; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<ProjectSkillsResp>(
    () => api(`/projects/${project.id}/skills`),
    [project.id]
  );
  const { data: agentData, reload: reloadAgents } = useAsync<AgentView[]>(() => api('/agents'));
  const { data: repos } = useAsync<RepoView[]>(() => api('/repos'));
  const [addOpen, setAddOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<ProjectPushResult | null>(null);
  const deployed = project.agents ?? [];

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.push('已更新', 'good');
      reload();
      reloadAgents();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const toggleDeploy = (key: string, on: boolean) =>
    void busy(async () => {
      const next = on ? [...deployed, key] : deployed.filter((k) => k !== key);
      await api(`/projects/${project.id}/agents`, { method: 'PUT', body: JSON.stringify({ agents: next }) });
    });

  const handleAction = (item: SkillCardView) =>
    void busy(() =>
      api(`/projects/${project.id}/skills`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/projects/${project.id}/skills`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

  const saveTags = (tags: string[]) =>
    void busy(() => api(`/projects/${project.id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }));

  // 回写仓库（PJ-05）
  const push = async (repoId?: string) => {
    setPushing(true);
    try {
      const res = await api<ProjectPushResult>(`/projects/${project.id}/push`, {
        method: 'POST',
        body: JSON.stringify({ repoId: repoId || undefined }),
      });
      setPushResult(res);
      toast.push(res.pushed.length ? `已回写 ${res.pushed.length} 个技能` : '无可回写内容', res.pushed.length ? 'good' : 'bad');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setPushing(false); }
  };

  const deployItems: EntityItem[] = (agentData ?? []).map((a) => ({
    id: a.key,
    title: a.name,
    sub: <span className="mono">{a.key}</span>,
    status: deployed.includes(a.key) ? <Badge tone="good">已部署</Badge> : <Badge tone="neutral">未部署</Badge>,
    toggle: (
      <Switch
        aria-label={`部署 ${a.name}`}
        checked={deployed.includes(a.key)}
        onChange={(v) => toggleDeploy(a.key, v)}
      />
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{project.path}</h2>
        {project.tags.map((t) => <Badge key={t} tone="accent">#{t}</Badge>)}
        <div className="detail-actions">
          <Button size="sm" variant="ghost" onClick={() => setTagOpen(true)} title="编辑项目标签，同标签 skill 自动进入本项目">标签</Button>
          <Button size="sm" variant="ghost" loading={pushing} onClick={() => { setPushOpen(true); void push(); }} title="把项目内改动的 skill 回写到仓库">回写仓库</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>添加</Button>
          <Button size="sm" variant="primary" onClick={() => void busy(() => api(`/projects/${project.id}/sync`, { method: 'POST' }))} title="把期望集落地到 .agents 并软链到各 Agent 项目目录">
            同步
          </Button>
        </div>
      </div>

      <div className="panel">
        <EntityList
          title="部署到 Agent"
          items={deployItems}
          empty={<EmptyState title="暂无已登记的 Agent" />}
        />
      </div>

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该项目暂无技能', icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList title={`项目技能（${resp.skills.length}）`} items={resp.skills} onAction={handleAction} />
          </div>
        )}
      </LoadingBoundary>

      <Modal open={addOpen} title="添加技能" onClose={() => setAddOpen(false)}
        footer={<Button variant="ghost" onClick={() => setAddOpen(false)}>关闭</Button>}>
        <AddableSkillList items={data?.addable ?? []} onAdd={collectAddable} />
      </Modal>

      <TagModal
        open={tagOpen}
        tags={project.tags}
        onClose={() => setTagOpen(false)}
        onSave={(tags) => { saveTags(tags); setTagOpen(false); }}
      />

      <Modal open={pushOpen} title="回写仓库" onClose={() => setPushOpen(false)}
        footer={<Button variant="ghost" onClick={() => setPushOpen(false)}>关闭</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>
            把 <span className="mono">.agents/skills</span> 中团队改动过的 skill 反向写回仓库本体；仅覆盖仓库中已存在的同名 skill。
          </span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {(repos ?? []).map((r) => (
              <Button key={r.id} size="sm" loading={pushing} onClick={() => void push(r.id)}>回写到 {r.id}</Button>
            ))}
          </div>
          {pushResult && (
            <div style={{ fontSize: 'var(--fs-13)' }}>
              <div>已回写：{pushResult.pushed.join(', ') || '无'}</div>
              {pushResult.skipped.length > 0 && <div style={{ color: 'var(--c-ink-3)' }}>跳过：{pushResult.skipped.join(', ')}</div>}
              {pushResult.errors.length > 0 && <div style={{ color: 'var(--c-bad)' }}>错误：{pushResult.errors.join(', ')}</div>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function TagModal({ open, tags, onClose, onSave }: { open: boolean; tags: string[]; onClose: () => void; onSave: (tags: string[]) => void }) {
  const [text, setText] = useState(tags.join(', '));
  return (
    <Modal
      open={open}
      title="编辑项目标签"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={() => onSave(text.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean))}>保存</Button></>}
    >
      <FieldInput
        label="标签（逗号分隔）"
        hint="资产库中打有相同标签的 skill 会自动进入本项目"
        placeholder="react, frontend"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}
