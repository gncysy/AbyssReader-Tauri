// ============================================
// CSS 解析器 — 兼容现有代码
// ============================================

export class AnalyzeByCSS {
  private root: Element | Document

  constructor(content: any) {
    if (content instanceof Element || content instanceof Document) {
      this.root = content
    } else {
      const html = typeof content === 'string' ? content : JSON.stringify(content)
      const parser = new DOMParser()
      this.root = parser.parseFromString(html, 'text/html')
    }
  }

  getElements(rule: string): Element[] {
    if (!rule) return []
    const elements = Array.from(this.root.querySelectorAll(rule))
    return this.applyPseudo(elements, rule)
  }

  getString(rule: string): string {
    const list = this.getStringList(rule)
    return list.length ? list.join('\n') : ''
  }

  getStringList(rule: string): string[] {
    if (!rule) return []

    const parts = this.splitLogical(rule)
    const type = this.detectLogical(rule)

    const results: string[][] = []
    for (const part of parts) {
      const list = this.evaluateSingleRule(part)
      if (list.length > 0) {
        results.push(list)
        if (type === '||') break
      }
    }

    const result: string[] = []
    if (type === '%%') {
      const maxLen = Math.max(...results.map(r => r.length), 0)
      for (let i = 0; i < maxLen; i++) {
        for (const list of results) {
          if (i < list.length) result.push(list[i])
        }
      }
    } else {
      for (const list of results) {
        result.push(...list)
      }
    }
    return result
  }

  private evaluateSingleRule(rule: string): string[] {
    const atIndex = rule.lastIndexOf('@')
    if (atIndex === -1) {
      const els = this.root.querySelectorAll(rule)
      return Array.from(els).map(el => el.textContent?.trim() || '').filter(Boolean)
    }

    const selector = rule.substring(0, atIndex)
    const attr = rule.substring(atIndex + 1)
    const els = this.root.querySelectorAll(selector)

    switch (attr) {
      case 'text':
        return Array.from(els).map(el => el.textContent?.trim() || '').filter(Boolean)
      case 'textNodes':
        return Array.from(els).map(el => {
          const texts: string[] = []
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
              texts.push(node.textContent.trim())
            }
          })
          return texts.join('\n')
        }).filter(Boolean)
      case 'ownText':
        return Array.from(els).map(el => {
          let text = ''
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent || ''
            }
          })
          return text.trim()
        }).filter(Boolean)
      case 'html':
        return Array.from(els).map(el => el.innerHTML).filter(Boolean)
      case 'all':
        return Array.from(els).map(el => el.outerHTML).filter(Boolean)
      default:
        return Array.from(els).map(el => el.getAttribute(attr) || '').filter(Boolean)
    }
  }

  private splitLogical(rule: string): string[] {
    const parts: string[] = []
    let current = ''
    let depth = 0
    let i = 0

    while (i < rule.length) {
      const ch = rule[i]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--

      if (depth === 0 && i + 1 < rule.length) {
        const two = rule.substring(i, i + 2)
        if (two === '&&' || two === '||' || two === '%%') {
          if (current.trim()) parts.push(current.trim())
          current = ''
          i += 2
          continue
        }
      }
      current += ch
      i++
    }
    if (current.trim()) parts.push(current.trim())
    return parts
  }

  private detectLogical(rule: string): string {
    if (rule.includes('%%')) return '%%'
    if (rule.includes('||')) return '||'
    return '&&'
  }

  private applyPseudo(elements: Element[], rule: string): Element[] {
    const ltMatch = rule.match(/:lt\((\d+)\)/)
    if (ltMatch) {
      const n = parseInt(ltMatch[1])
      return elements.slice(0, n)
    }
    const gtMatch = rule.match(/:gt\((\d+)\)/)
    if (gtMatch) {
      const n = parseInt(gtMatch[1])
      return elements.slice(n + 1)
    }
    const eqMatch = rule.match(/:eq\((\d+)\)/)
    if (eqMatch) {
      const n = parseInt(eqMatch[1])
      return n >= 0 && n < elements.length ? [elements[n]] : []
    }
    return elements
  }
}
