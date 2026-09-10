import { useCallback, useEffect, useState } from 'react';
import NavRail from './components/layout/NavRail';
import Topbar from './components/layout/Topbar';
import { ToastProvider, useToast } from './components/ui/Toast';
import Library from './views/Library';
import Agents from './views/Agents';
import Presets from './views/Presets';
import Projects from './views/Projects';
import Health from './views/Health';
import Settings from './views/Settings';
import { emitReload, getStoredTheme, storeTheme, type Tab } from './state/store';

const TITLES: Record<Tab, { t: string; s: string }> = {
  library: { t: '技能库', s: '统一技能资产库' },
  agents: { t: '智能体', s: 'Agent 技能管理' },
  presets: { t: '预设', s: '技能预设组' },
  projects: { t: '项目', s: '项目技能关联' },
  health: { t: '诊断', s: '健康检查与诊断' },
  settings: { t: '设置', s: '活跃 Agent 与同步策略' },
};

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme());
  const [reloading, setReloading] = useState(false);
  useToast();

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
          {tab === 'settings' && <Settings />}
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
