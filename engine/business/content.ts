// ============================================
// 正文解析（对齐 Legado BookContent）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, parseRule } from '../core/rule-parser/index.js'
import { analyzeUrl } from '../core/url/index.js'
import type { BookSource } from '../../src/shared/types.js'
import type { ContentOptions } from '../types.js'

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n\n')
    .trim()
}

export async function getContent(
  source: BookSource,
  chapterUrl: string,
  options: ContentOptions = {}
): Promise<string> {
  if (!chapterUrl) return '章节链接无效'

  const rule = source.ruleContent
  if (!rule || !rule.content) return '书源缺少正文规则'

  const httpClient = getGlobalHttpClient()
  const headers = source.header ? JSON.parse(source.header) : {}

  const urlAnalysis = analyzeUrl(chapterUrl, {
    source, book: options.book, baseUrl: source.bookSourceUrl, headerMap: headers
  })

  if (urlAnalysis.method === 'POST' && urlAnalysis.body) {
    let body = urlAnalysis.body
    if (typeof body === 'string') {
      try {
        const bodyObj = JSON.parse(body)
        if (bodyObj.ContentAnchorBatch?.[0] && !bodyObj.ContentAnchorBatch[0].BookID && options.bookKind) {
          bodyObj.ContentAnchorBatch[0].BookID = options.bookKind
        }
        body = bodyObj
      } catch {}
    }
    urlAnalysis.body = body
  }

  try {
    const response = await httpClient.request({
      url: urlAnalysis.url,
      method: urlAnalysis.method,
      headers: urlAnalysis.headers,
      body: urlAnalysis.body,
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error('HTTP ' + response.status)
    }

    const html = response.data as string
    if (!html || typeof html !== 'string') throw new Error('内容为空')

    const ctx = { source, baseUrl: source.bookSourceUrl, book: options.book || {}, result: html }

    // 预解析 contentRule（对齐 Legado：getString(contentRule.content, unescape=false)）
    const contentRule = parseRule(rule.content || '')

    // 用引擎提取正文
    let content = getString(html, contentRule as any, ctx)
    if (!content || !content.trim()) {
      content = stripHtml(html)
    }

    if (content.includes('<') && content.includes('>')) {
      content = stripHtml(content)
    }

    // 全文替换（replaceRegex）
    const replaceRegex = rule.replaceRegex
    if (replaceRegex && content) {
      try {
        const replaceRule = parseRule(replaceRegex)
        content = getString(content, replaceRule as any, ctx) || content
        // 加段落缩进
        content = content.split('\n').map(l => l.trim()).filter(l => l).join('\n')
      } catch {}
    }

    if (!content || !content.trim()) throw new Error('正文为空')
    return content
  } catch (err: any) {
    return '请求失败: ' + (err.message || '未知错误')
  }
}
