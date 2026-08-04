// ============================================
// 简易 JSONPath（同步）
// ============================================

export function jsonPathQuery(obj: any, path: string): any {
  if (!obj || !path) return null
  const p = path.replace(/^\$\.?/, '')
  const parts = p.split('.')
  let cur = obj
  for (const part of parts) {
    if (cur === null || cur === undefined) return null
    const bracketMatch = part.match(/^(\w+)\[(\*|\d+)\]$/)
    if (bracketMatch) {
      cur = cur[bracketMatch[1]]
      if (cur === null || cur === undefined) return null
      if (bracketMatch[2] === '*') return cur
      cur = cur[parseInt(bracketMatch[2])]
    } else if (part.match(/^\[(\*|\d+)\]$/)) {
      if (!Array.isArray(cur)) return null
      const idx = part.match(/^\[(\*|\d+)\]$/)?.[1] ?? '0'
      if (idx === '*') return cur
      cur = cur[parseInt(idx)]
    } else {
      cur = cur[part]
    }
  }
  return cur
}
