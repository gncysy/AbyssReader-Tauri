// ============================================
// 发现页
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, getStringList } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import { parseSourceHeader } from './source-helper.js'
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

const NAME_MAX_LENGTH = 100

const NAME_REGEX = /\s+作\s*者.*|\s+\S+\s+著/
const AUTHOR_REGEX = /^\s*作\s*者[:：\s]+|\s+著/

function formatBookName(name: string): string {
  return name.replace(NAME_REGEX, '').trim()
}

function formatBookAuthor(author: string): string {
  return author.replace(AUTHOR_REGEX, '').trim()
}

function isValidBookName(name: string): boolean {
  if (!name || name.length > NAME_MAX_LENGTH) return false
  const tagCount = (name.match(/<\/?[a-zA-Z][^>]*>/g) || []).length
  if (tagCount > 3) return false
  return true
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

async function getSearchItem(
  item: any,
  source: BookSource,
  baseUrl: string,
  ruleName: string,
  ruleAuthor: string,
  ruleKind: string,
  ruleCoverUrl: string,
  ruleWordCount: string,
  ruleIntro: string,
  ruleLastChapter: string,
  ruleBookUrl: string,
  key: string,
  page: number
): Promise<Book | null> {
  const bookPlaceholder: Partial<Book> = {}
  const itemCtx = { source, baseUrl, result: item, book: bookPlaceholder, key, page }

  const rawName = await getString(item, ruleName, itemCtx) || ''
  const name = formatBookName(rawName)
  if (!name || !isValidBookName(name)) return null

  const rawAuthor = await getString(item, ruleAuthor, itemCtx) || ''
  const author = formatBookAuthor(rawAuthor) || '未知作者'

  let kind: string | null = null
  try {
    const kindList = await getStringList(item, ruleKind, itemCtx)
    if (kindList && kindList.length > 0) {
      kind = kindList.join(',')
      bookPlaceholder.kind = kind
    }
  } catch {}

  let wordCount: string | null = null
  try {
    const wc = await getString(item, ruleWordCount, itemCtx)
    if (wc) wordCount = formatWordCount(wc)
  } catch {}

  let lastChapter: string | null = null
  try {
    lastChapter = await getString(item, ruleLastChapter, itemCtx) || null
  } catch {}

  let intro: string | null = null
  try {
    if (ruleIntro) {
      const rawIntro = await getString(item, ruleIntro, itemCtx)
      if (rawIntro) intro = cleanIntro(rawIntro)
    }
  } catch {}

  let coverUrl: string | null = null
  try {
    const rawCover = await getString(item, ruleCoverUrl, itemCtx)
    if (rawCover) {
      coverUrl = resolveUrl(rawCover, baseUrl)
    }
  } catch {}

  const bookUrlStr = await getString(item, ruleBookUrl, { ...itemCtx, isUrl: true })
  const resolvedBookUrl = bookUrlStr ? resolveUrl(bookUrlStr, baseUrl) : baseUrl

  return {
    name,
    author,
    bookUrl: resolvedBookUrl,
    coverUrl,
    intro,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount,
  }
}

async function getInfoItem(
  source: BookSource,
  baseUrl: string,
  body: string,
  key: string,
  page: number
): Promise<Book | null> {
  const rule = source.ruleBookInfo
  if (!rule) return null

  const ctx = { source, baseUrl, result: body, book: {}, key, page }

  const rawName = await getString(body, rule.name || '', ctx) || ''
  const name = formatBookName(rawName)
  if (!name || !isValidBookName(name)) return null

  const rawAuthor = await getString(body, rule.author || '', ctx) || '未知作者'
  const author = formatBookAuthor(rawAuthor) || '未知作者'
  const coverUrl = await getString(body, rule.coverUrl || '', ctx) || ''
  const intro = await getString(body, rule.intro || '', ctx) || ''
  const kind = await getString(body, rule.kind || '', ctx) || ''
  const lastChapter = await getString(body, rule.lastChapter || '', ctx) || ''

  return {
    name,
    author,
    bookUrl: baseUrl,
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), baseUrl) : null,
    intro: intro ? cleanIntro(String(intro)) : null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: null,
  }
}

export async function executeExploreJs(source: BookSource, jsCode: string): Promise<ExploreKind[]> {
  logDebug('explore', 'frontend', '开始执行JS分类规则, code长度=' + jsCode.length)
  try {
    const { executeJs } = await import('../core/rule-parser/js.js')
    const ctx = {
      source,
      baseUrl: source.bookSourceUrl || '',
      result: '',
      book: {},
      key: '',
      page: 1,
    }
    const result = await executeJs(jsCode, ctx)
    logDebug('explore', 'frontend', 'JS执行完成, result类型=' + typeof result)

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
      if (kind.title) kinds.push(kind)
    }

    logInfo('explore', 'frontend', '解析到 ' + kinds.length + ' 个分类')
    return kinds
  } catch (err) {
    logError('explore', 'frontend', 'JS执行异常: ' + (err as Error).message)
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

  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    let jsCode = trimmed
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
    return executeExploreJs(source, jsCode)
  }

  return getExploreCategories(source)
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
    const headers = await parseSourceHeader(source)

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

    const exploreRule = source.ruleExplore
    const searchRule = source.ruleSearch
    const rule = exploreRule?.bookList ? exploreRule : searchRule

    if (!rule || !rule.bookList) return []

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    const ctx: ParseContext = { source, baseUrl, page, book: {}, key: '' }
    const collections = await getElements(html, listRule, ctx)

    if ((!collections || !Array.isArray(collections) || collections.length === 0) && !source.bookUrlPattern) {
      logDebug('explore', 'frontend', '列表为空,按详情页解析')
      const book = await getInfoItem(source, baseUrl, html, '', page)
      if (book) return [book]
      return []
    }

    if (!collections || !Array.isArray(collections) || collections.length === 0) return []

    const ruleName = rule.name || ''
    const ruleAuthor = rule.author || ''
    const ruleKind = rule.kind || ''
    const ruleCoverUrl = rule.coverUrl || ''
    const ruleWordCount = rule.wordCount || ''
    const ruleIntro = rule.intro || ''
    const ruleLastChapter = rule.lastChapter || ''
    const ruleBookUrl = rule.bookUrl || ''

    logDebug('explore', 'frontend', '列表大小:' + collections.length)
    const books: Book[] = []
    for (const item of collections) {
      const book = await getSearchItem(
        item, source, baseUrl,
        ruleName, ruleAuthor, ruleKind, ruleCoverUrl,
        ruleWordCount, ruleIntro, ruleLastChapter, ruleBookUrl,
        '', page
      )
      if (book) books.push(book)
    }

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      const key = `${book.name}|${book.author}`
      if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
    }

    if (reverse) uniqueBooks.reverse()

    return uniqueBooks
  } catch (err) {
    logError('explore', 'frontend', 'getExploreBooks 失败: ' + (err as Error).message)
    return []
  }
}

