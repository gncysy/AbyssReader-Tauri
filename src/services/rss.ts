// ============================================
// 订阅 API
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { store } from './store.js'

export const rss = {
  getSources: async (): Promise<any[]> => {
    const data = await store.get('rssSources')
    return Array.isArray(data) ? data : []
  },

  saveSources: async (sources: any[]): Promise<void> => {
    await store.set('rssSources', sources)
  },

  openUrl: (url: string, title: string): Promise<void> =>
    invoke('rss_open_url', { url, title }),
}
