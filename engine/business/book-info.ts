// ============================================
// 书籍详情（对齐 Legado BookInfo）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getStringList } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import { parseSourceHeader } from './source-helper.js'
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
  options: BookInfoOptions & { canReName?: boolean } = {}
): Promise<Book | null> {
  if (!bookUrl) return null

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleBookInfo
  if (!rule) return null

  const { redirectUrl = bookUrl, cachedHtml, canReName = false } = options
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = await parseSourceHeader(source)
      console.log('[book-info] 请求 bookUrl=' + bookUrl + ' headers=' + JSON.stringify(headers))
      const response = await httpClient.request({
        url: bookUrl,
        method: 'GET',
        headers,
        timeout: 30000,
        sourceType: source.bookSourceType ?? 0,
      })
      console.log('[book-info] 响应 status=' + response.status + ' 数据长度=' + (response.data ? String(response.data).length : 0))
      if (response.status < 200 || response.status >= 300) { console.log('[book-info] 状态码异常,返回null'); return null }
      html = response.data as string
      if (response.url && response.url !== bookUrl) finalRedirectUrl = response.url
    } catch (e) { console.log('[book-info] 请求异常', e); return null }
  }

  if (!html || typeof html !== 'string') { console.log('[book-info] html为空'); return null }

  console.log('[book-info] html前200=' + html.substring(0, 200))

  const bookPlaceholder: Partial<Book> = {}
  const ctx = { source, baseUrl: source.bookSourceUrl, result: html, book: bookPlaceholder }

  if (rule.init) {
    try {
      const { getElement } = await import('../core/rule-parser/index.js')
      const initResult = await getElement(html, rule.init, ctx)
      if (initResult) {
        const initHtml = typeof initResult === 'string' ? initResult :
          (initResult.outerHTML || initResult.html || initResult)
        if (initHtml && typeof initHtml === 'string') {
          html = initHtml
          ctx.result = initHtml
        }
      }
    } catch {}
  }

  const name = await getString(html, rule.name || '', ctx) || '未命名'
  console.log('[book-info] name=' + name)

  const author = await getString(html, rule.author || '', ctx) || '未知作者'

  let kind = ''
  try {
    const kindList = await getStringList(html, rule.kind || '', ctx)
    console.log('[book-info] kindList=' + JSON.stringify(kindList))
    if (kindList && kindList.length > 0) {
      kind = kindList.join(',')
      bookPlaceholder.kind = kind
    }
  } catch {}
  console.log('[book-info] kind=' + kind + ' bookPlaceholder.kind=' + bookPlaceholder.kind)

  let wordCount = ''
  try {
    wordCount = await getString(html, (rule as any).wordCount || '', ctx) || ''
  } catch {}

  const lastChapter = await getString(html, rule.lastChapter || '', ctx) || ''

  let intro = ''
  try {
    const rawIntro = await getString(html, rule.intro || '', ctx) || ''
    const introTrimS = rawIntro.trimStart()
    if (introTrimS.startsWith('<usehtml>') || introTrimS.startsWith('<md>') || introTrimS.startsWith('<useweb>')) {
      intro = introTrimS
    } else {
      intro = cleanIntro(rawIntro)
    }
  } catch {}

  let coverUrl: string | null = null
  try {
    const rawCover = await getString(html, rule.coverUrl || '', ctx) || ''
    if (rawCover) {
      coverUrl = resolveUrl(rawCover, finalRedirectUrl)
    }
  } catch {}

  let tocUrl = ''
  try {
    console.log('[book-info] tocUrl规则=' + (rule.tocUrl || 'EMPTY') + ' bookPlaceholder.kind=' + bookPlaceholder.kind)
    tocUrl = await getString(html, rule.tocUrl || '', ctx) || ''
    console.log('[book-info] tocUrl结果=' + tocUrl)
  } catch(e) { console.log('[book-info] tocUrl异常', e) }
  if (!tocUrl) tocUrl = finalRedirectUrl

  const result = {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl,
    coverUrl,
    intro: intro || null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount: wordCount || null,
    tocUrl: tocUrl ? resolveUrl(String(tocUrl), finalRedirectUrl) : null,
  }
  console.log('[book-info] 返回结果 tocUrl=' + result.tocUrl)
  return result
}