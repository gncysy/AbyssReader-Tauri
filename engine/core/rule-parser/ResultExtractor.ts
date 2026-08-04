import { elementsSingle } from './ElementsSingle.js'
import { RuleAnalyzer } from './RuleAnalyzer.js'

const RESULT_ATTRS = new Set(['text', 'textNodes', 'ownText', 'html', 'all'])

function normalizeCssSelector(expression: string): string {
  return expression
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
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

export function getResultLast(elements: Element[], lastRule: string): string[] {
  const results: string[] = []
  if (RESULT_ATTRS.has(lastRule)) {
    switch (lastRule) {
      case 'text':
        for (const el of elements) { const t = el.textContent?.trim() || ''; if (t) results.push(t) }
        break
      case 'textNodes':
        for (const el of elements) {
          const texts: string[] = []
          el.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) { const t = n.textContent?.trim() || ''; if (t) texts.push(t) } })
          if (texts.length) results.push(texts.join('\n'))
        }
        break
      case 'ownText':
        for (const el of elements) {
          let text = ''
          el.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) text += n.textContent || '' })
          const t = text.trim(); if (t) results.push(t)
        }
        break
      case 'html': {
        elements.forEach(e => { e.querySelectorAll('script, style').forEach(s => s.remove()) })
        const html = elements.map(e => e.outerHTML || e.innerHTML || '').join('')
        if (html) results.push(html)
        break
      }
      case 'all':
        results.push(elements.map(e => e.outerHTML || '').join(''))
        break
    }
  } else {
    for (const el of elements) {
      const val = el.getAttribute(lastRule) || ''
      if (val && !results.includes(val)) results.push(val)
    }
  }
  return results
}

export function getResultList(root: Element, ruleStr: string): string[] | null {
  if (!ruleStr) return null

  const ruleAnalyzer = new RuleAnalyzer(ruleStr)
  ruleAnalyzer.trim()
  const rules = ruleAnalyzer.splitRule('@')
  console.log('[getResultList] ruleStr=' + ruleStr + ' rules=' + JSON.stringify(rules))

  let elements = [root]
  const last = rules.length - 1
  for (let i = 0; i < last; i++) {
    const nextElements: Element[] = []
    for (const elt of elements) {
      console.log('[getResultList] step' + i + ' elt.tagName=' + (elt?.tagName || 'N/A') + ' rule=' + rules[i])
      const selected = elementsSingle(elt, rules[i])
      console.log('[getResultList] step' + i + ' selected count=' + selected.length)
      for (const s of selected) nextElements.push(s)
    }
    elements = nextElements
  }

  if (elements.length === 0) { console.log('[getResultList] elements empty, returning null'); return null }
  const result = getResultLast(elements, rules[last])
  console.log('[getResultList] result=' + JSON.stringify(result?.slice(0, 3)))
  return result
}

export function getElementsRecursive(temp: Element, ruleStr: string): Element[] {
  if (!temp || !ruleStr) return []

  const isCss = ruleStr.toLowerCase().startsWith('@css:')
  const elementsRule = isCss ? ruleStr.substring(5).trim() : ruleStr

  if (!elementsRule) return []

  const ruleAnalyzer = new RuleAnalyzer(elementsRule)
  const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')

  if (isCss) {
    const results: Element[][] = []
    for (const rs of ruleStrS) {
      const els = Array.from(temp.querySelectorAll(normalizeCssSelector(rs)))
      results.push(els)
      if (els.length > 0 && ruleAnalyzer.elementsType === '||') break
    }
    return combineElementResults(results, ruleAnalyzer.elementsType)
  }

  const results: Element[][] = []
  for (const rs of ruleStrS) {
    const rsRule = new RuleAnalyzer(rs)
    rsRule.trim()
    const segments = rsRule.splitRule('@')

    let el: Element[]
    if (segments.length > 1) {
      let current = [temp]
      for (const rl of segments) {
        const nextElements: Element[] = []
        for (const et of current) {
          const subElements = getElementsRecursive(et, rl)
          for (const s of subElements) nextElements.push(s)
        }
        current = nextElements
      }
      el = current
    } else {
      el = elementsSingle(temp, rs)
    }

    results.push(el)
    if (el.length > 0 && ruleAnalyzer.elementsType === '||') break
  }

  return combineElementResults(results, ruleAnalyzer.elementsType)
}

function combineElementResults(results: Element[][], elementsType: string): Element[] {
  if (results.length === 0) return []
  if (elementsType === '%%') {
    const merged: Element[] = []
    const baseLen = results[0].length
    for (let i = 0; i < baseLen; i++) {
      for (const es of results) {
        if (i < es.length) merged.push(es[i])
      }
    }
    return merged
  }
  const merged: Element[] = []
  for (const es of results) merged.push(...es)
  return merged
}

