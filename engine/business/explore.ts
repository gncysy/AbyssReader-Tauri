// ============================================
// 发现页
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import type { Book, BookSource } from '../../src/shared/types.js'

function cleanIntro(intro: string, maxLength: number = 200): string {
  return String(intro).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, maxLength)
}

export interface Category {
  title: string
  url: string
}

function parseBookItem(item: any, source: BookSource, rule: any, ctx: any): Book | null {
  const name = getString(item, rule.name || '', ctx)
  if (!name) return null
  const author = getString(item, rule.author || '', ctx) || '未知作者'
  const coverUrl = getString(item, rule.coverUrl || rule.cover || '', ctx)
  const intro = getString(item, rule.intro || '', ctx)
  let bookUrl = getString(item, rule.bookUrl || '', ctx)

  if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
    bookUrl = item.id || item.bookUrl || `book_${Date.now()}`
  }

  const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), source.bookSourceUrl)

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl: resolvedBookUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.bookSourceUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: getString(item, rule.kind || '', ctx) || null,
    lastChapter: getString(item, rule.lastChapter || '', ctx) || null,
  }
}

export function getExploreCategories(source: BookSource): Category[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({ title: item.title || '未命名', url: item.url || '' }))
      }
    } catch {}
  }

  if (trimmed.includes('\n') && trimmed.includes('::')) {
    return trimmed
      .split('\n')
      .filter((line: string) => line.includes('::'))
      .map((line: string) => {
        const [title, url] = line.split('::').map((s: string) => s.trim())
        return { title, url }
      })
  }

  return []
}

export async function getExploreBooks(
  source: BookSource,
  categoryUrl: string,
  page: number = 1
): Promise<Book[]> {
  if (!categoryUrl) return []

  const httpClient = getGlobalHttpClient()
  let url = categoryUrl.replace(/\{\{page\}\}/g, String(page))

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = resolveUrl(url, source.bookSourceUrl)
  }

  try {
    const response = await httpClient.request({
      url, method: 'GET',
      headers: source.header ? JSON.parse(source.header) : {},
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) return []

    const rule = source.ruleExplore?.bookList ? source.ruleExplore : source.ruleSearch
    if (!rule || !rule.bookList) return []

    const ctx = { source, baseUrl: source.bookSourceUrl, page }
    const bookList = getElements(response.data, rule.bookList, ctx)
    if (!bookList || !Array.isArray(bookList)) return []

    const books: Book[] = []
    for (const item of bookList) {
      const book = parseBookItem(item, source, rule, ctx)
      if (book) books.push(book)
    }
    return books
  } catch { return [] }
}
