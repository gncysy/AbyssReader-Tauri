// ============================================
// 调试面板服务
// ============================================

import { store } from './store.js'
import { network } from './network.js'
import { getGlobalHttpClient, HttpClient } from '@engine/network/client.js'
import { fetchWithWebviewFallback } from './fetch.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { NETWORK } from '@/constants/index.js'
import type { BookSource } from '@/types'

function getHttpClient(): HttpClient {
  const client = getGlobalHttpClient()
  // 确保 adapter 已注入
  const adapter = (client as any).adapter
  if (!adapter) {
    const { tauriHttpAdapter } = require('./http-adapter.js')
    client.setAdapter(tauriHttpAdapter)
  }
  return client
}

export const debug = {
  getBookSource: (): Promise<any[]> => store.get('bookSource'),

  saveBookSource: (sources: any[]): Promise<void> => store.set('bookSource', sources),

  fetchWebView: network.fetchWebView,

  fetchUrl: network.fetch,

  search: async (source: any, keyword: string): Promise<any[]> => {
    const { search: engineSearch } = await import('./search.js')
    return engineSearch(source, keyword, { page: 1 })
  },

  getBookInfo: async (source: BookSource, bookUrl: string): Promise<any> => {
    const { parseBookInfo } = await import('@engine/business/book/index.js')
    const headers = await parseSourceHeader(source)
    const html = await fetchWithWebviewFallback(bookUrl, {
      source,
      headers,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })
    if (!html) return null
    return parseBookInfo(source, html, bookUrl)
  },

  getToc: async (source: any, tocUrl: string): Promise<any[]> => {
    const { useToc } = await import('@/composables/useToc.js')
    const toc = useToc()
    return toc.loadToc(source, tocUrl)
  },

  getContent: async (source: any, chapterUrl: string): Promise<string> => {
    const { getContent } = await import('./content.js')
    return getContent(source, chapterUrl, { book: {} })
  },

  executeJs: async (code: string, context: Record<string, any>): Promise<string> => {
    const { engine } = await import('./engine.js')
    return engine.executeJs(code, context)
  },

  httpRequest: async (url: string, source?: BookSource): Promise<{ status: number; headers: Record<string, string>; data: string }> => {
    const httpClient = getHttpClient()
    // 修复：带上当前选择书源的 header
    const sourceHeaders = source?.header ? await parseSourceHeader(source) : {}
    const response = await httpClient.request({
      url,
      method: 'GET',
      headers: sourceHeaders,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })
    return {
      status: response.status,
      headers: response.headers,
      data: response.data as string,
    }
  },
}
