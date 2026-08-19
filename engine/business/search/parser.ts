// ============================================
// 搜索解析 — 纯函数（对齐 Legado）
// ============================================

import { getString, getStringList, resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource } from '../../types.js'

const NAME_MAX_LENGTH = 100
const MAX_TAG_COUNT = 3
const INTRO_MAX_LENGTH = 500
const NAME_REGEX = /\s+作\s*者.*|\s+\S+\s+著/
const AUTHOR_REGEX = /^\s*作\s*者[:：\s]+|\s+著/
const WORD_COUNT_THRESHOLD = 10000

function extractString(val: unknown, preferAttribute = false): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return ''
    for (const item of val) {
      const result = extractString(item, preferAttribute)
      if (result) return result
    }
    return ''
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, any>

    if (obj.getAttribute && typeof obj.getAttribute === 'function') {
      const src = obj.getAttribute('src')
      if (src && typeof src === 'string' && src.trim()) return src.trim()
      const href = obj.getAttribute('href')
      if (href && typeof href === 'string' && href.trim()) return href.trim()
      const alt = obj.getAttribute('alt')
      if (alt && typeof alt === 'string' && alt.trim()) return alt.trim()
      const title = obj.getAttribute('title')
      if (title && typeof title === 'string' && title.trim()) return title.trim()

      if (preferAttribute) return ''
    }

    if (obj.src && typeof obj.src === 'string' && obj.src.trim()) return obj.src.trim()
    if (obj.href && typeof obj.href === 'string' && obj.href.trim()) return obj.href.trim()
    if (obj.alt && typeof obj.alt === 'string' && obj.alt.trim()) return obj.alt.trim()
    if (obj.title && typeof obj.title === 'string' && obj.title.trim()) return obj.title.trim()

    if (obj.text && typeof obj.text === 'function') {
      const text = obj.text()
      if (text && typeof text === 'string') return text
    }
    if (obj.textContent && typeof obj.textContent === 'string') return obj.textContent.trim()
    if (obj.innerText && typeof obj.innerText === 'string') return obj.innerText.trim()
    if (obj.outerHTML && typeof obj.outerHTML === 'string') return obj.outerHTML.trim()
    if (obj.html && typeof obj.html === 'function') {
      const html = obj.html()
      if (html && typeof html === 'string') return html
    }
    if (typeof obj.toString === 'function') {
      const str = obj.toString()
      if (str !== '[object Object]' && str !== '[object Array]') return str
    }
    return ''
  }
  return String(val)
}

export function formatBookName(name: string): string {
  return name.replace(NAME_REGEX, '').trim()
}

export function formatBookAuthor(author: string): string {
  return author.replace(AUTHOR_REGEX, '').trim()
}

export function isValidBookName(name: string): boolean {
  if (!name || name.length > NAME_MAX_LENGTH) return false
  const tagCount = (name.match(/<\/?[a-zA-Z][^>]*>/g) || []).length
  if (tagCount > MAX_TAG_COUNT) return false
  return true
}

export function cleanIntro(intro: string, maxLength: number = INTRO_MAX_LENGTH): string {
  if (!intro) return ''
  const trimmed = String(intro).trim()
  if (trimmed.startsWith('<usehtml>') || trimmed.startsWith('<md>') || trimmed.startsWith('<useweb>')) {
    return trimmed
  }
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

export function formatWordCount(raw: string): string {
  const num = parseInt(String(raw).replace(/[^\d]/g, ''), 10)
  if (isNaN(num) || num < 0) return raw || ''
  if (num < WORD_COUNT_THRESHOLD) return String(num)
  return (num / WORD_COUNT_THRESHOLD).toFixed(1) + '万'
}

export function matchesBookUrlPattern(url: string, pattern: string | null | undefined): boolean {
  if (!pattern) return false
  try {
    return new RegExp(pattern).test(url)
  } catch {
    return false
  }
}

export async function parseSearchItem(
  item: any,
  source: EngineBookSource,
  baseUrl: string,
  ruleName: string,
  ruleAuthor: string,
  ruleKind: string,
  ruleCoverUrl: string,
  ruleWordCount: string,
  ruleIntro: string,
  ruleLastChapter: string,
  ruleBookUrl: string,
  key: string,
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null,
): Promise<EngineBook | null> {
  const bookPlaceholder: Partial<EngineBook> = {}
  const itemCtx = { source, baseUrl, result: item, book: bookPlaceholder, key, page }

  const rawName = await getString(item, ruleName, itemCtx)
  const nameRawStr = extractString(rawName)
  const name = formatBookName(nameRawStr)
  if (!name || !isValidBookName(name)) return null

  const rawAuthor = await getString(item, ruleAuthor, itemCtx)
  const authorRawStr = extractString(rawAuthor)
  const author = formatBookAuthor(authorRawStr) || '未知作者'

  let kind: string | null = null
  try {
    const kindList = await getStringList(item, ruleKind, itemCtx)
    if (kindList && kindList.length > 0) {
      kind = kindList.join(',')
      bookPlaceholder.kind = kind
    }
  } catch {
    // ignore
  }

  if (filter && filter(name, author, kind) === false) return null

  let wordCount: string | null = null
  try {
    const wc = await getString(item, ruleWordCount, itemCtx)
    const wcStr = extractString(wc)
    if (wcStr) wordCount = formatWordCount(wcStr)
  } catch {
    // ignore
  }

  let lastChapter: string | null = null
  try {
    const raw = await getString(item, ruleLastChapter, itemCtx)
    const str = extractString(raw)
    if (str) lastChapter = str
  } catch {
    // ignore
  }

  let intro: string | null = null
  try {
    if (ruleIntro) {
      const rawIntro = await getString(item, ruleIntro, itemCtx)
      const introStr = extractString(rawIntro)
      if (introStr) {
        intro = cleanIntro(introStr)
      }
    }
  } catch {
    // ignore
  }

  let coverUrl: string | null = null
  try {
    const rawCover = await getString(item, ruleCoverUrl, itemCtx)
    const coverStr = extractString(rawCover, true)
    if (coverStr) {
      coverUrl = resolveUrl(coverStr, baseUrl)
    }
  } catch {
    // ignore
  }

  const bookUrlStr = await getString(item, ruleBookUrl, itemCtx)
  let bookUrlRaw = extractString(bookUrlStr, true)
  const urlParts = bookUrlRaw.split(/[\n\r\t ]+/).filter(Boolean)
  bookUrlRaw = urlParts.length > 0 ? urlParts[0] : bookUrlRaw
  const resolvedBookUrl = bookUrlRaw ? resolveUrl(bookUrlRaw, baseUrl) : baseUrl

  return {
    name,
    author,
    bookUrl: resolvedBookUrl,
    coverUrl,
    intro,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount,
  }
}

export async function parseInfoItem(
  source: EngineBookSource,
  baseUrl: string,
  body: string,
  key: string,
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null,
): Promise<EngineBook | null> {
  const rule = source.ruleBookInfo
  if (!rule) return null

  const ctx = { source, baseUrl, result: body, book: {}, key, page }

  const rawName = await getString(body, rule.name || '', ctx)
  const nameRawStr = extractString(rawName)
  const name = formatBookName(nameRawStr)
  if (!name || !isValidBookName(name)) return null

  if (filter && filter(name, '', null) === false) return null

  const rawAuthor = await getString(body, rule.author || '', ctx)
  const authorRawStr = extractString(rawAuthor)
  const author = formatBookAuthor(authorRawStr) || '未知作者'

  const rawCover = await getString(body, rule.coverUrl || '', ctx)
  const coverStr = extractString(rawCover, true)
  const coverUrl = coverStr ? resolveUrl(String(coverStr), baseUrl) : null

  const rawIntro = await getString(body, rule.intro || '', ctx)
  const introStr = extractString(rawIntro)
  const intro = introStr ? cleanIntro(introStr) : null

  const rawKind = await getString(body, rule.kind || '', ctx)
  const kindStr = extractString(rawKind)
  const kind = kindStr || null

  const rawLastChapter = await getString(body, rule.lastChapter || '', ctx)
  const lastChapterStr = extractString(rawLastChapter)
  const lastChapter = lastChapterStr || null

  return {
    name,
    author,
    bookUrl: baseUrl,
    coverUrl,
    intro,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: null,
  }
}
