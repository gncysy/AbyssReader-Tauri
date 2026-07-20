// ============================================
// Jsoup DOM 模拟（浏览器原生 DOMParser）
// ============================================

function fixSelector(sel: string): string {
  if (!sel || typeof sel !== 'string') return sel
  return sel
    .replace(/\bid\.(\w+)/g, '#')
    .replace(/\bclass\.(\w+)/g, '.')
    .replace(/\btag\.(\w+)/g, '')
}

function buildElementList(elements: Element[], doc: Document): any {
  const arr: any = []
  const len = elements.length
  for (let i = 0; i < len; i++) arr[i] = buildSingleElement(elements[i], doc)
  arr.length = len
  arr.size = () => len
  arr.isEmpty = () => len === 0
  arr.get = (i: number) => arr[i] || null
  arr.first = () => arr[0] || null
  arr.last = () => arr[len - 1] || null
  arr.toArray = () => { const r: any[] = []; for (let i = 0; i < len; i++) r.push(arr[i]); return r }
  arr.select = (sel: string) => buildElementList(Array.from(doc.querySelectorAll(fixSelector(sel))), doc)
  arr.text = () => elements.map(e => e.textContent?.trim() || '').join(' ')
  arr.html = () => elements.map(e => e.innerHTML || '').join('')
  arr.outerHtml = () => elements.map(e => e.outerHTML || '').join('')
  arr.attr = (name: string) => elements[0]?.getAttribute(name) || ''
  arr.toString = () => elements.map(e => e.outerHTML || e.textContent || '').join('')
  arr.eq = (i: number) => buildSingleElement(elements[i], doc)
  return arr
}

function buildSingleElement(el: Element, doc: Document): any {
  if (!el) return null
  return {
    text: () => el.textContent?.trim() || '',
    ownText: () => Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent?.trim() || '')
      .join(''),
    html: () => el.innerHTML || '',
    outerHtml: () => el.outerHTML || '',
    attr: (name: string) => el.getAttribute(name) || '',
    data: () => el.getAttribute('data') || '',
    select: (sel: string) => buildElementList(Array.from(el.querySelectorAll(fixSelector(sel))), doc),
    selectFirst: (sel: string) => buildSingleElement(el.querySelector(fixSelector(sel))!, doc),
    tagName: () => el.tagName.toLowerCase(),
    parent: () => buildSingleElement(el.parentElement!, doc),
    parents: () => { const result: Element[] = []; let p = el.parentElement; while (p) { result.push(p); p = p.parentElement } return buildElementList(result, doc) },
    children: () => buildElementList(Array.from(el.children), doc),
    siblings: () => { if (!el.parentElement) return []; return buildElementList(Array.from(el.parentElement.children).filter(c => c !== el), doc) },
    next: () => buildSingleElement(el.nextElementSibling!, doc),
    prev: () => buildSingleElement(el.previousElementSibling!, doc),
    remove: () => {},
    toString: () => el.outerHTML || el.textContent || '',
    eq: (i: number) => buildSingleElement(el.children[i], doc),
  }
}

export function parseJsoup(html: string): any {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body

  return {
    select: (sel: string) => buildElementList(Array.from(doc.querySelectorAll(fixSelector(sel))), doc),
    selectFirst: (sel: string) => buildSingleElement(doc.querySelector(fixSelector(sel))!, doc),
    text: () => body?.textContent?.trim() || '',
    html: () => doc.documentElement?.outerHTML || '',
    outerHtml: () => doc.documentElement?.outerHTML || '',
    title: () => doc.title || '',
    body: () => ({
      text: () => body?.textContent?.trim() || '',
      html: () => body?.innerHTML || '',
      outerHtml: () => body?.outerHTML || '',
      select: (sel: string) => buildElementList(Array.from(body?.querySelectorAll(fixSelector(sel)) || []), doc),
      children: () => buildElementList(Array.from(body?.children || []), doc),
    }),
    head: () => ({
      html: () => doc.head?.innerHTML || '',
      select: (sel: string) => buildElementList(Array.from(doc.head?.querySelectorAll(fixSelector(sel)) || []), doc),
    }),
  }
}

export function jsoupConnect(): any {
  return {
    userAgent: function (_ua: string) {
      let url = ''
      return {
        timeout: function (_t: number) { return this },
        url: function (u: string) { url = u; return this },
        get: function () {
          try {
            const xhr = new XMLHttpRequest()
            xhr.open('GET', url, false)
            xhr.send()
            return parseJsoup(xhr.responseText || '')
          } catch { return parseJsoup('') }
        },
      }
    },
    url: function (u: string) {
      let url = u
      return {
        timeout: function (_t: number) { return this },
        get: function () {
          try {
            const xhr = new XMLHttpRequest()
            xhr.open('GET', url, false)
            xhr.send()
            return parseJsoup(xhr.responseText || '')
          } catch { return parseJsoup('') }
        },
      }
    },
  }
}
