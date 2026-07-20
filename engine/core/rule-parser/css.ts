// ============================================
// CSS 选择器规则解析（Legado Jsoup 语法兼容）
// ============================================

interface IndexInfo {
  baseSelector: string
  split: string
  indexes: number[]
}

function parseIndexSelector(selector: string): IndexInfo | null {
  const trimmed = selector.trim()
  const bracketMatch = trimmed.match(/^(.*?)\[([^\]]+)\]$/)
  if (bracketMatch) {
    const baseSelector = bracketMatch[1]
    const content = bracketMatch[2]
    let split = '.'
    let idxContent = content
    if (idxContent.startsWith('!')) { split = '!'; idxContent = idxContent.substring(1) }
    const indexes: number[] = []
    const parts = idxContent.split(',').map(s => s.trim())
    for (const part of parts) {
      if (part.includes(':')) {
        const segs = part.split(':').map(s => s.trim())
        const start = segs[0] ? parseInt(segs[0], 10) : 0
        const end = segs[1] ? parseInt(segs[1], 10) : -1
        const step = segs[2] ? Math.abs(parseInt(segs[2], 10)) : 1
        if (end >= start) for (let i = start; i <= end; i += step) indexes.push(i)
        else for (let i = start; i >= end; i -= step) indexes.push(i)
      } else {
        indexes.push(parseInt(part, 10))
      }
    }
    return { baseSelector, split, indexes }
  }
  return null
}

// Legado 特殊语法标准化
function normalizeSelector(expression: string): string {
  return expression
    // @tag.div → div
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
    // @tag. → 去掉
    .replace(/@tag\.?/g, '')
    // @class.foo → .foo
    .replace(/@class\.([\w-]+)/g, '.$1')
    // @id.foo → #foo
    .replace(/@id\.([\w-]+)/g, '#$1')
    // selector@attr → 只保留 selector
    .replace(/^([^@]+)@([a-zA-Z][\w-]*)$/, '$1')
    // .selector@tag.tr → .selector tr（后代选择器）
    .replace(/@tag\.(\w[\w-]*)/g, ' $1')
    // !0 → :nth-child(1), !1 → :nth-child(2)
    .replace(/!(\d+)/g, ':nth-child(${parseInt($1)+1})')
    // class.xxx → .xxx
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    // tag.xxx → xxx
    .replace(/\btag\.(\w[\w-]*)/g, '$1')
    // id.xxx → #xxx
    .replace(/\bid\.([\w-]+)/g, '#$1')
    // 去掉行首的 @
    .replace(/^@+/, '')
    // 多个空格合并
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractValue(el: Element, attribute?: string | null): any {
  if (!attribute) return el.textContent || el.getAttribute('href') || null
  if (attribute === 'html' || attribute === 'all') return el.outerHTML || null
  if (attribute === 'text') return el.textContent || null
  if (attribute === 'textNodes') {
    const nodes: string[] = []
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim()
        if (t) nodes.push(t)
      }
    })
    return nodes.length > 0 ? nodes.join('\n') : null
  }
  return el.getAttribute(attribute) || null
}

export interface ParsedCssRule {
  expression: string
  attribute: string | null
}

export function parseCss(rule: string): ParsedCssRule {
  let expression = rule.replace(/^@+/, '')
  if (expression.toLowerCase().startsWith('@css:')) {
    expression = expression.substring(5).trim()
  }

  let attribute: string | null = null
  // 提取末尾的 @attr（在 normalize 之前，因为 normalize 会吞掉 @）
  const attrMatch = expression.match(/@([a-zA-Z][\w-]*)$/)
  if (attrMatch) {
    attribute = attrMatch[1]
    expression = expression.substring(0, expression.lastIndexOf('@' + attribute!))
  }

  return { expression: normalizeSelector(expression), attribute }
}

export function executeCss(source: any, expression: string, attribute?: string | null): any {
  if (!source || !expression) return null

  const doc = new DOMParser().parseFromString(
    typeof source === 'string' ? source : String(source),
    'text/html'
  )

  try {
    let fixedExpression = normalizeSelector(expression)
    while (fixedExpression.startsWith('@')) fixedExpression = fixedExpression.substring(1)

    // || 回退
    if (fixedExpression.includes('||')) {
      const parts = fixedExpression.split('||').map(s => s.trim())
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined && result !== '' && !(Array.isArray(result) && result.length === 0)) return result
      }
      return null
    }

    // && 合并
    if (fixedExpression.includes('&&')) {
      const parts = fixedExpression.split('&&').map(s => s.trim())
      const results: any[] = []
      for (const part of parts) {
        const r = executeCss(source, part, attribute)
        if (r !== null && r !== undefined) {
          if (Array.isArray(r)) results.push(...r)
          else results.push(r)
        }
      }
      return results.length > 0 ? results : null
    }

    const indexInfo = parseIndexSelector(fixedExpression)
    let elements: Element[]
    if (indexInfo) {
      const allElements = Array.from(doc.querySelectorAll(indexInfo.baseSelector || '*'))
      if (allElements.length === 0) return null
      const totalLen = allElements.length
      const selected: Element[] = []
      for (const idx of indexInfo.indexes) {
        let actualIndex = idx < 0 ? totalLen + idx : idx
        if (actualIndex >= 0 && actualIndex < totalLen) selected.push(allElements[actualIndex])
      }
      elements = indexInfo.split === '!'
        ? allElements.filter(el => !selected.includes(el))
        : selected
    } else {
      try {
        elements = Array.from(doc.querySelectorAll(fixedExpression))
      } catch {
        // 选择器无效时返回空
        return null
      }
    }

    if (!elements || elements.length === 0) return null

    const results: any[] = []
    for (const el of elements) {
      const value = extractValue(el, attribute)
      if (value !== null && value !== undefined) results.push(value)
    }
    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch (err: any) {
    console.warn('[CSS] 执行失败:', err.message, expression)
    return null
  }
}
