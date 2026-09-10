import { useCallback, useEffect, useState } from 'react';
import NavRail from './components/layout/NavRail';
import Topbar from './components/layout/Topbar';
import { ToastProvider, useToast } from './components/ui/Toast';
import Onboarding from './views/Onboarding';
import Library from './views/Library';
import Agents from './views/Agents';
import Presets from './views/Presets';
import Projects from './views/Projects';
import Health from './views/Health';
import { emitReload, getStoredTheme, getOnboarded, setOnboarded, storeTheme, type Tab } from './state/store';
import { api, type OnboardState } from './api/types';

const TITLES: Record<Tab, { t: string; s: string }> = {
  library: { t: '技能库', s: '统一技能资产库' },
  agents: { t: 'Agents', s: 'Agent 技能管理' },
  presets: { t: '预设', s: '技能预设组' },
  projects: { t: 'Projects', s: '项目技能关联' },
  health: { t: '诊断', s: '健康检查与诊断' },
};

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [phase, setPhase] = useState<'boot' | 'onboard' | 'app'>(
    getOnboarded() ? 'app' : 'boot'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme());
  const [reloading, setReloading] = useState(false);
  const toast = useToast();

  // 首启向导判定
  useEffect(() => {
    if (phase !== 'boot') return;
    api<OnboardState>('/onboarding')
      .then((o) => {
        if (o?.needsSetup) setPhase('onboard');
        else {
          setOnboarded(true);
          setPhase('app');
        }
      })
      .catch(() => setPhase('app'));
  }, [phase]);

  // 应用主题
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storeTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const reloadAll = useCallback(() => {
    setReloading(true);
    emitReload();
    setTimeout(() => setReloading(false), 600);
  }, []);

  if (phase === 'boot') {
    return <div className="loading-wrap"><span className="spinner" /><span>加载中…</span></div>;
  }

  if (phase === 'onboard') {
    return (
      <div className="shell-content">
        <Onboarding
          onDone={() => {
            setOnboarded(true);
            setPhase('app');
            emitReload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="hub">
      <NavRail active={tab} onSelect={setTab} />
      <div className="shell-main">
        <Topbar
          title={TITLES[tab].t}
          sub={TITLES[tab].s}
          theme={theme}
          onToggleTheme={toggleTheme}
          onReload={reloadAll}
          reloading={reloading}
        />
        <main className="shell-content">
          {tab === 'library' && <Library />}
          {tab === 'agents' && <Agents />}
          {tab === 'presets' && <Presets />}
          {tab === 'projects' && <Projects />}
          {tab === 'health' && <Health />}
        </main>
      </div>
    </div>
  );
}

export function AppWithToasts() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}