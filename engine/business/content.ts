import { emitLog } from '../event/index.js'
// ============================================
// 正文解析（完整对齐 Legado BookContent.kt）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import { parseSourceHeader } from './source-helper.js'
import type { BookSource, Chapter, Book } from '../../src/shared/types.js'
import type { ContentOptions } from '../types.js'

const MAX_PAGES = 20

const NBSP_REGEX = /(&nbsp;)+/g
const ESP_REGEX = /&ensp;|&emsp;/g
const NO_PRINT_REGEX = /&thinsp;|&zwnj;|&zwj;|\u2009|\u200C|\u200D/g
const WRAP_HTML_REGEX = /<\/?(?:div|p|br|hr|h\d|article|dd|dl)[^>]*>/gi
const COMMENT_REGEX = /<!--[\s\S]*?-->/g
const NOT_IMG_HTML_REGEX = /<\/?(?!img)[a-zA-Z]+(?=[ >])[^<>]*>/gi
const INDENT1_REGEX = /\s*\n+\s*/g
const INDENT2_REGEX = /^[\n\s]+/
const LAST_REGEX = /[\n\s]+$/

const FORMAT_IMAGE_PATTERN = /<img[^>]*\ssrc\s*=\s*['"]([^'"{}>]*\{(?:[^{}]|\{[^}>]+\})+\})['"][^>]*>|<img[^>]*\sdata-(?:src|original|srcset)\s*=\s*['"]([^'">]+)['"][^>]*>|<img[^>]*\ssrc\s*=\s*"([^">]+)"[^>]*>|<img[^>]*\s(?:data-[^=>]*|src)=\s*['"]([^'">]*)['"][^>]*>/gi

function injectImageStyle(html: string, imageStyle: string | null | undefined): string {
  if (!imageStyle) return html
  let style = ''
  if (imageStyle === 'FULL' || imageStyle === 'full') style = 'width:100%;height:auto;'
  else if (imageStyle === 'center' || imageStyle === 'CENTER') style = 'display:block;margin:0 auto;max-width:100%;height:auto;'
  else if (imageStyle.startsWith('{')) {
    try { const p = JSON.parse(imageStyle.replace(/'/g, '"')); style = p.style || p.css || '' } catch { style = imageStyle }
  } else style = imageStyle
  if (!style) return html
  return html.replace(/<img\s/g, '<img style="' + style + '" ')
}

function formatKeepImg(html: string, redirectUrl: string, imageStyle: string | null | undefined): string {
  let result = html
    .replace(NBSP_REGEX, ' ').replace(ESP_REGEX, ' ').replace(NO_PRINT_REGEX, '')
    .replace(WRAP_HTML_REGEX, '\n').replace(COMMENT_REGEX, '').replace(NOT_IMG_HTML_REGEX, '')
    .replace(INDENT1_REGEX, '\n\u3000\u3000').replace(INDENT2_REGEX, '\u3000\u3000').replace(LAST_REGEX, '')

  let appendPos = 0; const sb: string[] = []
  const regex = new RegExp(FORMAT_IMAGE_PATTERN.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = regex.exec(result)) !== null) {
    let param = ''; const group1 = match[1]; const rawSrc = group1 || match[2] || match[3] || match[4] || ''; let src = rawSrc
    if (group1) { const m = /,\s*(\{.*\})/.exec(rawSrc); if (m) { param = ',' + rawSrc.substring(m.index); src = rawSrc.substring(0, m.index) } }
    const styleAttr = imageStyle ? ' style="' + imageStyle + '"' : ''
    sb.push(result.substring(appendPos, match.index), '<img src="' + resolveUrl(src, redirectUrl) + param + '"' + styleAttr + '>')
    appendPos = regex.lastIndex; if (appendPos === 0) break
  }
  if (appendPos < result.length) sb.push(result.substring(appendPos))
  return sb.join('')
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n').trim()
}

async function analyzePage(
  book: Partial<Book>, baseUrl: string, redirectUrl: string, body: string,
  contentRule: NonNullable<BookSource['ruleContent']>, chapter: Partial<Chapter>,
  bookSource: BookSource, nextChapterUrl: string | null | undefined, getNextPageUrl: boolean
): Promise<{ content: string; nextUrls: string[] }> {
  const ctx = {
    source: bookSource,
    baseUrl: bookSource.bookSourceUrl || baseUrl,
    book: book || {},
    chapter: chapter || {},
    nextChapterUrl: nextChapterUrl || '',
    result: body,
  }
  const nextUrls: string[] = []
  let workingBody = body
  if (contentRule.sourceRegex) {
    try { const e = await getString(body, contentRule.sourceRegex, ctx); if (e && e.trim()) { workingBody = e; ctx.result = workingBody } } catch {}
  }
  let content = await getString(workingBody, contentRule.content || '', ctx)
  const isComic = bookSource.bookSourceType === 2
  if (!content || !content.trim()) content = isComic ? '' : stripHtml(workingBody)
  if (!isComic) {
    content = formatKeepImg(content, redirectUrl || baseUrl, contentRule.imageStyle || null)
    if (content.indexOf('&') > -1) content = content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  }
  if (getNextPageUrl && contentRule.nextContentUrl) {
    try {
      const r = await getElements(workingBody, contentRule.nextContentUrl, { ...ctx, isUrl: true })
      if (Array.isArray(r)) for (const u of r) { if (u && typeof u === 'string' && u.trim()) nextUrls.push(u.trim()) }
      else if (r && typeof r === 'string' && r.trim()) nextUrls.push(r.trim())
    } catch {}
  }
  return { content, nextUrls }
}

export async function getContent(
  source: BookSource, chapterUrl: string, options: ContentOptions = {}
): Promise<string> {
  emitLog('info', '[正文] 开始 url=' + chapterUrl.substring(0, 100))
  if (!chapterUrl) return '章节链接无效'
  const contentRule = source.ruleContent
  if (!contentRule || !contentRule.content) return '书源缺少正文规则'

  const httpClient = getGlobalHttpClient()
  const headers = await parseSourceHeader(source, options.book)
  const book = options.book || {}
  const chapter: Partial<Chapter> = { url: chapterUrl }
  const nextChapterUrl = options.nextChapterUrl || ''
  let bookKind = options.bookKind
  if (!bookKind && book) bookKind = (book as any).kind

  const contentList: string[] = []
  const nextUrlSet = new Set<string>()
  const isComic = source.bookSourceType === 2
  const useWebView = (contentRule.webView === true || (typeof contentRule.webView === 'string' && contentRule.webView === 'true'))

  let redirectUrl = options.redirectUrl || chapterUrl

  try {
    const urlAnalysis = await analyzeUrl(chapterUrl, {
      source, book: { ...book, kind: bookKind }, baseUrl: source.bookSourceUrl || '', headerMap: headers, chapter: { url: chapterUrl }
    })
    let requestBody: string | null = null
    if (urlAnalysis.method === 'POST' && urlAnalysis.body) {
      requestBody = typeof urlAnalysis.body === 'string' ? urlAnalysis.body : JSON.stringify(urlAnalysis.body)
    }
    const response = await httpClient.request({
      url: urlAnalysis.url, method: urlAnalysis.method, headers: urlAnalysis.headers,
      body: requestBody, timeout: 30000, useWebView: urlAnalysis.useWebView || useWebView,
      webJs: urlAnalysis.webJs || contentRule.webJs || null, sourceType: source.bookSourceType ?? 0
    })
    if (response.status < 200 || response.status >= 300) return '正文获取失败'
    const html = response.data as string
    if (!html || typeof html !== 'string') return '正文为空'
    if (response.url && response.url !== chapterUrl) redirectUrl = response.url

    const { content: pageContent, nextUrls } = await analyzePage(
      book, chapterUrl, redirectUrl, html, contentRule, chapter, source, nextChapterUrl, true
    )
    if (pageContent && pageContent.trim()) contentList.push(pageContent.trim())
    nextUrlSet.add(redirectUrl)

    if (nextUrls.length === 1) {
      let nextUrl = nextUrls[0]
      const webJs = contentRule.webJs || null
      for (let page = 1; page < MAX_PAGES; page++) {
        if (!nextUrl || nextUrlSet.has(nextUrl)) break
        if (nextChapterUrl) {
          if (resolveUrl(nextUrl, redirectUrl) === resolveUrl(nextChapterUrl, redirectUrl)) break
        }
        nextUrlSet.add(nextUrl)
        try {
          const na = await analyzeUrl(nextUrl, { source, book: { ...book, kind: bookKind }, baseUrl: source.bookSourceUrl || '', headerMap: headers, chapter: { url: nextUrl } })
          let nb: string | null = null
          if (na.method === 'POST' && na.body) nb = typeof na.body === 'string' ? na.body : JSON.stringify(na.body)
          const nr = await httpClient.request({ url: na.url, method: na.method, headers: na.headers, body: nb, timeout: 30000, useWebView: na.useWebView || useWebView, webJs: na.webJs || webJs, sourceType: source.bookSourceType ?? 0 })
          if (nr.status < 200 || nr.status >= 300) break
          const nh = nr.data as string
          if (!nh || typeof nh !== 'string') break
          const nrd = nr.url && nr.url !== nextUrl ? nr.url : redirectUrl
          const { content: npc, nextUrls: npu } = await analyzePage(
            book, nextUrl, nrd, nh, contentRule, chapter, source, nextChapterUrl, true
          )
          if (npc && npc.trim()) contentList.push(npc.trim())
          nextUrl = npu.length > 0 ? npu[0] : ''
        } catch (e: any) { console.warn('[Content] 翻页失败:', e?.message || e); break }
      }
    } else if (nextUrls.length > 1) {
      const cr = await Promise.all(nextUrls.map(async (u) => {
        if (nextUrlSet.has(u)) return null; nextUrlSet.add(u)
        try {
          const pa = await analyzeUrl(u, { source, book: { ...book, kind: bookKind }, baseUrl: source.bookSourceUrl || '', headerMap: headers, chapter: { url: u } })
          let pb: string | null = null
          if (pa.method === 'POST' && pa.body) pb = typeof pa.body === 'string' ? pa.body : JSON.stringify(pa.body)
          const pr = await httpClient.request({ url: pa.url, method: pa.method, headers: pa.headers, body: pb, timeout: 30000, useWebView: pa.useWebView || useWebView, webJs: pa.webJs, sourceType: source.bookSourceType ?? 0 })
          if (pr.status >= 200 && pr.status < 300) {
            const ph = pr.data as string
            if (ph && typeof ph === 'string') {
              const { content: pc } = await analyzePage(book, u, pr.url || redirectUrl, ph, contentRule, chapter, source, nextChapterUrl, false)
              return pc && pc.trim() ? pc.trim() : null
            }
          }
        } catch {}
        return null
      }))
      for (const r of cr) { if (r) contentList.push(r) }
    }

    if (contentRule.subContent) {
      try {
        const sc = await getString(contentList.join('\n'), contentRule.subContent, { source, baseUrl: source.bookSourceUrl || redirectUrl, book, chapter, result: contentList.join('\n') })
        if (sc && sc.trim()) {
          if (sc.trim().startsWith('http')) {
            try { const sr = await httpClient.request({ url: sc.trim(), method: 'GET', headers, timeout: 15000, sourceType: source.bookSourceType ?? 0 }); if (sr.status >= 200 && sr.status < 300) contentList.push((sr.data as string) || '') } catch { contentList.push(sc.trim()) }
          } else contentList.push(sc.trim())
        }
      } catch {}
    }

    // 分页内容直接拼接，不换行（本来就是同一章节的内容）
    let contentStr = contentList.join('')

    if (contentRule.replaceRegex) {
      try {
        const parts = contentRule.replaceRegex.split('##')
        if (parts.length >= 2) {
          const pattern = parts[1] || ''
          const replacement = parts[2] || ''
          if (pattern) {
            try {
              const regex = new RegExp(pattern, 'g')
              contentStr = contentStr.replace(regex, replacement)
            } catch (regexErr: any) {
              emitLog('warn', 'engine', 'frontend', '[正文] replaceRegex 正则无效: ' + (regexErr?.message || regexErr))
            }
          }
        }
      } catch (e: any) {
        emitLog('warn', 'engine', 'frontend', '[正文] replaceRegex 异常: ' + (e?.message || e))
      }
    }

    if (contentRule.title) {
      try {
        const t = await getString(contentStr, contentRule.title, { source, baseUrl: source.bookSourceUrl || redirectUrl, book, chapter, result: contentStr })
        if (t && t.trim()) emitLog('info', '[正文] 提取标题: ' + t.trim())
      } catch {}
    }

    if (isComic && contentRule.imageStyle) contentStr = injectImageStyle(contentStr, contentRule.imageStyle)

    if (!isComic) {
      contentStr = contentStr.split('\n').map(l => l.trim() ? '\u3000\u3000' + l.trim() : '').join('\n')
      if (!contentStr.startsWith('\u3000\u3000')) contentStr = '\u3000\u3000' + contentStr
    }

    emitLog('debug', '[正文] 获取正文内容,长度=' + contentStr.length)
    if (!chapter.isVolume && !contentStr.trim()) return '正文为空'
    return contentStr
  } catch (err: any) { console.warn('[Content] 请求失败:', err?.message || err); return '正文获取失败' }
}
