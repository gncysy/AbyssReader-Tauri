import { emitLog } from '../event/index.js'
// ============================================
// 正文解析（对齐 Legado BookContent）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, parseRule } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import type { BookSource } from '../../src/shared/types.js'
import type { ContentOptions } from '../types.js'

function stripHtml(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n\s*\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n').trim()
}

function fixJsCode(code: string): string {
  const trimmed = code.trim(); if (!trimmed) return trimmed
  let fixed = trimmed
  fixed = fixed.replace(/\.words\.slice\(0,\s*16\)/g, '.words.slice(0, 4)').replace(/\.words\.slice\(16\)/g, '.words.slice(4)').replace(/\/\.\*\\\[\(\.\*\)\\\]\.\*\/g/g, '/.*?\\[(.*)\\].*/g')
  if (!fixed.includes('return ')) { const lines = fixed.split('\n'); let lastIdx = lines.length - 1; while (lastIdx >= 0 && lines[lastIdx].trim() === '') lastIdx--; if (lastIdx >= 0) { const lastLine = lines[lastIdx].trim(); const keywords = ['var ','let ','const ','function ','if ','for ','while ','switch ','try ','throw ','break ','continue ','debugger ','class ','import ','export ','//','/*','}','{','else']; if (!lastLine.startsWith('return') && !keywords.some(k => lastLine.startsWith(k))) { lines[lastIdx] = 'return ' + lastLine.replace(/;$/, '') + ';' } } fixed = lines.join('\n') }
  if (fixed.includes("chapter_images.join") && fixed.includes("split")) { fixed = fixed.replace(/chapter_images\.join\([^)]+\)/, "chapter_images.map(function(u) { return '<img src=\"' + u + '\">'; }).join('')") }
  return fixed
}

async function parseHeader(source: BookSource, options: ContentOptions): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try { if (source.header) { if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) { const { executeJs } = await import('../core/rule-parser/js.js'); const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: options.book || {} }; const headerResult = await executeJs('', source.header, ctx); try { Object.assign(result, JSON.parse(headerResult)) } catch { try { Object.assign(result, JSON.parse(headerResult.replace(/'/g, '"'))) } catch {} } } else { try { Object.assign(result, JSON.parse(source.header)) } catch { try { Object.assign(result, JSON.parse((source.header || '{}').replace(/'/g, '"'))) } catch {} } } } } catch {}
  return result
}

export async function getContent(source: BookSource, chapterUrl: string, options: ContentOptions = {}): Promise<string> {
  emitLog('info', '[正文] 开始 url=' + chapterUrl.substring(0, 100))
  if (!chapterUrl) return '章节链接无效'
  const rule = source.ruleContent; if (!rule || !rule.content) return '书源缺少正文规则'
  const httpClient = getGlobalHttpClient(); const headers = await parseHeader(source, options)
  const isComic = source.bookSourceType === 2
  const contentList: string[] = []; const nextUrlSet = new Set<string>([chapterUrl]); let currentUrl = chapterUrl
  let bookKind = options.bookKind; if (!bookKind && options.book) { bookKind = (options.book as any).kind }
  for (let page = 0; page < 20; page++) {
    const urlAnalysis = await analyzeUrl(currentUrl, { source, book: { ...options.book, kind: bookKind }, baseUrl: source.bookSourceUrl || '', headerMap: headers, chapter: { url: currentUrl } })
    let requestBody: string | undefined = undefined
    if (urlAnalysis.method === 'POST' && urlAnalysis.body) { let bodyObj = urlAnalysis.body; if (typeof bodyObj === 'string') { try { bodyObj = JSON.parse(bodyObj) } catch { requestBody = bodyObj } } if (bodyObj && typeof bodyObj === 'object') { if (bodyObj.ContentAnchorBatch && Array.isArray(bodyObj.ContentAnchorBatch)) { if (bodyObj.ContentAnchorBatch[0] && !bodyObj.ContentAnchorBatch[0].BookID && bookKind) { bodyObj.ContentAnchorBatch[0].BookID = bookKind } } requestBody = JSON.stringify(bodyObj) } else if (typeof bodyObj === 'string') { requestBody = bodyObj } }
    try {
      const response = await httpClient.request({ url: urlAnalysis.url, method: urlAnalysis.method, headers: urlAnalysis.headers, body: requestBody, timeout: 30000, useWebView: urlAnalysis.useWebView, webJs: urlAnalysis.webJs, sourceType: source.bookSourceType ?? 0 })
      if (response.status < 200 || response.status >= 300) break
      const html = response.data as string; if (!html || typeof html !== 'string') break
      const ctx = { source, baseUrl: source.bookSourceUrl, book: options.book || {}, result: html }
      let contentRule = rule.content || ''
      if (isComic && (contentRule.startsWith('<js>') || contentRule.startsWith('@js:'))) { contentRule = fixJsCode(contentRule.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '')); contentRule = '@js:' + contentRule }
      let pageContent = await getString(html, contentRule, ctx)
      if (!pageContent || !pageContent.trim()) { pageContent = isComic ? '' : stripHtml(html) }
      if (!isComic && pageContent.includes('<') && pageContent.includes('>')) { pageContent = stripHtml(pageContent) }
      if (pageContent && pageContent.trim()) contentList.push(pageContent.trim())
      if (!rule.nextContentUrl) break
      const nextUrl = await getString(html, rule.nextContentUrl, { ...ctx, isUrl: true })
      if (!nextUrl || nextUrlSet.has(nextUrl)) break
      nextUrlSet.add(nextUrl); currentUrl = nextUrl
    } catch (err: any) { console.warn('[Content] 请求失败:', err?.message || err); break }
  }
  let content = contentList.join('\n\n'); if (!content) return '正文为空'
  if (isComic) return content
  content = content.split('\n').map(l => l.trim() ? '　　' + l.trim() : '').join('\n')
  if (!content.startsWith('　　')) content = '　　' + content
  return content
}
