// ============================================
// CSS 选择器规则解析（对齐 Legado Jsoup 语法）
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
      } else { indexes.push(parseInt(part, 10)) }
    }
    return { baseSelector, split, indexes }
  }
  return null
}

function normalizeSelector(expression: string): string {
  return expression
    .replace(/@tag\.(\w[\w-]*)/g, ' $1')
    .replace(/@tag\.?/g, '')
    .replace(/@class\.([\w-]+)/g, '.$1')
    .replace(/@id\.([\w-]+)/g, '#$1')
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    .replace(/\btag\.(\w[\w-]*)/g, '$1')
    .replace(/\bid\.([\w-]+)/g, '#$1')
    .replace(/^@+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractValue(el: Element, attribute?: string | null): any {
  if (!attribute) return el.outerHTML || el.textContent || null
  if (attribute === 'html' || attribute === 'all') return el.outerHTML || null
  if (attribute === 'text') return el.textContent || null
  if (attribute === 'textNodes') {
    const nodes: string[] = []
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { const t = node.textContent?.trim(); if (t) nodes.push(t) }
    })
    return nodes.length > 0 ? nodes.join('\n') : null
  }
  if (attribute === 'ownText') {
    let text = ''
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { text += node.textContent || '' }
    })
    return text.trim() || null
  }
  return el.getAttribute(attribute) || null
}

export interface ParsedCssRule {
  expression: string
  attribute: string | null
}

export function parseCss(rule: string): ParsedCssRule {
  let expression = rule.replace(/^@+/, '')
  if (expression.toLowerCase().startsWith('@css:')) { expression = expression.substring(5).trim() }

  let attribute: string | null = null
  const lastAt = expression.lastIndexOf('@')
  if (lastAt > 0) {
    const after = expression.substring(lastAt + 1)
    if (/^(href|src|text|html|content|outerHTML|textNodes|ownText|all|class|id|title|alt|style|width|height|data)$/i.test(after)) {
      attribute = after
      expression = expression.substring(0, lastAt)
    }
  }

  expression = expression.replace(/@([a-zA-Z][\w-]*)\.(\d+)/g, (_, tag, n) => ` ${tag}:nth-of-type(${parseInt(n)+1})`)
  expression = expression.replace(/@/g, ' ')

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

    if (fixedExpression.includes('||')) {
      const parts = fixedExpression.split('||').map(s => s.trim())
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined && result !== '' && !(Array.isArray(result) && result.length === 0)) return result
      }
      return null
    }

    if (fixedExpression.includes('&&')) {
      const parts = fixedExpression.split('&&').map(s => s.trim())
      const results: any[] = []
      for (const part of parts) {
        const r = executeCss(source, part, attribute)
        if (r !== null && r !== undefined) { if (Array.isArray(r)) results.push(...r); else results.push(r) }
      }
      return results.length > 0 ? results : null
    }

    let elements: Element[] = []

    // Jsoup 兼容：[attr~=/regex/] 正则属性选择器
    const regexAttrMatch = fixedExpression.match(/\[([a-zA-Z][\w-]*)~=\/(.+?)\/\]/)
    if (regexAttrMatch) {
      const attrName = regexAttrMatch[1]
      const regexStr = regexAttrMatch[2]
      const baseExpr = fixedExpression.replace(/\[[a-zA-Z][\w-]*~=\/.+?\/\]/, '').trim()
      try {
        const regex = new RegExp(regexStr)
        const allEls = baseExpr ? Array.from(doc.querySelectorAll(baseExpr)) : Array.from(doc.querySelectorAll('*'))
        elements = allEls.filter(el => {
          const val = el.getAttribute(attrName) || ''
          return regex.test(val)
        })
      } catch (e) {}
    }

    // Jsoup 兼容：:contains(文本) 伪类
    if (elements.length === 0) {
      const containsMatch = fixedExpression.match(/:contains\(["']?([^"']+)["']?\)/)
      if (containsMatch) {
        const searchText = containsMatch[1]
        const baseExpr = fixedExpression.replace(/:contains\(["']?[^"']+["']?\)/, '').trim()
        const allEls = baseExpr ? Array.from(doc.querySelectorAll(baseExpr)) : Array.from(doc.querySelectorAll('*'))
        elements = allEls.filter(el => (el.textContent || '').includes(searchText))
      }
    }

    // Jsoup 兼容：text.下一页 → 找包含"下一页"文本的元素
    if (elements.length === 0) {
      const textMatch = fixedExpression.match(/^text\.(.+)$/)
      if (textMatch) {
        const searchText = textMatch[1]
        const allElements = doc.querySelectorAll('*')
        const found: Element[] = []
        for (const el of allElements) {
          if (el.children.length === 0 && el.textContent?.trim() === searchText) { found.push(el) }
        }
        if (found.length === 0) {
          const links = doc.querySelectorAll('a')
          for (const a of links) {
            if (a.textContent?.trim() === searchText) { found.push(a) }
          }
        }
        elements = found
      }
    }

    // Jsoup 兼容：a.1 → 取所有 a 标签的第 2 个（索引从 0 开始）
    if (elements.length === 0) {
      const tagIndexMatch = fixedExpression.match(/^([a-zA-Z][\w-]*)\.(\d+)$/)
      if (tagIndexMatch) {
        const tagName = tagIndexMatch[1].toLowerCase()
        const index = parseInt(tagIndexMatch[2])
        const allElements = doc.querySelectorAll(tagName)
        if (index >= 0 && index < allElements.length) {
          const value = extractValue(allElements[index], attribute)
          return value !== null && value !== undefined ? value : null
        }
        return null
      }
    }

    if (elements.length === 0) {
      const indexInfo = parseIndexSelector(fixedExpression)
      if (indexInfo) {
        const allElements = Array.from(doc.querySelectorAll(indexInfo.baseSelector || '*'))
        if (allElements.length === 0) return null
        const totalLen = allElements.length
        const selected: Element[] = []
        for (const idx of indexInfo.indexes) {
          let actualIndex = idx < 0 ? totalLen + idx : idx
          if (actualIndex >= 0 && actualIndex < totalLen) selected.push(allElements[actualIndex])
        }
        elements = indexInfo.split === '!' ? allElements.filter(el => !selected.includes(el)) : selected
      } else {
        try { elements = Array.from(doc.querySelectorAll(fixedExpression)) }
        catch { return null }
      }
    }

    if (!elements || elements.length === 0) return null

    const results: any[] = []
    for (const el of elements) {
      const value = extractValue(el, attribute)
      if (value !== null && value !== undefined) results.push(value)
    }
    if (results.length === 0) return null
    if (results.length > 1 && (attribute === 'text' || attribute === 'html')) {
      return results.join('\n')
    }
    return results.length === 1 ? results[0] : results
  } catch (err: any) {
    console.warn('[CSS] 执行失败:', err.message, expression)
    return null
  }
}
