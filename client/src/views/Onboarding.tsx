import { useState } from 'react';
import { api, type OnboardState } from '../api/types';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { FieldInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { data: onboard, loading, error } = useAsync<OnboardState>(() => api('/onboarding'));
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fullOnboarded = onboard && !onboard.needsSetup && onboard.step === 'done';

  return (
    <>
      <PageHeader
        title="开始使用"
        sub="导入已有资产库，或从已安装 Agent 归集技能。"
      />
      {loading && <Spinner label="检测状态…" />}
      {error && <div className="error-box">{error}</div>}
      {fullOnboarded && (
        <div className="panel">
          <div className="empty">
            <div style={{ fontSize: '28px' }}>🎉</div>
            <div className="empty__title">已完成初始化</div>
            <div className="empty__hint">技能库已就绪，前往技能库查看。</div>
            <Button variant="primary" onClick={onDone}>进入技能库</Button>
          </div>
        </div>
      )}
      {!!onboard && onboard.needsSetup && (
        <>
          <div className="flow-steps">
            <FlowStep
              n={1}
              title="导入已有资产库"
              desc="把本机已存在的技能目录导入到技能库，作为单一可信来源。"
            >
              <ImportFlow
                busy={busy}
                onImported={async (path) => {
                  setBusy(true);
                  try {
                    await api('/onboarding/import', { method: 'POST', body: JSON.stringify({ path }) });
                    toast.push('导入完成', 'good');
                    onDone();
                  } catch (e) {
                    toast.push(e instanceof Error ? e.message : String(e), 'bad');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </FlowStep>

            <FlowStep
              n={2}
              title="从 Agent 归集"
              desc="扫描已安装的 Agent，把其管理的技能 collect 进技能库。"
            >
              <CollectFlow
                agents={onboard.agents}
                busy={busy}
                onDone={async (key) => {
                  setBusy(true);
                  try {
                    await api('/onboarding/collect', { method: 'POST', body: JSON.stringify({ agent: key }) });
                    toast.push('归集完成', 'good');
                    onDone();
                  } catch (e) {
                    toast.push(e instanceof Error ? e.message : String(e), 'bad');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </FlowStep>
          </div>

          <div className="panel" style={{ borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, color: 'var(--c-ink-3)', fontSize: 'var(--fs-13)' }}>
                以上路径已完成？跳过向导直接开始。
              </span>
              <Button variant="ghost" onClick={onDone}>直接进入技能库</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FlowStep({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flow-step">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--c-accent)',
            color: 'var(--c-on-accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 'var(--fs-13)',
          }}
        >
          {n}
        </span>
        <span className="page-head__title" style={{ fontSize: 'var(--fs-18)' }}>{title}</span>
      </div>
      <p style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>{desc}</p>
      {children}
    </div>
  );
}

function ImportFlow({ onImported, busy }: { onImported: (path: string) => void; busy: boolean }) {
  const [path, setPath] = useState('');
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
      <div style={{ flex: 1 }}>
        <FieldInput placeholder="/path/to/skills" value={path} onChange={(e) => setPath(e.target.value)} />
      </div>
      <Button variant="primary" loading={busy} disabled={!path.trim()} onClick={() => onImported(path.trim())}>
        导入
      </Button>
    </div>
  );
}

function CollectFlow({
  agents,
  busy,
  onDone,
}: {
  agents: { key: string; name: string }[];
  busy: boolean;
  onDone: (key: string) => void;
}) {
  if (agents.length === 0) {
    return <span style={{ color: 'var(--c-ink-3)', fontSize: 'var(--fs-13)' }}>未检测到已安装的 Agent。</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {agents.map((a) => (
        <div key={a.key} className="skill-row">
          <div className="skill-row__main">
            <div className="skill-row__title">{a.name}</div>
            <div className="skill-row__sub mono">{a.key}</div>
          </div>
          <div className="skill-row__right">
            <Button size="sm" variant="primary" loading={busy} onClick={() => onDone(a.key)}>
              归集
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}