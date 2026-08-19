// ============================================
// Tauri API 统一封装 — 所有 invoke 必须经过此文件
// ============================================

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

// 统一导出
export const invoke = tauriInvoke
export const listen = tauriListen
export type { UnlistenFn }

export const tauri = {
  invoke,
  listen,
  getCurrentWindow,

  minimizeWindow: async (): Promise<void> => {
    await getCurrentWindow().minimize()
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

  isMaximized: async (): Promise<boolean> => {
    return getCurrentWindow().isMaximized()
  },

  closeWindow: async (): Promise<void> => {
    await getCurrentWindow().close()
  },
}

export { tauri as default }
