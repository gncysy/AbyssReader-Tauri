import { emitLog } from '../event/index.js'
// ============================================
// 搜索
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements, getStringList } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import { parseSourceHeader } from './source-helper.js'
import type { Book, BookSource } from '../../src/shared/types.js'
import type { SearchOptions, ParseContext } from '../types.js'

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

function matchesBookUrlPattern(url: string, pattern: string | null | undefined): boolean {
  if (!pattern) return false
  try {
    const regex = new RegExp(pattern)
    return regex.test(url)
  } catch {
    return false
  }
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
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null
): Promise<Book | null> {
  const bookPlaceholder: Partial<Book> = {}
  const itemCtx = { source, baseUrl, result: item, book: bookPlaceholder, key, page }

  // 调试：打印 item 的类型和前100字符
  const itemType = typeof item
  const itemPreview = itemType === 'string' ? item.substring(0, 100) : (item?.tagName || item?.constructor?.name || itemType)
  emitLog('debug', '[搜索] 解析元素 type=' + itemType + ' preview=' + itemPreview)

  const itemTag = typeof item === 'object' && item !== null ? (item.tagName || item.constructor?.name || 'obj') : typeof item
  const itemOuter = typeof item === 'object' && item !== null && item.outerHTML ? item.outerHTML.substring(0, 200) : String(item).substring(0, 200)
  emitLog('debug', '[搜索-解析] item类型=' + itemTag + ' outer=' + itemOuter + ' ruleName=' + ruleName + ' ruleAuthor=' + ruleAuthor + ' ruleBookUrl=' + ruleBookUrl)
  const rawName = await getString(item, ruleName, itemCtx) || ''
  emitLog('debug', '[搜索-解析] rawName=' + rawName)
  const name = formatBookName(rawName)
  
  emitLog('debug', '[搜索] rawName=' + rawName + ' name=' + name)

  if (!name || !isValidBookName(name)) return null

  const rawAuthor = await getString(item, ruleAuthor, itemCtx) || ''
  const author = formatBookAuthor(rawAuthor) || '未知作者'

  let kind: string | null = null
  try {
    const kindList = await getStringList(item, ruleKind, itemCtx)
    emitLog('debug', '[搜索-解析] kindList=' + JSON.stringify(kindList) + ' ruleKind=' + ruleKind)
    if (kindList && kindList.length > 0) {
      kind = kindList.join(',')
      bookPlaceholder.kind = kind
      emitLog('debug', '[搜索-解析] bookPlaceholder.kind=' + bookPlaceholder.kind)
    }
  } catch {}

  if (filter && filter(name, author, kind) === false) return null

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

  emitLog('debug', '[搜索-解析] bookUrl规则=' + ruleBookUrl + ' bookPlaceholder.kind=' + bookPlaceholder.kind)
  const bookUrlStr = await getString(item, ruleBookUrl, { ...itemCtx, isUrl: true })
  emitLog('debug', '[搜索-解析] bookUrlStr=' + bookUrlStr)
  const resolvedBookUrl = bookUrlStr ? resolveUrl(bookUrlStr, baseUrl) : baseUrl
  emitLog('debug', '[搜索-解析] resolvedBookUrl=' + resolvedBookUrl)

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
  searchUrl: string,
  key: string,
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null
): Promise<Book | null> {
  const rule = source.ruleBookInfo
  if (!rule) return null

  const ctx = { source, baseUrl, result: body, book: {}, key, page }

  const rawName = await getString(body, rule.name || '', ctx) || ''
  const name = formatBookName(rawName)
  if (!name || !isValidBookName(name)) return null

  const suspicious = /^\d{1,4}$/.test(name) || /^[A-Za-z\s]{1,10}$/.test(name)
  if (suspicious && baseUrl === searchUrl) {
    emitLog('debug', '[搜索] 降级结果可疑,跳过: ' + name)
    return null
  }

  if (filter && filter(name, '', null) === false) return null

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

export async function search(
  source: BookSource,
  keyword: string,
  options: SearchOptions & {
    signal?: AbortSignal
    filter?: ((name: string, author: string, kind: string | null) => boolean) | null
    shouldBreak?: ((size: number) => boolean) | null
  } = {}
): Promise<Book[]> {
  emitLog('info', '[搜索] 开始 keyword=' + keyword)
  const page = options.page || 1
  const httpClient = getGlobalHttpClient()

  const searchUrl = source.searchUrl || ''
  emitLog('debug', '[搜索] searchUrl=' + searchUrl)
  if (!searchUrl) { emitLog('warn', '[搜索] searchUrl为空'); return [] }

  const headerMap = await parseSourceHeader(source)
  emitLog('debug', '[搜索] headers=' + JSON.stringify(headerMap))

  emitLog('debug', '[搜索] 开始analyzeUrl, baseUrl=' + source.bookSourceUrl)
  const urlAnalysis = await analyzeUrl(searchUrl, {
    key: keyword,
    page,
    source,
    baseUrl: source.bookSourceUrl || '',
    headerMap,
  })

  emitLog('info', '[搜索] 最终请求URL: ' + urlAnalysis.url)

  try {
    if (options.signal?.aborted) return []

    emitLog('debug', '[搜索] 发起HTTP请求')
    const response = await httpClient.request({
      url: urlAnalysis.url,
      method: urlAnalysis.method,
      headers: urlAnalysis.headers,
      body: urlAnalysis.body,
      timeout: options.timeout || 30000,
      useWebView: urlAnalysis.useWebView,
      webJs: urlAnalysis.webJs,
      sourceType: source.bookSourceType ?? 0,
    })

    emitLog('info', '[搜索] HTTP状态: ' + response.status + ' 数据长度: ' + (response.data ? String(response.data).length : 0))

    if (response.status < 200 || response.status >= 300) { emitLog('warn', '[搜索] HTTP状态异常: ' + response.status); return [] }

    const html = response.data as string
    const baseUrl = response.url || source.bookSourceUrl || ''
    
    emitLog('debug', '[搜索] HTML前500: ' + html.substring(0, 500))

    const rule = source.ruleSearch
    if (!rule || !rule.bookList) {
      emitLog('warn', '[搜索] 搜索规则为空或缺少bookList')
      return []
    }

    if (source.bookUrlPattern && matchesBookUrlPattern(baseUrl, source.bookUrlPattern)) {
      emitLog('debug', '[搜索] 链接为详情页')
      const book = await getInfoItem(source, baseUrl, html, urlAnalysis.url, keyword, page, options.filter || null)
      if (book) return [book]
      return []
    }

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    emitLog('debug', '[搜索] listRule=' + listRule)

    const ctx: ParseContext = { source, baseUrl, key: keyword, page, book: {} }
    const collections = await getElements(html, listRule, ctx)

    emitLog('info', '[搜索] getElements返回: ' + (collections ? collections.length : 'null') + ' 个元素')

    if ((!collections || !Array.isArray(collections) || collections.length === 0) && !source.bookUrlPattern) {
      emitLog('debug', '[搜索] 列表为空,按详情页解析')
      const book = await getInfoItem(source, baseUrl, html, urlAnalysis.url, keyword, page, options.filter || null)
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

    emitLog('debug', '[搜索] 规则: name=' + ruleName + ' author=' + ruleAuthor + ' bookUrl=' + ruleBookUrl)
    emitLog('debug', '[搜索] 列表大小:' + collections.length)

    const books: Book[] = []
    for (let index = 0; index < collections.length; index++) {
      if (options.signal?.aborted) break
      const item = collections[index]
      const book = await getSearchItem(
        item, source, baseUrl,
        ruleName, ruleAuthor, ruleKind, ruleCoverUrl,
        ruleWordCount, ruleIntro, ruleLastChapter, ruleBookUrl,
        keyword, page,
        options.filter || null
      )
      if (book) books.push(book)
      if (options.shouldBreak && options.shouldBreak(books.length)) break
    }

    emitLog('info', '[搜索] 解析到' + books.length + '本书')

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      const key = `${book.name}|${book.author}`
      if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
    }

    if (reverse) uniqueBooks.reverse()
    emitLog('info', '[搜索] 完成 找到' + uniqueBooks.length + '本')
    return uniqueBooks
  } catch (e: any) { console.error("[搜索] 完整错误:", e); emitLog("error", "[搜索] 异常: " + (e?.message || e)); return [] }
}

export async function batchSearch(sources: BookSource[], keyword: string, options: SearchOptions = {}): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = 5; const queue = [...sources]
  const worker = async () => { while (queue.length > 0) { const source = queue.shift(); if (!source) break; const key = source.bookSourceName || 'source'; try { results.set(key, await search(source, keyword, options)) } catch { results.set(key, []) } } }
  const promises: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) promises.push(worker())
  await Promise.all(promises)
  return results
}





