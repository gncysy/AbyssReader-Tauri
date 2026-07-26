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
      const headers = await parseHeader(source)
      const response = await httpClient.request({
        url: bookUrl,
        method: 'GET',
        headers,
        timeout: 30000,
        sourceType: source.bookSourceType ?? 0,  // ← 直接传书源类型
      })
      if (response.status < 200 || response.status >= 300) return null
      html = response.data as string
      if (response.url && response.url !== bookUrl) finalRedirectUrl = response.url
    } catch { return null }
  }

  if (!html || typeof html !== 'string') return null

  const ctx = { source, baseUrl: source.bookSourceUrl, result: html }

  if (rule.init) {
    try {
      const initResult = await getString(html, rule.init, ctx)
      if (initResult && typeof initResult === 'string') {
        html = initResult
        ctx.result = initResult
      }
    } catch {}
  }

  const name = await getString(html, rule.name || '', ctx) || '未命名'
  const author = await getString(html, rule.author || '', ctx) || '未知作者'
  const kind = await getString(html, rule.kind || '', ctx) || ''
  const lastChapter = await getString(html, rule.lastChapter || '', ctx) || ''
  const intro = cleanIntro(await getString(html, rule.intro || '', ctx) || '')
  const coverUrl = await getString(html, rule.coverUrl || '', ctx) || ''
  const tocUrl = await getString(html, rule.tocUrl || '', ctx) || bookUrl

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
