// ============================================
// 正文解析 — 纯函数（对齐 Legado ContentHelp）
// ============================================

import { getString, getElements, resolveUrl } from '../../index.js'
import { getDomProvider } from '../../parser/dom/provider.js'

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

export function injectImageStyle(html: string, imageStyle: string | null | undefined): string {
  if (!imageStyle) return html
  let style = ''
  if (imageStyle === 'FULL' || imageStyle === 'full') style = 'width:100%;height:auto;'
  else if (imageStyle === 'TEXT' || imageStyle === 'text') style = 'display:none;'
  else if (imageStyle === 'SINGLE' || imageStyle === 'single') style = 'display:block;max-width:100%;height:auto;margin:0 auto;'
  else if (imageStyle === 'center' || imageStyle === 'CENTER') style = 'display:block;margin:0 auto;max-width:100%;height:auto;'
  else if (imageStyle.startsWith('{')) {
    try { const p = JSON.parse(imageStyle.replace(/'/g, '"')); style = p.style || p.css || '' } catch { style = imageStyle }
  } else style = imageStyle
  if (!style) return html
  return html.replace(/<img\s/g, '<img style="' + style + '" ')
}

export function formatKeepImg(html: string, redirectUrl: string, imageStyle: string | null | undefined): string {
  let result = html
    .replace(NBSP_REGEX, ' ').replace(ESP_REGEX, ' ').replace(NO_PRINT_REGEX, '')
    .replace(WRAP_HTML_REGEX, '\n').replace(COMMENT_REGEX, '').replace(NOT_IMG_HTML_REGEX, '')
    .replace(INDENT1_REGEX, '\n\u3000\u3000').replace(INDENT2_REGEX, '\u3000\u3000').replace(LAST_REGEX, '')

  let appendPos = 0
  const sb: string[] = []
  const regex = new RegExp(FORMAT_IMAGE_PATTERN.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = regex.exec(result)) !== null) {
    if (regex.lastIndex === 0) break
    let param = ''
    const group1 = match[1]
    const rawSrc = group1 || match[2] || match[3] || match[4] || ''
    let src = rawSrc
    if (group1) {
      const m = /,\s*(\{.*\})/.exec(rawSrc)
      if (m) { param = ',' + rawSrc.substring(m.index); src = rawSrc.substring(0, m.index) }
    }
    const styleAttr = imageStyle ? ' style="' + imageStyle + '"' : ''
    sb.push(result.substring(appendPos, match.index), '<img src="' + resolveUrl(src, redirectUrl) + param + '"' + styleAttr + '>')
    appendPos = regex.lastIndex
  }
  if (appendPos < result.length) sb.push(result.substring(appendPos))
  return sb.join('')
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n').trim()
}

const CONTENT_MIN_LENGTH = 50

export async function parseContentPage(
  book: any, baseUrl: string, redirectUrl: string, body: string,
  contentRule: any, chapter: any,
  bookSource: any, nextChapterUrl: string | null | undefined, getNextPageUrl: boolean
): Promise<{ content: string; nextUrls: string[] }> {
  const ctx = { source: bookSource, baseUrl: bookSource.bookSourceUrl || baseUrl, book: book || {}, chapter: chapter || {}, nextChapterUrl: nextChapterUrl || '', result: body }
  const nextUrls: string[] = []
  let workingBody = body

  if (contentRule.sourceRegex) {
    try {
      const e = await getString(body, contentRule.sourceRegex, ctx)
      if (e && e.trim()) { workingBody = e; ctx.result = workingBody }
    } catch {}
  }

  let content = ''

  const selector = contentRule.content || ''
  if (selector) {
    try {
      // 修复：使用引擎 getString 处理 Legado 规则语法（id.content@html 等）
      // 而不是直接 querySelectorAll
      content = await getString(workingBody, selector, ctx) || ''
    } catch {
      content = ''
    }
  }

  if (!content || content.length < CONTENT_MIN_LENGTH) {
    content = stripHtml(workingBody)
  }

  const isComic = bookSource.bookSourceType === 2
  if (!isComic && content) {
    content = formatKeepImg(content, redirectUrl || baseUrl, contentRule.imageStyle || null)
    if (content.indexOf('&') > -1) {
      content = content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
    }
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
