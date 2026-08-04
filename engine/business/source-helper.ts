// ============================================
// 书源辅助工具
// ============================================

import type { BookSource } from '../../src/shared/types.js'

export function parseHeader(header: string | null | undefined): Record<string, string> | null {
  if (!header) return null
  if (typeof header !== 'string') return header as any
  try { return JSON.parse(header) } catch { return null }
}

export function parseSourcesFromJson(jsonStr: any): any[] {
  let data = jsonStr
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    data = jsonStr
  } else if (typeof jsonStr === 'string') {
    if (jsonStr === '[object Object]') return []
    try { data = JSON.parse(jsonStr) } catch { return [] }
  } else {
    return []
  }

  if (Array.isArray(data)) return data

  if (data.sources && Array.isArray(data.sources)) return data.sources
  if (data.data && Array.isArray(data.data)) return data.data
  if (data.bookSources && Array.isArray(data.bookSources)) return data.bookSources
  if (data.list && Array.isArray(data.list)) return data.list
  if (data.items && Array.isArray(data.items)) return data.items
  if (data.result && Array.isArray(data.result)) return data.result

  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    const inner = data.data
    if (inner.sources && Array.isArray(inner.sources)) return inner.sources
    if (inner.list && Array.isArray(inner.list)) return inner.list
    if (inner.items && Array.isArray(inner.items)) return inner.items
  }

  if (data.bookSourceUrl || data.bookSourceName || data.ruleSearch || data.searchUrl) return [data]

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0]
      if (typeof first === 'object' && first !== null && (first.bookSourceUrl || first.bookSourceName || first.ruleSearch || first.searchUrl)) {
        return value
      }
    }
  }

  return []
}

// ============================================
// 公共 parseHeader（所有 business 模块复用）
// ============================================
export async function parseSourceHeader(
  source: BookSource,
  book?: any
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (source.header) {
      if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
        const { executeJs } = await import('../core/rule-parser/js.js')
        const headerResult = await executeJs(source.header, {
          source, baseUrl: source.bookSourceUrl || '', result: '', book: book || {}
        })
        try { Object.assign(result, JSON.parse(headerResult)) } catch {
          try { Object.assign(result, JSON.parse(headerResult.replace(/'/g, '"'))) } catch {}
        }
      } else {
        try { Object.assign(result, JSON.parse(source.header)) } catch {
          try { Object.assign(result, JSON.parse((source.header || '{}').replace(/'/g, '"'))) } catch {}
        }
      }
    }
  } catch {}
  return result
}
