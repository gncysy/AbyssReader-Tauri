// ============================================
// 发现页书籍解析 — 纯函数 + 可注入 HttpClient
// ============================================

import { getElements, getString, getStringList, resolveUrl, createAnalyzer } from '../../index.js'
import type { EngineBook, EngineBookSource } from '../../types.js'
import type { ParseContext } from '../../types.js'
import type { HttpClient } from '../../network/client.js'
import { getGlobalHttpClient } from '../../network/client.js'
import {
  formatBookName, formatBookAuthor, isValidBookName,
  cleanIntro, formatWordCount, parseSearchItem, parseInfoItem,
} from '../search/parser.js'
import { getExploreCategories } from './categories.js'
import type { ExploreKind } from './categories.js'

export { getExploreCategories }
export type { ExploreKind }

export async function executeExploreJs(source: EngineBookSource, jsCode: string): Promise<ExploreKind[]> {
  try {
    const { getJsRuntime } = await import('../../parser/js-executor.js')
    const runtime = getJsRuntime()
    if (!runtime) return []

    const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: {}, key: '', page: 1 }
    const result = await runtime.execute(jsCode, ctx)
    if (!result) return []

    let parsed: any
    if (typeof result === 'string') {
      const trimmed = result.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { parsed = JSON.parse(trimmed) } catch { return [] }
      } else { return [] }
    } else { parsed = result }

    if (!Array.isArray(parsed)) return []
    return parsed.filter((item: any) => item && typeof item === 'object').map((item: any) => ({
      title: String(item.title || ''), url: item.url ? String(item.url) : null,
      type: (item.type || 'url') as ExploreKind['type'],
      action: item.action ? String(item.action) : null,
      chars: item.chars ? [...item.chars].map(String) : null,
      default: item.default ? String(item.default) : null,
      viewName: item.viewName ? String(item.viewName) : null,
      style: item.style ? { ...item.style } : null,
    })).filter((k: ExploreKind) => k.title)
  } catch { return [] }
}

export async function getExploreCategoriesAsync(source: EngineBookSource): Promise<ExploreKind[]> {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []
  const trimmed = exploreUrl.trim()
  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    const jsCode = trimmed.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '')
    return executeExploreJs(source, jsCode)
  }
  return getExploreCategories(source)
}

export async function getExploreBooks(
  source: EngineBookSource,
  categoryUrlOrHtml: string,
  page = 1,
  httpClient?: HttpClient,
  isHtml = false
): Promise<EngineBook[]> {
  if (!categoryUrlOrHtml) return []
  const client = httpClient || getGlobalHttpClient()

  let html: string
  let baseUrl: string

  if (isHtml) {
    html = categoryUrlOrHtml
    baseUrl = source.bookSourceUrl || ''
  } else {
    let url = categoryUrlOrHtml.replace(/\{\{page\}\}/g, String(page))
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = resolveUrl(url, source.bookSourceUrl)
    }

    try {
      const { parseSourceHeader } = await import('../source/helper.js')
      const headers = await parseSourceHeader(source)
      const response = await client.request({ url, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return []
      html = response.data as string
      baseUrl = response.url || source.bookSourceUrl || ''
    } catch {
      return []
    }
  }

  const exploreRule = source.ruleExplore
  const searchRule = source.ruleSearch
  const rule = exploreRule?.bookList ? exploreRule : searchRule
  if (!rule || !rule.bookList) return []

  let listRule = rule.bookList || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const ctx: ParseContext = { source, baseUrl, page, book: {}, key: '' }
  const collections = await getElements(html, listRule, ctx)

  if ((!collections || !Array.isArray(collections) || collections.length === 0) && !source.bookUrlPattern) {
    const book = await parseInfoItem(source, baseUrl, html, '', page)
    return book ? [book] : []
  }
  if (!collections || !Array.isArray(collections) || collections.length === 0) return []

  const books: EngineBook[] = []
  for (const item of collections) {
    const book = await parseSearchItem(item, source, baseUrl,
      rule.name || '', rule.author || '', rule.kind || '', rule.coverUrl || '',
      rule.wordCount || '', rule.intro || '', rule.lastChapter || '', rule.bookUrl || '', '', page)
    if (book) books.push(book)
  }

  const seen = new Set<string>()
  const uniqueBooks: EngineBook[] = []
  for (const book of books) {
    const key = `${book.name}|${book.author}`
    if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
  }
  if (reverse) uniqueBooks.reverse()
  return uniqueBooks
}
