// ============================================
// DOM 解析（浏览器原生 DOMParser）
// ============================================

let contentCache = ''
let contentBaseUrl = ''

export function getElements(html: string, selector: string, attribute?: string): any[] {
  if (!html || !selector) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  let fixedSelector = selector.replace(/\bclass\.(\w+)/g, '.$1').replace(/\bid\.(\w+)/g, '#$1').replace(/\btag\.(\w+)/g, '$1')

  let elements: Element[]
  try {
    elements = Array.from(doc.querySelectorAll(fixedSelector))
  } catch { return [] }

  if (elements.length === 0) return []

  const results: any[] = []
  elements.forEach(el => {
    if (attribute) {
      const val = el.getAttribute(attribute)
      if (val !== null) results.push(val)
    } else {
      results.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim() || '',
        html: el.innerHTML || '',
        outerHTML: el.outerHTML || '',
        attributes: Object.fromEntries(
          Array.from(el.attributes).map(a => [a.name, a.value])
        ),
      })
    }
  })
  return results
}

export function getString(html: string, selector: string): string {
  if (!html || !selector) return ''

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const atIdx = selector.lastIndexOf('@')
  if (atIdx > 0) {
    const sel = selector.substring(0, atIdx)
      .replace(/\bclass\.(\w+)/g, '.$1')
      .replace(/\bid\.(\w+)/g, '#$1')
      .replace(/\btag\.(\w+)/g, '$1')
    const attr = selector.substring(atIdx + 1)
    const el = doc.querySelector(sel)
    if (!el) return ''
    if (attr === 'text') return el.textContent?.trim() || ''
    if (attr === 'html' || attr === 'outerHTML') return el.outerHTML || ''
    return el.getAttribute(attr) || ''
  }
  const el = doc.querySelector(selector.replace(/\bclass\.(\w+)/g, '.$1'))
  return el ? (el.textContent?.trim() || '') : ''
}

export function getStringList(html: string, selector: string): string[] {
  if (!html || !selector) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const atIdx = selector.lastIndexOf('@')
  let sel = selector, attr = ''
  if (atIdx > 0) {
    sel = selector.substring(0, atIdx)
      .replace(/\bclass\.(\w+)/g, '.$1')
      .replace(/\bid\.(\w+)/g, '#$1')
      .replace(/\btag\.(\w+)/g, '$1')
    attr = selector.substring(atIdx + 1)
  }

  const results: string[] = []
  try {
    doc.querySelectorAll(sel).forEach(el => {
      if (attr === 'html') results.push(el.innerHTML || '')
      else if (attr === 'text') results.push(el.textContent?.trim() || '')
      else if (attr) results.push(el.getAttribute(attr) || '')
      else results.push(el.textContent?.trim() || '')
    })
  } catch {}
  return results
}

export function getElement(html: string, selector: string, attribute?: string): any | null {
  const results = getElements(html, selector, attribute)
  return results.length > 0 ? results[0] : null
}

export function setContent(html: string, baseUrl?: string): void {
  contentCache = html || ''; contentBaseUrl = baseUrl || ''
}

export function getContent(): string { return contentCache }
export function getContentBaseUrl(): string { return contentBaseUrl }
export function clearContentCache(): void { contentCache = ''; contentBaseUrl = '' }
