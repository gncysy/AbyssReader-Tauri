// ============================================
// Tauri HTTP 适配器 — 实现 HttpClientAdapter 接口
// ============================================

import type { RequestConfig, ResponseData } from '@engine/types.js'
import type { HttpClientAdapter } from '@engine/network/client.js'

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err)
  }
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const anyErr = err as any
    if (typeof anyErr.message === 'string') return anyErr.message
    if (typeof anyErr.error === 'string') return anyErr.error
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

export const tauriHttpAdapter: HttpClientAdapter = {
  async request(config: RequestConfig): Promise<ResponseData> {
    const { invoke } = await import('@tauri-apps/api/core')
    const bodyStr = config.body
      ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body))
      : null

    try {
      const data = await invoke('fetch_url', {
        url: config.url,
        method: config.method || 'GET',
        body: bodyStr,
        headers: config.headers || {},
        charset: config.charset || null,
        useWebview: config.useWebView || false,
        webJs: config.webJs || null,
        timeoutSecs: Math.ceil((config.timeout || 30000) / 1000),
        sourceType: config.sourceType ?? 0,
        preserveStyle: false,
      })

      return {
        status: 200,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        headers: {},
        url: config.url,
        duration: 0,
      }
    } catch (err) {
      throw new Error(formatError(err))
    }
  },
}
