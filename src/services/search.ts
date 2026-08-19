// ============================================
// 搜索服务 — 对齐 Legado 搜索解析
// ============================================

import { parseSearchItem, parseInfoItem, matchesBookUrlPattern } from '@engine/business/search/parser.js'
import { analyzeUrl, resolveUrl } from '@engine/url/index.js'
import { getGlobalHttpClient } from '@engine/network/client.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { getElements, getString } from '@engine/parser/index.js'
import { logInfo, logError } from '@engine/log/index.js'
import { handleError } from '@/utils/error-handler.js'
import { shouldExecuteInDeno, evaluateRule } from './rule-evaluator.js'
import { fetchWithWebviewFallback } from './fetch.js'
import type { Book, BookSource, ParseContext } from '@/types'
import { NETWORK } from '@/constants/index.js'

export async function search(
  source: BookSource,
  keyword: string,
  options: {
    page?: number
    signal?: AbortSignal
    filter?: ((name: string, author: string, kind: string | null) => boolean) | null
    shouldBreak?: ((size: number) => boolean) | null
  } = {},
): Promise<Book[]> {
  const page = options.page || 1
  const searchUrl = source.searchUrl || ''
  if (!searchUrl) {
    logError('search', 'frontend', '[搜索] searchUrl 为空')
    return []
  }

  logInfo('search', 'frontend', `[搜索] 开始 keyword=${keyword}`)
  const headerMap = await parseSourceHeader(source)
  const urlAnalysis = await analyzeUrl(searchUrl, {
    key: keyword, page, source, baseUrl: source.bookSourceUrl || '', headerMap,
  })

  try {
    const html = await fetchWithWebviewFallback(urlAnalysis.url, {
      method: urlAnalysis.method,
      headers: urlAnalysis.headers,
      body: urlAnalysis.body,
      source,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })

    if (!html) return []

    const baseUrl = source.bookSourceUrl || ''
    const rule = source.ruleSearch
    if (!rule || !rule.bookList) return []

    // checkKeyWord 校验
    if (rule.checkKeyWord) {
      const checkResult = await getString(html, rule.checkKeyWord, { source, baseUrl, result: html } as ParseContext)
      if (!checkResult || checkResult.trim() === '') {
        logInfo('search', 'frontend', '[搜索] checkKeyWord 校验失败，页面可能无效')
        return []
      }
    }

    if (source.bookUrlPattern && matchesBookUrlPattern(urlAnalysis.url, source.bookUrlPattern)) {
      const book = await parseInfoItem(source, baseUrl, html, urlAnalysis.url, keyword, page, options.filter || null)
      return book ? [book] : []
    }

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    const ctx: ParseContext = { source, baseUrl, key: keyword, page, book: {} }

    let collections: any[]
    if (shouldExecuteInDeno(listRule)) {
      const result = await evaluateRule(listRule, html, ctx)
      collections = Array.isArray(result) ? result : []
    } else {
      collections = await getElements(html, listRule, ctx)
    }

    if ((!collections || !Array.isArray(collections) || collections.length === 0) && !source.bookUrlPattern) {
      const book = await parseInfoItem(source, baseUrl, html, urlAnalysis.url, keyword, page, options.filter || null)
      return book ? [book] : []
    }
    if (!collections || !Array.isArray(collections) || collections.length === 0) return []

    const books: Book[] = []
    for (const item of collections) {
      if (options.signal?.aborted) break

      const book = await parseSearchItem(
        item, source, baseUrl,
        rule.name || '',
        rule.author || '',
        rule.kind || '',
        rule.coverUrl || '',
        rule.wordCount || '',
        rule.intro || '',
        rule.lastChapter || '',
        rule.bookUrl || '',
        keyword,
        page,
        options.filter || null
      )

      if (book) {
        if (book.coverUrl) {
          logInfo('search', 'frontend', `[搜索] 书籍封面: ${book.name} -> ${book.coverUrl}`)
        }
        books.push(book as Book)
      }
    }

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      const key = `${book.name}|${book.author}`
      if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
    }
    if (reverse) uniqueBooks.reverse()
    logInfo('search', 'frontend', `[搜索] 完成 ${uniqueBooks.length} 本书`)
    return uniqueBooks
  } catch (err) {
    handleError(err, {
      module: 'search',
      operation: 'search',
      sourceUrl: source.bookSourceUrl,
      userMessage: '搜索失败，请检查书源或网络',
    })
    return []
  }
}

export async function batchSearch(
  sources: BookSource[],
  keyword: string,
  options: { page?: number; signal?: AbortSignal; concurrency?: number } = {},
): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = options.concurrency || NETWORK.CONCURRENCY
  const queue = [...sources]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const source = queue.shift()
      if (!source) break
      const key = `${source.bookSourceName || source.bookSourceUrl || 'unknown'}::${source.bookSourceUrl || ''}`
      try {
        results.set(key, await search(source, keyword, { page: options.page, signal: options.signal }))
      } catch {
        results.set(key, [])
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) workers.push(worker())
  await Promise.all(workers)
  return results
}
