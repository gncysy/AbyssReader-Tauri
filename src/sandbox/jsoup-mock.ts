// ============================================
// 前端 Jsoup DOM 模拟（原生 DOMParser）
// ============================================

function fixSelector(sel: string): string {
  if (!sel || typeof sel !== 'string') return sel
  return sel
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
    .replace(/@class\.([\w-]+)/g, '.$1')
    .replace(/@id\.([\w-]+)/g, '#$1')
    .replace(/\btag\.(\w+)/g, '$1')
    .replace(/\bclass\.(\w+)/g, '.$1')
    .replace(/\bid\.(\w+)/g, '#$1')
}

function emptyResult(): any {
  const self: any = {
    _items: [], _size: 0,
    size: () => 0, first: () => self, get: () => self, eq: () => self,
    select: () => self, text: () => '', attr: () => '', html: () => '', outerHtml: () => '', val: () => '',
    remove: () => self, parents: () => self, children: () => self,
    add: () => self, addAll: () => self, forEach: () => {}, filter: () => self, map: () => [],
    toArray: () => [], toJSON: () => [], before: () => self, after: () => self, isEmpty: () => true,
    nextElementSibling: () => self, eachText: () => ({ size: () => 0, get: () => '' }),
  }
  return self
}

function buildSingle(el: Element, doc: Document): any {
  if (!el) return emptyResult()
  return {
    _el: el, _doc: doc,
    text: () => el.textContent?.trim() || '',
    ownText: () => Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim() || '').join(''),
    html: () => el.innerHTML || '',
    outerHtml: () => el.outerHTML || '',
    attr: (name: string) => el.getAttribute(name) || '',
    data: () => el.getAttribute('data') || '',
    val: () => (el as any).value || el.getAttribute('value') || '',
    tagName: () => el.tagName.toLowerCase(),
    select: (sel: string) => buildList(Array.from(el.querySelectorAll(fixSelector(sel)))),
    selectFirst: (sel: string) => buildSingle(el.querySelector(fixSelector(sel))!, doc),
    parent: () => buildSingle(el.parentElement!, doc),
    parents: () => { const r: Element[] = []; let p = el.parentElement; while (p) { r.push(p); p = p.parentElement } return buildList(r) },
    children: () => buildList(Array.from(el.children)),
    siblings: () => el.parentElement ? buildList(Array.from(el.parentElement.children).filter(c => c !== el)) : emptyResult(),
    next: () => buildSingle(el.nextElementSibling!, doc),
    prev: () => buildSingle(el.previousElementSibling!, doc),
    remove: () => { el.remove(); return emptyResult() },
    toString: () => el.outerHTML || el.textContent || '',
    toJSON: () => el.outerHTML || el.textContent || '',
    eq: (i: number) => buildSingle(el.children[i], doc),
    forEach: (fn: Function) => fn(buildSingle(el, doc), 0),
  }
}

function buildList(elements: Element[]): any {
  const len = elements.length
  const arr: any = new Array(len)
  for (let i = 0; i < len; i++) arr[i] = buildSingle(elements[i], document)
  arr._items = elements
  arr.length = len
  arr.size = () => len
  arr.isEmpty = () => len === 0
  arr.get = (i: number) => (i >= 0 && i < len) ? arr[i] : emptyResult()
  arr.first = () => len > 0 ? arr[0] : emptyResult()
  arr.last = () => len > 0 ? arr[len - 1] : emptyResult()
  arr.toArray = () => { const r: any[] = []; for (let i = 0; i < len; i++) r.push(arr[i]); return r }
  arr.select = (sel: string) => {
    const all: Element[] = []
    for (let i = 0; i < len; i++) {
      if (elements[i]) {
        const sub = elements[i].querySelectorAll(fixSelector(sel))
        for (let j = 0; j < sub.length; j++) all.push(sub[j])
      }
    }
    return buildList(all)
  }
  arr.text = () => { let t = ''; for (let i = 0; i < len; i++) t += (elements[i]?.textContent || ''); return t }
  arr.html = () => { let h = ''; for (let i = 0; i < len; i++) h += (elements[i]?.innerHTML || ''); return h }
  arr.outerHtml = () => { let h = ''; for (let i = 0; i < len; i++) h += (elements[i]?.outerHTML || ''); return h }
  arr.attr = (name: string, value?: string) => {
    if (value !== undefined) { for (let i = 0; i < len; i++) elements[i]?.setAttribute(name, value); return arr }
    return len > 0 ? (elements[0]?.getAttribute(name) || '') : ''
  }
  arr.remove = function(sel?: string) {
    if (sel) {
      for (let i = 0; i < len; i++) {
        if (elements[i]) {
          const subs = elements[i].querySelectorAll(fixSelector(sel))
          subs.forEach(s => s.remove())
        }
      }
      return arr
    }
    for (let i = len - 1; i >= 0; i--) { if (elements[i]) elements[i].remove() }
    return arr
  }
  arr.before = (html: string) => { if (len > 0 && elements[0]) { elements[0].insertAdjacentHTML('beforebegin', html) } return arr }
  arr.after = (html: string) => { if (len > 0 && elements[len - 1]) { elements[len - 1].insertAdjacentHTML('afterend', html) } return arr }
  arr.parents = () => emptyResult()
  arr.children = () => {
    const all: Element[] = []
    for (let i = 0; i < len; i++) { if (elements[i]) { const ch = elements[i].children; for (let j = 0; j < ch.length; j++) all.push(ch[j]) } }
    return buildList(all)
  }
  arr.add = (el: any) => {
    const n = elements.slice()
    if (el && el._items) { for (let i = 0; i < el._items.length; i++) n.push(el._items[i]) }
    return buildList(n)
  }
  arr.addAll = arr.add
  arr.forEach = (fn: Function) => { for (let i = 0; i < len; i++) fn(arr[i], i) }
  arr.filter = (fn: Function) => { const r: Element[] = []; for (let i = 0; i < len; i++) { if (fn(arr[i], i)) r.push(elements[i]) } return buildList(r) }
  arr.map = (fn: Function) => { const r: any[] = []; for (let i = 0; i < len; i++) r.push(fn(arr[i], i)); return r }
  arr.eachText = () => { const a: string[] = []; for (let i = 0; i < len; i++) a.push(elements[i]?.textContent || ''); return { size: () => a.length, get: (i: number) => a[i] || '' } }
  arr.toJSON = () => { const r: any[] = []; for (let i = 0; i < len; i++) r.push(elements[i]?.outerHTML || ''); return r }
  arr.eq = (i: number) => (i >= 0 && i < len) ? arr[i] : emptyResult()
  arr.nextElementSibling = () => emptyResult()
  return arr
}

export function parseJsoup(html: string): any {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  return {
    select: (sel: string) => buildList(Array.from(doc.querySelectorAll(fixSelector(sel)))),
    selectFirst: (sel: string) => buildSingle(doc.querySelector(fixSelector(sel))!, doc),
    text: () => body?.textContent?.trim() || '',
    html: () => doc.documentElement?.outerHTML || '',
    outerHtml: () => doc.documentElement?.outerHTML || '',
    title: () => doc.title || '',
    body: () => ({
      text: () => body?.textContent?.trim() || '',
      html: () => body?.innerHTML || '',
      outerHtml: () => body?.outerHTML || '',
      select: (sel: string) => buildList(Array.from((body || doc).querySelectorAll(fixSelector(sel)))),
      children: () => buildList(Array.from(body?.children || [])),
    }),
    head: () => ({
      html: () => doc.head?.innerHTML || '',
      select: (sel: string) => buildList(Array.from((doc.head || doc).querySelectorAll(fixSelector(sel)))),
    }),
  }
}
