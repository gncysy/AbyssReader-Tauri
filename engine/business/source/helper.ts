// ============================================
// 书源辅助 — parseHeader 等纯函数
// ============================================

import type { BookSource } from '../../types.js'

export function parseHeader(header: string | null | undefined): Record<string, string> | null {
  if (!header) return null
  if (typeof header !== 'string') return header as any
  try {
    return JSON.parse(header)
  } catch {
    return null
  }
}

export function parseSourcesFromJson(jsonStr: any): any[] {
  let data = jsonStr
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    data = jsonStr
  } else if (typeof jsonStr === 'string') {
    if (jsonStr === '[object Object]') return []
    try {
      data = JSON.parse(jsonStr)
    } catch {
      return []
    }
  } else {
    return []
  }

  if (Array.isArray(data)) return data

  if (data.bookSourceUrl || data.bookSourceName || data.ruleSearch || data.searchUrl) return [data]

  const wrapperKeys = ['sources', 'bookSources', 'list', 'items', 'result']
  for (const key of wrapperKeys) {
    if (data[key] && Array.isArray(data[key])) return data[key]
  }

  if (data.data && typeof data.data === 'object') {
    const inner = data.data
    if (!Array.isArray(inner)) {
      for (const key of wrapperKeys) {
        if (inner[key] && Array.isArray(inner[key])) return inner[key]
      }
    } else {
      return inner
    }
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0]
      if (
        typeof first === 'object' &&
        first !== null &&
        (first.bookSourceUrl || first.bookSourceName || first.ruleSearch || first.searchUrl)
      ) {
        return value
      }
    }
  }

  return []
}

export async function parseSourceHeader(
  source: BookSource,
  book?: any,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (source.header) {
      if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
        const { getJsRuntime } = await import('../../parser/js-executor.js')
        const runtime = getJsRuntime()
        if (runtime) {
          const headerResult = await runtime.execute(source.header, {
            source,
            baseUrl: source.bookSourceUrl || '',
            result: '',
            book: book || {},
          })
          try {
            Object.assign(result, JSON.parse(headerResult))
          } catch {
            try {
              Object.assign(result, JSON.parse(headerResult.replace(/'/g, '"')))
            } catch {
              // ignore
            }
          }
        }
      } else {
        try {
          Object.assign(result, JSON.parse(source.header))
        } catch {
          try {
            Object.assign(result, JSON.parse((source.header || '{}').replace(/'/g, '"')))
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return result
}
