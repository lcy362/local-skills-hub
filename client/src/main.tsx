import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { AppWithToasts } from './App';
import { log } from './log/logger';

// 全局错误兜底：未捕获异常与未处理的 promise 拒绝都记入前端日志
window.addEventListener('error', (e) => {
  log.error('window', `未捕获异常: ${e.message}`, { file: e.filename, line: e.lineno, col: e.colno });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
  log.error('window', `未处理的 Promise 拒绝: ${reason}`);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithToasts />
  </React.StrictMode>
);