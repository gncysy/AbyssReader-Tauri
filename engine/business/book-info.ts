// ============================================
// 书籍详情
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import type { Book, BookSource } from '../../src/shared/types.js'
import type { BookInfoOptions } from '../types.js'

function cleanIntro(intro: string, maxLength: number = 500): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

export async function getBookInfo(
  source: BookSource,
  bookUrl: string,
  options: BookInfoOptions = {}
): Promise<Book | null> {
  if (!bookUrl) return null

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleBookInfo
  if (!rule) return null

  const { redirectUrl = bookUrl, cachedHtml } = options
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({ url: bookUrl, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return null
      html = response.data as string
      if (response.url && response.url !== bookUrl) finalRedirectUrl = response.url
    } catch { return null }
  }

  if (!html || typeof html !== 'string') return null

  const ctx = { source, baseUrl: source.bookSourceUrl, result: html }

  if (rule.init) {
    try {
      const initResult = getString(html, rule.init, ctx)
      if (initResult && typeof initResult === 'string') {
        html = initResult
        ctx.result = initResult
      }
    } catch {}
  }

  const name = getString(html, rule.name || '', ctx) || '未命名'
  const author = getString(html, rule.author || '', ctx) || '未知作者'
  const kind = getString(html, rule.kind || '', ctx) || ''
  const lastChapter = getString(html, rule.lastChapter || '', ctx) || ''
  const intro = cleanIntro(getString(html, rule.intro || '', ctx) || '')
  const coverUrl = getString(html, rule.coverUrl || '', ctx) || ''
  const tocUrl = getString(html, rule.tocUrl || '', ctx) || bookUrl

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), finalRedirectUrl) : null,
    intro: intro || null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: tocUrl ? resolveUrl(String(tocUrl), finalRedirectUrl) : null,
  }
}
