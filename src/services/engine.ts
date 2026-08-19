// ============================================
// 引擎 API — 封装 Tauri invoke + engine 动态导入
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { setJsRuntime } from '@engine/parser/js-executor.js'
import type { JsRuntime } from '@engine/types.js'

const JS_TIMEOUT_DEFAULT = 30000

async function executeJs(code: any, context: Record<string, any>): Promise<string> {
  const codeStr = typeof code === 'string' ? code : String(code || '')
  if (!codeStr) return ''

  if (context.source && typeof context.source === 'object') {
    const src = context.source
    if (!src.getVariable) src.getVariable = function (key: string) { return this[key] || '' }
    if (!src.getKey) src.getKey = function () { return this.bookSourceUrl || this.sourceUrl || '' }
    if (!src.getTag) src.getTag = function () { return this.bookSourceName || this.sourceName || '' }
  }

  try {
    const response: any = await invoke('execute_js_rule', {
      code: codeStr,
      context,
      timeoutMs: JS_TIMEOUT_DEFAULT,
    })
    if (response?.success) return response.result || ''
    if (response?.error) {
      console.warn('[executeJs] error:', response.error)
      return ''
    }
    return ''
  } catch (err: any) {
    console.error('[executeJs] invoke failed:', err?.message || String(err))
    return ''
  }
}

export async function executeJsRule(
  code: string,
  context: Record<string, any>,
  timeoutMs = JS_TIMEOUT_DEFAULT,
): Promise<string> {
  if (!code) return ''
  try {
    const response: any = await invoke('execute_js_rule', {
      code,
      context,
      timeoutMs,
    })
    if (response?.success) return response.result || ''
    return ''
  } catch {
    return ''
  }
}

const tauriJsRuntime: JsRuntime = {
  execute: executeJs,
}

setJsRuntime(tauriJsRuntime)

export const engine = {
  executeJs,
  executeJsRule,

  getExploreBooks: async (source: any, categoryUrl: string, page = 1): Promise<any[]> => {
    const { getExploreBooks } = await import('@engine/business/explore/index.js')
    return getExploreBooks(source, categoryUrl, page)
  },

  getExploreCategories: async (sourceIndex: number): Promise<any[]> => {
    try {
      const result = await invoke('get_explore_categories', { sourceIndex })
      if (result && Array.isArray(result) && result.length > 0) return result
    } catch {
      // 降级到前端解析
    }

    const { store } = await import('./store.js')
    const sources = await store.get('bookSource')
    const source = Array.isArray(sources) ? sources[sourceIndex] : null
    if (!source) return []

    const { getExploreCategories } = await import('@engine/business/explore/index.js')
    return getExploreCategories(source)
  },
}
