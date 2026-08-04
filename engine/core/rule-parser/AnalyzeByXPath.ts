// ============================================
// XPath 解析器 — 使用 document.evaluate + LRU 缓存
// ============================================

interface XPathCacheEntry {
  result: XPathResult
  timestamp: number
}

const XPATH_CACHE = new Map<string, XPathCacheEntry>()
const CACHE_MAX_SIZE = 200
const CACHE_TTL = 60000 // 60 秒

function getCacheKey(rule: string, contentLength: number): string {
  return rule + ':' + contentLength
}

function cleanCache() {
  const now = Date.now()
  for (const [key, entry] of XPATH_CACHE) {
    if (now - entry.timestamp > CACHE_TTL) {
      XPATH_CACHE.delete(key)
    }
  }
  if (XPATH_CACHE.size > CACHE_MAX_SIZE) {
    const entries = Array.from(XPATH_CACHE.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = entries.slice(0, entries.length - CACHE_MAX_SIZE)
    for (const [key] of toRemove) {
      XPATH_CACHE.delete(key)
    }
  }
}

export class AnalyzeByXPath {
  private doc: Document
  private root: Node

  constructor(content: any) {
    if (content instanceof Node) {
      this.root = content
      this.doc = content.ownerDocument || document
    } else {
      const html = typeof content === 'string' ? content : JSON.stringify(content)
      const parser = new DOMParser()
      this.doc = parser.parseFromString(html, 'text/html')
      this.root = this.doc
    }
  }

  getElements(rule: string): Node[] {
    if (!rule) return []
    try {
      const result = this.evaluate(rule, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE)
      const nodes: Node[] = []
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i)
        if (node) nodes.push(node)
      }
      return nodes
    } catch (e) {
      console.warn('[AnalyzeByXPath] getElements 失败:', (e as Error).message, 'rule:', rule)
      return []
    }
  }

  getString(rule: string): string {
    if (!rule) return ''
    try {
      const result = this.evaluate(rule, XPathResult.STRING_TYPE)
      return result.stringValue || ''
    } catch (e) {
      // XPath 表达式可能不是 STRING_TYPE，尝试用节点方式取文本
      try {
        const nodes = this.getElements(rule)
        if (nodes.length > 0) {
          return nodes.map(n => n.textContent?.trim() || '').filter(Boolean).join('\n')
        }
      } catch {}
      console.warn('[AnalyzeByXPath] getString 失败:', (e as Error).message, 'rule:', rule)
      return ''
    }
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    try {
      const nodes = this.getElements(rule)
      return nodes
        .map(node => node.textContent?.trim() || '')
        .filter(Boolean)
    } catch (e) {
      console.warn('[AnalyzeByXPath] getStringList 失败:', (e as Error).message, 'rule:', rule)
      return []
    }
  }

  private evaluate(rule: string, resultType: number): XPathResult {
    cleanCache()
    const contentLen = this.doc.documentElement?.outerHTML?.length || 0
    const key = getCacheKey(rule, contentLen)

    const cached = XPATH_CACHE.get(key)
    if (cached) {
      try {
        if (cached.result.snapshotLength !== undefined) {
          return cached.result
        }
      } catch {
        XPATH_CACHE.delete(key)
      }
    }

    const result = this.doc.evaluate(
      rule,
      this.root,
      null,
      resultType,
      null
    )

    XPATH_CACHE.set(key, { result, timestamp: Date.now() })
    return result
  }
}
