// ============================================
// 本地存储 API — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export const store = {
  get: async (key: string): Promise<any> => {
    const raw = await invoke('store_get', { key })
    if (typeof raw === 'string') {
      if (raw === 'undefined') return undefined
      if (raw === 'null') return null
      try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
  },
  set: (key: string, value: any): Promise<void> =>
    invoke('store_set', { key, value: typeof value === 'string' ? value : JSON.stringify(value) }),
  delete: (key: string): Promise<void> => invoke('store_delete', { key }),
  getAll: (): Promise<Record<string, any>> => invoke('store_get_all'),
}
