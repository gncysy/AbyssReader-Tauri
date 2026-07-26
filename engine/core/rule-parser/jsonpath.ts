// ============================================
// JSONPath 规则解析
// ============================================

import jsonpath from 'jsonpath'

export function executeJsonPath(source: any, expression: string): any {
  if (!source) return null

  let data = source
  if (typeof source === 'string') {
    // 如果是 URL 或纯文本，不解析为 JSONPath
    if (/^https?:\/\//.test(source.trim()) || /^[\s\S]*<[a-zA-Z]/.test(source)) {
      return null
    }
    try { data = JSON.parse(source) } catch { return null }
  }

  if (typeof data !== 'object' || data === null) return null

  try {
    let expr = expression.trim().replace(/\.\[/g, '[')

    if (expr.toLowerCase().startsWith('@json:')) {
      expr = expr.substring(6).trim()
    }

    if (expr === '$.[*]') expr = '$[*]'

    if (expr.startsWith('$')) {
      const result = jsonpath.query(data, expr)
      if (!result || result.length === 0) return null
      return result.length === 1 ? result[0] : result
    }
    if (!expr.includes('[') && !expr.includes('..') && !expr.includes('*')) {
      const result = data[expr]
      return result !== undefined ? result : null
    }
    const result = jsonpath.query(data, '$.' + expr)
    if (!result || result.length === 0) return null
    return result.length === 1 ? result[0] : result
  } catch (err: any) {
    console.warn('[JSONPath] 执行失败:', err.message, expression)
    return null
  }
}
