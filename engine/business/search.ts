// ============================================
// 搜索
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import type { Book, BookSource } from '../../src/shared/types.js'
import type { SearchOptions } from '../types.js'

function cleanIntro(intro: string, maxLength: number = 200): string {
  return String(intro).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, maxLength)
}

function parseBookItem(item: any, source: BookSource, rule: any, ctx: any): Book | null {
  const name = getString(item, rule.name || '', ctx)
  if (!name) return null
  const author = getString(item, rule.author || '', ctx) || '未知作者'
  const coverUrl = getString(item, rule.coverUrl || rule.cover || '', ctx)
  const intro = getString(item, rule.intro || '', ctx)
  let bookUrl = getString(item, rule.bookUrl || '', ctx)
  const lastChapter = getString(item, rule.lastChapter || '', ctx)
  const kind = getString(item, rule.kind || '', ctx)

  if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
    bookUrl = item.id || item.bookUrl || `book_${Date.now()}_${String(name).slice(0, 10)}`
  }

  const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), source.bookSourceUrl || '')

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl: resolvedBookUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.bookSourceUrl || '') : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
  }
}

export async function search(source: BookSource, keyword: string, options: SearchOptions & { signal?: AbortSignal } = {}): Promise<Book[]> {
  const page = options.page || 1
  const httpClient = getGlobalHttpClient()

  const searchUrl = source.searchUrl || ''
  if (!searchUrl) return []

  const urlAnalysis = await analyzeUrl(searchUrl, {
    key: keyword, page, source, baseUrl: source.bookSourceUrl || '',
    headerMap: source.header ? JSON.parse((source.header || '{}').replace(/'/g, '"')) : {},
  })

  try {
    if (options.signal?.aborted) return []
    const response = await httpClient.request({
      url: urlAnalysis.url, method: urlAnalysis.method,
      headers: urlAnalysis.headers, body: urlAnalysis.body,
      timeout: options.timeout || 30000,
    })
    if (response.status < 200 || response.status >= 300) return []

    const rule = source.ruleSearch
    if (!rule || !rule.bookList) return []

    const ctx = { source, baseUrl: source.bookSourceUrl, key: keyword, page, book: {} }
    const bookList = getElements(response.data, rule.bookList, ctx)
    if (!bookList || !Array.isArray(bookList) || bookList.length === 0) return []

    const books: Book[] = []
    for (const item of bookList) {
      const book = parseBookItem(item, source, rule, ctx)
      if (book) books.push(book)
    }
    return books
  } catch { return [] }
}

export async function batchSearch(sources: BookSource[], keyword: string, options: SearchOptions = {}): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = 5
  const queue = [...sources]
  const worker = async () => {
    while (queue.length > 0) {
      const source = queue.shift()
      if (!source) break
      const key = source.bookSourceName || 'source'
      try { results.set(key, await search(source, keyword, options)) } catch { results.set(key, []) }
    }
  }
  const promises: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) promises.push(worker())
  await Promise.all(promises)
  return results
}
