// ============================================
// Tauri API 封装层 - 统一 invoke 调用
// ============================================

import { invoke } from '@tauri-apps/api/core'

// ─── 通用 store ───
export const store = {
  get: async (key: string) => {
    const raw = await invoke('store_get', { key })
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
  },
  set: (key: string, value: any) => invoke('store_set', { key, value: JSON.stringify(value) }),
  delete: (key: string) => invoke('store_delete', { key }),
  getAll: () => invoke('store_get_all'),
}

// ─── 本地书籍 ───
export const reader = {
  importTxt: (name: string, content: string) =>
    invoke('import_txt', { name, content }),
  getLocalBookChapters: (bookId: string) =>
    invoke('get_local_book_chapters', { bookId }),
  getLocalChapterContent: (bookId: string, chapterId: number) =>
    invoke('get_local_chapter_content', { bookId, chapterId }),
}

// ─── 书源管理 ───
export const source = {
  add: (jsonStr: string) =>
    invoke('add_book_source', { sourceJson: jsonStr }),
  importFromUrl: (url: string) =>
    invoke('import_sources_from_url', { url }),
  test: (index: number) =>
    invoke('test_book_source', { sourceIndex: index }),
  testAll: () =>
    invoke('test_all_sources'),
  toggleSource: (index: number, enabled: boolean) =>
    invoke('toggle_book_source', { sourceIndex: index, enabled }),
  deleteSource: (index: number) =>
    invoke('delete_book_source', { sourceIndex: index }),
  deleteFailed: () =>
    invoke('delete_failed_sources'),
}

// ─── 网络请求 ───
export const network = {
  fetch: (url: string, options?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
    responseType?: string
    sourceType?: number
  }) => invoke('fetch_url', {
    url,
    method: options?.method || 'GET',
    body: options?.body || null,
    headers: options?.headers || {},
    charset: undefined,
    useWebview: false,
    source_type: options?.sourceType ?? 0,
  }),

  fetchWebView: (url: string, options?: {
    headers?: Record<string, string>
    webJs?: string
    timeout?: number
    sourceType?: number
  }) => invoke('fetch_url', {
    url,
    method: 'GET',
    body: null,
    headers: options?.headers || {},
    charset: undefined,
    useWebview: true,
    webJs: options?.webJs || null,
    timeout_secs: options?.timeout ? Math.ceil(options.timeout / 1000) : 30,
    source_type: options?.sourceType ?? 0,
  }),

  downloadBinary: (url: string, headers?: Record<string, string>) =>
    invoke('download_binary', { url, headers }),
}

// ─── 登录 WebView ───
export async function loginWebview(url: string, title?: string, timeoutSecs?: number): Promise<string> {
  return invoke('login_webview', { url, title, timeoutSecs })
}

// ─── JS 执行器（强制走 Rust deno_core）───
let executorReady = false

async function executeJs(code: string, context: Record<string, any>): Promise<string> {
  try {
    const response: any = await invoke('execute_js_rule', {
      request: { 
        code, 
        context, 
        timeoutMs: 30000 
      }
    })
    if (response && response.success) {
      const rawResult = response.result || ''
      console.log('[executeJs] result len=' + rawResult.length + ' preview=' + rawResult.substring(0, 300))
      return rawResult
    }
    if (response && response.error) {
      console.warn('[executeJs] error:', response.error)
      return ''
    }
    return ''
  } catch (err: any) {
    console.error('[executeJs] invoke failed:', err)
    return ''
  }
}

// 注入 JS 执行器到引擎
import('../../engine/core/url/index.js').then(({ setJsExecutor }) => {
  setJsExecutor(executeJs)
  executorReady = true
}).catch(err => {
  console.error('[API] URL解析 JS执行器注入失败:', err)
})

import('../../engine/core/rule-parser/js.js').then(({ setJsExecutor }) => {
  setJsExecutor(executeJs)
  executorReady = true
}).catch(err => {
  console.error('[API] 规则解析 JS执行器注入失败:', err)
})

// ─── 引擎命令 ───
export const engine = {
  batchSearch: (sources: any[], keyword: string, page: number = 1) =>
    invoke('engine_batch_search', { sources, keyword, page }),

  executeJs: executeJs,

  parseRule: (source: any, rule: string, data: any, ctx?: Record<string, any>) =>
    invoke('engine_parse_rule', { source, rule, data, context: ctx }),

  getExploreBooks: async (source: any, categoryUrl: string, page: number = 1) => {
    const { getExploreBooks } = await import('../../engine/business/explore.js')
    return getExploreBooks(source, categoryUrl, page)
  },

  getExploreCategories: async (sourceIndex: number) => {
    const result = await invoke('get_explore_categories', { sourceIndex })
    if (result && Array.isArray(result) && result.length > 0) {
      return result
    }
    const sources = await store.get('bookSource')
    const source = Array.isArray(sources) ? sources[sourceIndex] : null
    if (!source) return []
    const { getExploreCategories } = await import('../../engine/business/explore.js')
    return getExploreCategories(source)
  },
}
