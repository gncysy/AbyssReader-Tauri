// ============================================
// 目录解析（对齐 Legado BookChapterList）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, parseRule } from '../core/rule-parser/index.js'
import { executeJsonPath } from '../core/rule-parser/jsonpath.js'
import { resolveUrl } from '../core/url/index.js'
import type { BookSource, Chapter } from '../../src/shared/types.js'
import type { TocOptions } from '../types.js'

const tocCache = new Map<string, { chapters: Chapter[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

function isJsonString(str: string): boolean {
  const t = str.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

function safeParseJson(str: string): any {
  try { return JSON.parse(str) } catch { return null }
}

export async function getToc(
  source: BookSource,
  tocUrl: string,
  options: TocOptions = {}
): Promise<Chapter[]> {
  if (!tocUrl) return []

  const cacheKey = (source.bookSourceUrl || '') + '::' + tocUrl
  const cached = tocCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.chapters

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleToc
  if (!rule || !rule.chapterList) return []

  let html = options.cachedHtml || null
  let finalRedirectUrl = options.redirectUrl || tocUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header.replace(/'/g, '"')) : {}
      const response = await httpClient.request({ url: tocUrl, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return []
      html = response.data as string
      if (response.url && response.url !== tocUrl) finalRedirectUrl = response.url
    } catch { return [] }
  }

  if (!html || typeof html !== 'string') return []

  const contextBook = options.book || {}

  // 处理 listRule
  let listRule = rule.chapterList || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  // 检测数据是 JSON 还是 HTML
  const isJson = isJsonString(html)
  const parsedData = isJson ? safeParseJson(html) : html

  const ctx = { source, baseUrl: source.bookSourceUrl, result: parsedData, book: contextBook }

  // 用引擎获取元素列表
  const elements = getElements(parsedData, listRule, ctx)

  if (!Array.isArray(elements) || elements.length === 0) {
    // 回退：直接从 JSON 里取 data.list
    if (isJson && parsedData?.data?.list) {
      return parseJsonChapters(parsedData.data.list, rule, source, finalRedirectUrl, reverse)
    }
    return []
  }

  // 预解析规则
  const nameRule = parseRule(rule.chapterName || '')
  const urlRule = parseRule(rule.chapterUrl || '')
  const vipRule = rule.isVip ? parseRule(rule.isVip) : []
  const payRule = rule.isPay ? parseRule(rule.isPay) : []

  const chapters: Chapter[] = []

  for (const item of elements) {
    let safeItem: any = item
    if (typeof item !== 'object' || item === null) continue
    try { safeItem = JSON.parse(JSON.stringify(item)) } catch {}

    const itemCtx = { ...ctx, result: safeItem, book: contextBook }

    const title = getString(safeItem, nameRule as any, itemCtx) || ''
    let url = getString(safeItem, urlRule as any, itemCtx) || ''

    if (title) {
      const isVip = vipRule.length > 0 ? getString(safeItem, vipRule as any, itemCtx) === 'true' : false
      const isPay = payRule.length > 0 ? getString(safeItem, payRule as any, itemCtx) === 'true' : false
      if (!url) url = finalRedirectUrl

      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), finalRedirectUrl),
        index: chapters.length,
        isVip,
        isPay,
      } as Chapter)
    }
  }

  if (reverse) chapters.reverse()
  chapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })
  tocCache.set(cacheKey, { chapters, timestamp: Date.now() })
  return chapters
}

function parseJsonChapters(
  list: any[],
  rule: any,
  source: BookSource,
  baseUrl: string,
  reverse: boolean
): Chapter[] {
  const chapters: Chapter[] = []
  for (const item of list) {
    const title = item.chapterName || item.title || item.name || ''
    const url = item.chapterId
      ? `/chapter/${item.chapterId}` // 根据书源构造章节 URL
      : item.url || item.path || ''
    if (title) {
      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), baseUrl),
        index: chapters.length,
        isVip: !!(item.isFree === 0 || item.isVip),
        isPay: !!(item.isChapterBuy || item.isPay),
      } as Chapter)
    }
  }
  if (reverse) chapters.reverse()
  chapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })
  return chapters
}
