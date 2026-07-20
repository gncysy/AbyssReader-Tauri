// ============================================
// 书源辅助工具
// ============================================

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
