// ============================================
// 浏览器 DomProvider 实现
// 对齐 Legado Jsoup + JXNode 行为
// ============================================

import { setDomProvider, type DomProvider, type DomDocument, type DomNode } from '@engine/parser/dom/provider.js'

const TEXT_NODE_TAG = '#text'

function createTextNodeWrapper(text: string): DomNode {
  return {
    tag: TEXT_NODE_TAG,
    attrs: {},
    children: [],
    textContent: text,
    innerHTML: '',
    outerHTML: text,
    getAttribute: () => null,
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    parentNode: null,
    nextSibling: null,
    previousSibling: null,
    remove: () => {},
    ownText: () => '',
    textNodes: () => [],
    evaluateXPath: () => [],
  }
}

function xpathEvaluate(context: Node, xpath: string): Node[] {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    )
    const nodes: Node[] = []
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i)
      if (node) nodes.push(node)
    }
    return nodes
  } catch {
    return []
  }
}

function ownTextOf(node: Node): string {
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  let text = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || ''
    }
  }
  return text.trim()
}

function textNodesOf(node: Node): string[] {
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as Element
  const result: string[] = []
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result.push(child.textContent || '')
    }
  }
  return result
}

/**
 * 解析 CSS 选择器中的 :contains()、:has()、:matches() 伪类
 * 返回 { baseSelector, containsTexts, hasSelectors, matchesTexts, notSelectors }
 */
function parseExtendedSelector(selector: string): {
  baseSelector: string
  containsTexts: string[]
  hasSelectors: string[]
  matchesTexts: string[]
  notHasTexts: string[]
} {
  const containsTexts: string[] = []
  const hasSelectors: string[] = []
  const matchesTexts: string[] = []
  const notHasTexts: string[] = []
  let baseSelector = selector

  // :contains(text)
  const containsRegex = /:contains\(([^)]+)\)/g
  let containsMatch: RegExpExecArray | null
  while ((containsMatch = containsRegex.exec(selector)) !== null) {
    const text = containsMatch[1].replace(/^['"]|['"]$/g, '')
    containsTexts.push(text)
  }
  if (containsTexts.length > 0) {
    baseSelector = baseSelector.replace(containsRegex, '')
  }

  // :has(selector)
  const hasRegex = /:has\(([^)]+)\)/g
  let hasMatch: RegExpExecArray | null
  while ((hasMatch = hasRegex.exec(selector)) !== null) {
    hasSelectors.push(hasMatch[1])
  }
  if (hasSelectors.length > 0) {
    baseSelector = baseSelector.replace(hasRegex, '')
  }

  // :not(:has(...)) — 提取"不包含"的文本
  const notHasRegex = /:not\(:has\(([^)]+)\)\)/g
  let notHasMatch: RegExpExecArray | null
  while ((notHasMatch = notHasRegex.exec(selector)) !== null) {
    notHasTexts.push(notHasMatch[1])
  }
  if (notHasTexts.length > 0) {
    baseSelector = baseSelector.replace(notHasRegex, '')
  }

  // :not(:matches(...)) — 提取"不匹配"的文本
  const notMatchesRegex = /:not\(:matches\(([^)]+)\)\)/g
  let notMatchesMatch: RegExpExecArray | null
  while ((notMatchesMatch = notMatchesRegex.exec(selector)) !== null) {
    const text = notMatchesMatch[1].replace(/^['"]|['"]$/g, '')
    notHasTexts.push(text)
  }
  if (notHasTexts.length > 0) {
    baseSelector = baseSelector.replace(notMatchesRegex, '')
  }

  // :not(selector) — 其他 :not() 忽略（降级：不排除任何元素）
  baseSelector = baseSelector.replace(/:not\([^)]+\)/g, '')

  // :matches(text)
  const matchesRegex = /:matches\(([^)]+)\)/g
  let matchesMatch: RegExpExecArray | null
  while ((matchesMatch = matchesRegex.exec(selector)) !== null) {
    const text = matchesMatch[1].replace(/^['"]|['"]$/g, '')
    matchesTexts.push(text)
  }
  if (matchesTexts.length > 0) {
    baseSelector = baseSelector.replace(matchesRegex, '')
  }

  return { baseSelector, containsTexts, hasSelectors, matchesTexts, notHasTexts }
}

/**
 * 检查元素是否匹配 :matches() 正则
 */
function matchesElementText(el: Element, patterns: string[]): boolean {
  if (patterns.length === 0) return true
  const text = el.textContent || ''
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern)
      if (!regex.test(text)) {
        return false
      }
    } catch {
      // 正则无效，跳过
    }
  }
  return true
}

/**
 * 检查元素是否包含指定的子选择器
 */
function hasChildSelector(el: Element, selectors: string[]): boolean {
  if (selectors.length === 0) return true
  for (const sel of selectors) {
    try {
      if (el.querySelector(sel)) {
        return true
      }
    } catch {
      // 选择器无效，跳过
    }
  }
  return false
}

/**
 * 执行带扩展伪类的 querySelectorAll
 */
function querySelectorAllWithExtended(
  root: Document | Element,
  selector: string,
): Element[] {
  const { baseSelector, containsTexts, hasSelectors, matchesTexts, notHasTexts } = parseExtendedSelector(selector)

  let elements: Element[]
  try {
    elements = Array.from(
      baseSelector.trim()
        ? root.querySelectorAll(baseSelector.trim())
        : root.querySelectorAll('*')
    )
  } catch {
    elements = []
  }

  return elements.filter((el) => {
    const text = el.textContent || ''

    // :contains() 过滤
    for (const searchText of containsTexts) {
      if (!text.includes(searchText)) {
        return false
      }
    }

    // :has() 过滤
    if (hasSelectors.length > 0 && !hasChildSelector(el, hasSelectors)) {
      return false
    }

    // :matches() 过滤
    if (!matchesElementText(el, matchesTexts)) {
      return false
    }

    // :not(:has(...)) / :not(:matches(...)) 排除
    for (const notText of notHasTexts) {
      // 尝试作为正则匹配
      try {
        const regex = new RegExp(notText)
        if (regex.test(text)) {
          return false
        }
      } catch {
        // 尝试作为文本包含
        if (text.includes(notText)) {
          return false
        }
      }
    }

    return true
  })
}

class BrowserDomProvider implements DomProvider {
  parseHTML(html: string, _baseUrl?: string): DomDocument {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    return this.wrapDocument(doc)
  }

  parseXML(xml: string, _baseUrl?: string): DomDocument {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    return this.wrapDocument(doc)
  }

  createDocument(): DomDocument {
    const doc = document.implementation.createHTMLDocument('')
    return this.wrapDocument(doc)
  }

  private wrapDocument(doc: Document): DomDocument {
    const self = this
    const wrapNodeRef = (node: Node | null): DomNode | null => self.wrapNode(node)
    return {
      querySelector: (sel: string) => {
        const { baseSelector } = parseExtendedSelector(sel)
        return wrapNodeRef(doc.querySelector(baseSelector))
      },
      querySelectorAll: (sel: string) =>
        querySelectorAllWithExtended(doc, sel)
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      getElementById: (id: string) => wrapNodeRef(doc.getElementById(id)),
      getElementsByTagName: (name: string) =>
        Array.from(doc.getElementsByTagName(name))
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      getElementsByClassName: (name: string) =>
        Array.from(doc.getElementsByClassName(name))
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      get body() { return wrapNodeRef(doc.body) },
      get head() { return wrapNodeRef(doc.head) },
      get documentElement() { return wrapNodeRef(doc.documentElement) },
      createElement: (tag: string) => wrapNodeRef(doc.createElement(tag)) || createTextNodeWrapper(''),
      createTextNode: (text: string) => createTextNodeWrapper(text),
      get textContent() { return doc.documentElement?.textContent || null },
      get innerHTML() { return doc.documentElement?.innerHTML || '' },
      get outerHTML() { return doc.documentElement?.outerHTML || '' },
      evaluateXPath: (xpath: string) =>
        xpathEvaluate(doc, xpath)
          .map((n) => wrapNodeRef(n))
          .filter((n): n is DomNode => n !== null),
    }
  }

  private wrapNode(node: Node | null): DomNode | null {
    if (!node) return null

    if (node.nodeType === Node.TEXT_NODE) {
      return createTextNodeWrapper(node.textContent || '')
    }

    const el = node as Element
    const self = this
    const wrap = (n: Node | null): DomNode | null => self.wrapNode(n)

    const result: DomNode = {
      tag: el.tagName.toLowerCase(),
      attrs: (() => {
        const attrs: Record<string, string> = {}
        for (const attr of Array.from(el.attributes)) {
          attrs[attr.name] = attr.value
        }
        return attrs
      })(),
      children: Array.from(el.children)
        .map((child) => wrap(child))
        .filter((n): n is DomNode => n !== null),
      textContent: el.textContent || '',
      innerHTML: el.innerHTML || '',
      outerHTML: el.outerHTML || '',
      getAttribute: (name: string) => el.getAttribute(name),
      setAttribute: (name: string, value: string) => el.setAttribute(name, value),
      querySelector: (sel: string) => {
        const { baseSelector } = parseExtendedSelector(sel)
        return wrap(el.querySelector(baseSelector))
      },
      querySelectorAll: (sel: string) =>
        querySelectorAllWithExtended(el, sel)
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      getElementsByTagName: (name: string) =>
        Array.from(el.getElementsByTagName(name))
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      getElementsByClassName: (name: string) =>
        Array.from(el.getElementsByClassName(name))
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      get parentNode() { return wrap(el.parentNode) },
      get nextSibling() { return wrap(el.nextSibling) },
      get previousSibling() { return wrap(el.previousSibling) },
      remove: () => el.remove(),
      ownText: () => ownTextOf(el),
      textNodes: () => textNodesOf(el),
      evaluateXPath: (xpath: string) =>
        xpathEvaluate(el, xpath)
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
    }

    return result
  }
}

export function initDomProvider(): void {
  setDomProvider(new BrowserDomProvider())
}
