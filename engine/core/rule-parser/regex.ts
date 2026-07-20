// ============================================
// 正则规则解析
// ============================================

export function executeRegex(source: any, expression: string, flags?: string): any {
  if (!source) return null
  const text = typeof source === 'string' ? source : String(source)
  try {
    const regex = new RegExp(expression, flags || 'g')
    const matches = [...text.matchAll(regex)]
    if (matches.length === 0) return null
    const results = matches.map(m => m.length > 1 ? m.slice(1).join('') : m[0])
    return results.length === 1 ? results[0] : results
  } catch { return null }
}
