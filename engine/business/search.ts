import { emitLog } from '../event/index.js'
// ============================================
// 搜索（对齐 Legado BookList）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, parseRule } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import type { Book, BookSource } from '../../src/shared/types.js'
import type { SearchOptions, ParseContext } from '../types.js'

function cleanIntro(intro: string, maxLength: number = 200): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

function formatWordCount(raw: string): string {
  const num = parseInt(String(raw).replace(/[^\d]/g, ''), 10)
  if (isNaN(num) || num < 0) return raw || ''
  if (num < 10000) return String(num)
  return (num / 10000).toFixed(1) + '万'
}

async function parseBookItem(
  item: any,
  source: BookSource,
  ctx: ParseContext,
  rules: {
    name: string
    author: string
    bookUrl: string
    coverUrl: string
    intro: string
    kind: string
    lastChapter: string
    wordCount: string
  },
  baseUrl: string
): Book | null {
  const itemCtx = { ...ctx, result: item }

  const name = await getString(item, rules.name, itemCtx)
  if (!name || !name.trim()) return null

  const author = await getString(item, rules.author, itemCtx) || '未知作者'
  let bookUrl = await getString(item, rules.bookUrl, itemCtx)

  if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
    bookUrl = item.bookUrl || item.id || item.url || item.href || ''
  }

  const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), baseUrl)

  const coverUrl = await getString(item, rules.coverUrl, itemCtx)
  const intro = await getString(item, rules.intro, itemCtx)
  const kind = await getString(item, rules.kind, itemCtx)
  const lastChapter = await getString(item, rules.lastChapter, itemCtx)
  const wordCountRaw = await getString(item, rules.wordCount, itemCtx)

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl: resolvedBookUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), baseUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount: wordCountRaw ? formatWordCount(String(wordCountRaw)) : null,
  }
}

function matchesBookUrlPattern(url: string, pattern: string | null | undefined): boolean {
  if (!pattern) return false
  try {
    const regex = new RegExp(pattern)
    return regex.test(url)
  } catch {
    return false
  }
}

async function parseHeader(source: BookSource): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (source.header) {
      if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
        const { executeJs } = await import('../core/rule-parser/js.js')
        const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: {} }
        const headerResult = await executeJs('', source.header, ctx)
        try { Object.assign(result, JSON.parse(headerResult)) } catch {
          try { Object.assign(result, JSON.parse(headerResult.replace(/'/g, '"'))) } catch {}
        }
      } else {
        try { Object.assign(result, JSON.parse(source.header)) } catch {
          try { Object.assign(result, JSON.parse((source.header || '{}').replace(/'/g, '"'))) } catch {}
        }
      }
    }
  } catch {}
  return result
}

export async function search(
  source: BookSource,
  keyword: string,
  options: SearchOptions & { signal?: AbortSignal } = {}
): Promise<Book[]> {
  emitLog('info', '[搜索] 开始 keyword=' + keyword)
  const page = options.page || 1
  const httpClient = getGlobalHttpClient()

  const searchUrl = source.searchUrl || ''
  emitLog('debug', '[搜索] searchUrl前100=' + searchUrl.substring(0, 100))
  if (!searchUrl) { emitLog('warn', '[搜索] searchUrl为空'); return [] }

  const headerMap = await parseHeader(source)

  emitLog('debug', '[搜索] 开始analyzeUrl')
  const urlAnalysis = await analyzeUrl(searchUrl, {
    key: keyword,
    page,
    source,
    baseUrl: source.bookSourceUrl || '',
    headerMap,
  })

  try {
    if (options.signal?.aborted) return []

    emitLog('debug', '[搜索] 发起HTTP请求 url=' + urlAnalysis.url.substring(0, 100))
    const response = await httpClient.request({
      url: urlAnalysis.url,
      method: urlAnalysis.method,
      headers: urlAnalysis.headers,
      body: urlAnalysis.body,
      timeout: options.timeout || 30000,
      useWebView: urlAnalysis.useWebView,
      webJs: urlAnalysis.webJs,
      sourceType: source.bookSourceType ?? 0,
    })

    if (response.status < 200 || response.status >= 300) { emitLog('warn', '[搜索] HTTP状态异常: ' + response.status); return [] }

    const html = response.data as string
    const baseUrl = response.url || source.bookSourceUrl || ''

    const rule = source.ruleSearch
    if (!rule || !rule.bookList) return []

    const ctx: ParseContext = { source, baseUrl, key: keyword, page, book: {} }

    if (source.bookUrlPattern && matchesBookUrlPattern(urlAnalysis.url, source.bookUrlPattern)) {
      const book = await parseAsDetailPage(source, html, baseUrl, ctx)
      return book ? [book] : []
    }

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    const collections = await getElements(html, listRule, ctx)

    if ((!collections || !Array.isArray(collections) || collections.length === 0) && !source.bookUrlPattern) {
      const book = await parseAsDetailPage(source, html, baseUrl, ctx)
      return book ? [book] : []
    }

    if (!collections || !Array.isArray(collections) || collections.length === 0) return []

    const rules = {
      name: rule.name || '',
      author: rule.author || '',
      bookUrl: rule.bookUrl || '',
      coverUrl: rule.coverUrl || '',
      intro: rule.intro || '',
      kind: rule.kind || '',
      lastChapter: rule.lastChapter || '',
      wordCount: rule.wordCount || '',
    }

    const books: Book[] = []
    for (const item of collections) {
      if (options.signal?.aborted) break
      const book = await parseBookItem(item, source, ctx, rules, baseUrl)
      if (book) books.push(book)
    }

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      if (!seen.has(book.bookUrl)) { seen.add(book.bookUrl); uniqueBooks.push(book) }
    }

    if (reverse) uniqueBooks.reverse()
    emitLog('info', '[搜索] 完成 找到' + uniqueBooks.length + '本')
    return uniqueBooks
  } catch (e: any) { emitLog('error', '[搜索] 异常: ' + (e?.message || e)); return [] }
}

async function parseAsDetailPage(source: BookSource, html: string, baseUrl: string, ctx: ParseContext): Promise<Book | null> {
  const rule = source.ruleBookInfo; if (!rule) return null
  const bookCtx = { ...ctx, result: html }
  const name = await getString(html, rule.name || '', bookCtx); if (!name || !name.trim()) return null
  const author = await getString(html, rule.author || '', bookCtx) || '未知作者'
  const coverUrl = await getString(html, rule.coverUrl || '', bookCtx)
  const intro = await getString(html, rule.intro || '', bookCtx)
  const kind = await getString(html, rule.kind || '', bookCtx)
  const lastChapter = await getString(html, rule.lastChapter || '', bookCtx)
  const tocUrl = await getString(html, rule.tocUrl || '', bookCtx)
  return {
    name: String(name).trim(), author: String(author).trim(), bookUrl: baseUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), baseUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null, kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: tocUrl ? resolveUrl(String(tocUrl), baseUrl) : null,
  }
}

export async function batchSearch(sources: BookSource[], keyword: string, options: SearchOptions = {}): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = 5; const queue = [...sources]
  const worker = async () => { while (queue.length > 0) { const source = queue.shift(); if (!source) break; const key = source.bookSourceName || 'source'; try { results.set(key, await search(source, keyword, options)) } catch { results.set(key, []) } } }
  const promises: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) promises.push(worker())
  await Promise.all(promises)
  return results
}
