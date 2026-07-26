// ============================================
// 发现页（对齐 Legado BookList + ExploreKind）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, parseRule } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import { logDebug, logInfo, logWarn, logError } from '../event/index.js'
import type { Book, BookSource } from '../../src/shared/types.js'
import type { ParseContext } from '../types.js'

export interface ExploreKind {
  title: string
  url?: string | null
  type: 'url' | 'text' | 'button' | 'toggle' | 'select'
  action?: string | null
  chars?: string[] | null
  default?: string | null
  viewName?: string | null
  style?: {
    layout_flexGrow?: number
    layout_flexShrink?: number
    layout_alignSelf?: string
    layout_flexBasisPercent?: number
    layout_wrapBefore?: boolean
    layout_justifySelf?: string
  } | null
}

function cleanIntro(intro: string, maxLength: number = 200): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

function formatWordCount(raw: string): string {
  const num = parseInt(String(raw).replace(/[^\d]/g, ''), 10)
  if (isNaN(num) || num < 0) return raw || ''
  if (num < 10000) return String(num)
  return (num / 10000).toFixed(1) + '万'
}

function matchesBookUrlPattern(url: string, pattern: string | null | undefined): boolean {
  if (!pattern) return false
  try {
    const regex = new RegExp(pattern)
    return regex.test(url)
  } catch {
    return false
  }
}

async function parseBookItem(
  item: any,
  source: BookSource,
  ctx: ParseContext,
  rules: {
    name: string
    author: string
    bookUrl: string
    coverUrl: string
    intro: string
    kind: string
    lastChapter: string
    wordCount: string
  },
  baseUrl: string
): Book | null {
  const itemCtx = { ...ctx, result: item }

  const name = await getString(item, rules.name, itemCtx)
  if (!name || !name.trim()) return null

  const author = await getString(item, rules.author, itemCtx) || '未知作者'
  let bookUrl = await getString(item, rules.bookUrl, itemCtx)

  if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
    bookUrl = item.bookUrl || item.id || item.url || item.href || ''
  }

  const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), baseUrl)
  const coverUrl = await getString(item, rules.coverUrl, itemCtx)
  const intro = await getString(item, rules.intro, itemCtx)
  const kind = await getString(item, rules.kind, itemCtx)
  const lastChapter = await getString(item, rules.lastChapter, itemCtx)
  const wordCountRaw = await getString(item, rules.wordCount, itemCtx)

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl: resolvedBookUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), baseUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount: wordCountRaw ? formatWordCount(String(wordCountRaw)) : null,
  }
}

async function parseAsDetailPage(
  source: BookSource,
  html: string,
  baseUrl: string,
  ctx: ParseContext
): Promise<Book | null> {
  const rule = source.ruleBookInfo
  if (!rule) return null

  const bookCtx = { ...ctx, result: html }

  const name = await getString(html, rule.name || '', bookCtx)
  if (!name || !name.trim()) return null

  const author = await getString(html, rule.author || '', bookCtx) || '未知作者'
  const coverUrl = await getString(html, rule.coverUrl || '', bookCtx)
  const intro = await getString(html, rule.intro || '', bookCtx)
  const kind = await getString(html, rule.kind || '', bookCtx)
  const lastChapter = await getString(html, rule.lastChapter || '', bookCtx)
  const tocUrl = await getString(html, rule.tocUrl || '', bookCtx)

  return {
    name: String(name).trim(),
    author: String(author).trim(),
    bookUrl: baseUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), baseUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: tocUrl ? resolveUrl(String(tocUrl), baseUrl) : null,
  }
}

// ─── 执行 JS 规则获取分类 ───
export async function executeExploreJs(source: BookSource, jsCode: string): Promise<ExploreKind[]> {
  logDebug('explore', 'frontend', '开始执行JS分类规则, code长度=' + jsCode.length)
  try {
    const { executeJs } = await import('../core/rule-parser/js.js')
    // 将 source 作为第一个参数传入，让 JS 能访问到 source 对象
    const ctx = {
      source,
      baseUrl: source.bookSourceUrl || '',
      result: '',
      book: {},
      key: '',
      page: 1,
    }
    // 把 source 对象作为 result 传入，这样 JS 中可以通过 result 访问书源
    const result = await executeJs(source, jsCode, ctx)
    logDebug('explore', 'frontend', 'JS执行完成, result类型=' + typeof result + ', 长度=' + (result ? result.length : 0))

    if (!result) {
      logWarn('explore', 'frontend', 'JS执行返回空')
      return []
    }

    let parsed: any
    if (typeof result === 'string') {
      const trimmed = result.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          parsed = JSON.parse(trimmed)
          logDebug('explore', 'frontend', 'JSON解析成功, 类型=' + (Array.isArray(parsed) ? '数组' : '对象') + ', 长度=' + (Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length))
        } catch (e) {
          logError('explore', 'frontend', 'JSON解析失败: ' + (e as Error).message)
          return []
        }
      } else {
        logWarn('explore', 'frontend', '返回字符串不是JSON: ' + trimmed.substring(0, 100))
        return []
      }
    } else {
      parsed = result
    }

    if (!Array.isArray(parsed)) {
      logWarn('explore', 'frontend', '解析结果不是数组')
      return []
    }

    const kinds: ExploreKind[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const kind: ExploreKind = {
        title: String(item.title || ''),
        url: item.url ? String(item.url) : null,
        type: (item.type || 'url') as ExploreKind['type'],
        action: item.action ? String(item.action) : null,
        chars: item.chars ? [...item.chars].map(String) : null,
        default: item.default ? String(item.default) : null,
        viewName: item.viewName ? String(item.viewName) : null,
        style: item.style ? { ...item.style } : null,
      }
      if (kind.title) {
        kinds.push(kind)
      }
    }

    logInfo('explore', 'frontend', '解析到 ' + kinds.length + ' 个分类')
    return kinds
  } catch (err) {
    logError('explore', 'frontend', 'JS执行异常: ' + (err as Error).message)
    console.warn('[Explore] JS执行失败:', err)
    return []
  }
}

export function getExploreCategories(source: BookSource): ExploreKind[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    return []
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          title: item.title || item.name || '未命名',
          url: item.url || item.value || null,
          type: item.type || 'url',
          action: item.action || null,
          chars: item.chars || null,
          default: item.default || null,
          viewName: item.viewName || null,
          style: item.style || null,
        }))
      }
    } catch {}
  }

  if (trimmed.includes('\n') && trimmed.includes('::')) {
    return trimmed
      .split('\n')
      .filter((line: string) => line.includes('::'))
      .map((line: string) => {
        const parts = line.split('::').map((s: string) => s.trim())
        return { title: parts[0] || '未命名', url: parts[1] || '', type: 'url' as const }
      })
  }

  if (trimmed.includes('::')) {
    const parts = trimmed.split('::').map((s: string) => s.trim())
    if (parts.length >= 2) {
      return [{ title: parts[0] || '未命名', url: parts[1] || '', type: 'url' as const }]
    }
  }

  return []
}

export async function getExploreCategoriesAsync(source: BookSource): Promise<ExploreKind[]> {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) {
    logWarn('explore', 'frontend', 'exploreUrl为空')
    return []
  }

  const trimmed = exploreUrl.trim()
  logDebug('explore', 'frontend', 'exploreUrl前100=' + trimmed.substring(0, 100))

  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    let jsCode = trimmed
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
    logInfo('explore', 'frontend', '检测到JS规则, code长度=' + jsCode.length)
    return executeExploreJs(source, jsCode)
  }

  return getExploreCategories(source)
}

async function parseHeader(source: BookSource): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (source.header) {
      if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
        const { executeJs } = await import('../core/rule-parser/js.js')
        const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: {} }
        const headerResult = await executeJs(source, source.header, ctx)
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
    const headers = await parseHeader(source)

    const response = await httpClient.request({
      url,
      method: 'GET',
      headers,
      timeout: 30000,
      sourceType: source.bookSourceType ?? 0,
    })

    if (response.status < 200 || response.status >= 300) return []

    const html = response.data as string
    const baseUrl = response.url || source.bookSourceUrl || ''

    const ctx: ParseContext = {
      source,
      baseUrl,
      page,
      book: {},
    }

    if (source.bookUrlPattern && matchesBookUrlPattern(url, source.bookUrlPattern)) {
      const book = await parseAsDetailPage(source, html, baseUrl, ctx)
      return book ? [book] : []
    }

    const exploreRule = source.ruleExplore
    const searchRule = source.ruleSearch
    const rule = exploreRule?.bookList ? exploreRule : searchRule

    if (!rule || !rule.bookList) return []

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) {
      reverse = true
      listRule = listRule.substring(1)
    }
    if (listRule.startsWith('+')) {
      listRule = listRule.substring(1)
    }

    const collections = await getElements(html, listRule, ctx)

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      const book = await parseAsDetailPage(source, html, baseUrl, ctx)
      return book ? [book] : []
    }

    const rules = {
      name: rule.name || '',
      author: rule.author || '',
      bookUrl: rule.bookUrl || '',
      coverUrl: rule.coverUrl || '',
      intro: rule.intro || '',
      kind: rule.kind || '',
      lastChapter: rule.lastChapter || '',
      wordCount: rule.wordCount || '',
    }

    const books: Book[] = []
    for (const item of collections) {
      const book = await parseBookItem(item, source, ctx, rules, baseUrl)
      if (book) books.push(book)
    }

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      if (!seen.has(book.bookUrl)) {
        seen.add(book.bookUrl)
        uniqueBooks.push(book)
      }
    }

    if (reverse) uniqueBooks.reverse()

    return uniqueBooks
  } catch (err) {
    logError('explore', 'frontend', 'getExploreBooks 失败: ' + (err as Error).message)
    return []
  }
}
