import { api } from './types';

export interface PickResult {
  /** 用户取消时为 null */
  path: string | null;
}

/**
 * 调起系统原生目录选择器。
 * 用户取消 → 返回 null；当前环境无可用选择器 → 抛错，前端回退为手动输入。
 */
export async function pickDirectory(): Promise<string | null> {
  const r = await api<PickResult>('/filesystem/pick', { method: 'POST', body: '{}' });
  return r.path ?? null;
}

/** 调起系统原生文件选择器（用于标签文件等单文件场景） */
export async function pickFile(): Promise<string | null> {
  const r = await api<PickResult>('/filesystem/pick-file', { method: 'POST', body: '{}' });
  return r.path ?? null;
}
