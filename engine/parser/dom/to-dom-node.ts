// ============================================
// toDomNode — 将任意值转换为 DomNode
// ============================================

import { getDomProvider, type DomNode } from './provider.js'

export function toDomNode(val: unknown): DomNode {
  if (val && typeof val === 'object' && 'tag' in val && typeof (val as DomNode).querySelectorAll === 'function') {
    return val as DomNode
  }

  const provider = getDomProvider()

  if (val && typeof val === 'object' && (val as Element).nodeType === 1) {
    const el = val as Element
    const html = el.outerHTML || ''
    if (html) {
      const doc = provider.parseHTML(html)
      return doc.body || doc.documentElement || doc as unknown as DomNode
    }
  }

  if (typeof val === 'string') {
    const html = val
    if (html.trimStart().startsWith('<?xml')) {
      const doc = provider.parseXML(html)
      return doc.documentElement || doc.body || doc as unknown as DomNode
    }
    const doc = provider.parseHTML(html)
    return doc.body || doc.documentElement || doc as unknown as DomNode
  }

  try {
    const jsonStr = JSON.stringify(val)
    const doc = provider.parseHTML(jsonStr)
    return doc.body || doc.documentElement || doc as unknown as DomNode
  } catch {
    const doc = provider.parseHTML(String(val))
    return doc.body || doc.documentElement || doc as unknown as DomNode
  }
}
