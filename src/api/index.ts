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
  }) => invoke('fetch_url', {
    url,
    method: options?.method || 'GET',
    body: options?.body || null,
    headers: options?.headers || {},
    charset: undefined,
  }),
}

// ─── JS 执行器（deno_core）───
async function executeJs(code: string, context: Record<string, any>): Promise<string> {
  try {
    const response: any = await invoke('execute_js_rule', {
      request: { code, context, timeoutMs: 5000 }
    })
    if (response.success && response.result) {
      return response.result
    }
  } catch {}
  // 回退：浏览器 new Function
  try {
    const keys = Object.keys(context)
    const values = Object.values(context)
    const fn = new Function(...keys, 'return (' + code + ')')
    const result = fn(...values)
    return result != null ? String(result) : ''
  } catch { return '' }
}

// 注入到 engine
import('../../engine/core/url/index.js').then(({ setJsExecutor }) => {
  setJsExecutor(executeJs)
})

// ─── 引擎命令 ───
export const engine = {
  search: (source: any, keyword: string, page: number = 1) =>
    invoke('engine_search', { source, keyword, page }),

  batchSearch: (sources: any[], keyword: string, page: number = 1) =>
    invoke('engine_batch_search', { sources, keyword, page }),

  getToc: (source: any, tocUrl: string, book?: any) =>
    invoke('engine_get_toc', { source, tocUrl, book }),

  getContent: (source: any, chapterUrl: string, bookKind?: string) =>
    invoke('engine_get_content', { source, chapterUrl, bookKind }),

  getBookInfo: (source: any, bookUrl: string) =>
    invoke('engine_get_book_info', { source, bookUrl }),

  executeJs: executeJs,

  parseRule: (source: any, rule: string, data: any, ctx?: Record<string, any>) =>
    invoke('engine_parse_rule', { source, rule, data, context: ctx }),

  getExploreBooks: (source: any, categoryUrl: string, page: number = 1) =>
    invoke('engine_get_explore_books', { source, categoryUrl, page }),

  getExploreCategories: (index: number) =>
    invoke('get_explore_categories', { sourceIndex: index }),
}
