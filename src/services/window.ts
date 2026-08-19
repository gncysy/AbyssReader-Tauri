// ============================================
// 窗口管理服务 — 封装 Tauri window API
// ============================================

import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

export const windowApi = {
  minimize: async (): Promise<void> => {
    await getCurrentWindow().minimize()
  },

  maximize: async (): Promise<void> => {
    await getCurrentWindow().maximize()
  },

  unmaximize: async (): Promise<void> => {
    await getCurrentWindow().unmaximize()
  },

  isMaximized: async (): Promise<boolean> => {
    return getCurrentWindow().isMaximized()
  },

  toggleMaximize: async (): Promise<boolean> => {
    const win = getCurrentWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
      return false
    }
    await win.maximize()
    return true
  },

  close: async (): Promise<void> => {
    await getCurrentWindow().close()
  },

  cleanupWebviews: (): Promise<void> => invoke('cleanup_webviews'),

  listenRssDownload: async (handler: (payload: any) => void): Promise<UnlistenFn> => {
    return listen('rss-download', (event: any) => {
      handler(event.payload)
    })
  },

  // ─── 验证码 ───

  listenVerificationCodeRequest: async (handler: (svg: string) => void): Promise<UnlistenFn> => {
    return listen('verification-code-request', (event: any) => {
      const payload = event.payload
      const svg = typeof payload === 'string' ? payload : (payload?.svg || '')
      handler(svg)
    })
  },

  submitVerificationCode: (code: string): Promise<string> => {
    return invoke('submit_verification_code', { code })
  },

  cancelVerificationCode: (): Promise<string> => {
    return invoke('cancel_verification_code')
  },

  // ─── show-photo ───

  listenShowPhoto: async (handler: (src: string) => void): Promise<UnlistenFn> => {
    return listen('show-photo', (event: any) => {
      const payload = event.payload
      const src = typeof payload === 'string' ? payload : (payload?.src || '')
      handler(src)
    })
  },

  // ─── refresh-explore / refresh-book-info ───

  listenRefreshExplore: async (handler: () => void): Promise<UnlistenFn> => {
    return listen('refresh-explore', () => {
      handler()
    })
  },

  listenRefreshBookInfo: async (handler: () => void): Promise<UnlistenFn> => {
    return listen('refresh-book-info', () => {
      handler()
    })
  },

  // ─── js-search-book ───

  listenJsSearchBook: async (handler: (payload: { keyword: string; source: string }) => void): Promise<UnlistenFn> => {
    return listen('js-search-book', (event: any) => {
      const payload = event.payload || {}
      handler({
        keyword: payload.keyword || '',
        source: payload.source || '',
      })
    })
  },
}
