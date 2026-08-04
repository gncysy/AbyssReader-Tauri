import { emitLog } from '../event/index.js'
import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements } from '../core/rule-parser/index.js'
import { analyzeUrl, resolveUrl } from '../core/url/index.js'
import { parseSourceHeader } from './source-helper.js'
import type { BookSource, Chapter } from '../../src/shared/types.js'
import type { TocOptions } from '../types.js'

const MAX_TOC_PAGES = 20

function isJsonString(str: string): boolean {
  const t = str.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

function safeParseJson(str: string): any {
  try { return JSON.parse(str) } catch { return null }
}

function needsAnalyzeUrl(url: string): boolean {
  return url.includes('@js:') || url.includes('<js>') || url.includes('{{')
}

async function fetchPage(
  httpClient: ReturnType<typeof getGlobalHttpClient>,
  url: string, headers: Record<string, string>,
  source: BookSource, book: any
): Promise<{ html: string; redirectUrl: string } | null> {
  try {
    if (needsAnalyzeUrl(url)) {
      const analysis = await analyzeUrl(url, { source, book: book || {}, baseUrl: source.bookSourceUrl || '', headerMap: headers })
      let body: string | null = null
      if (analysis.method === 'POST' && analysis.body) body = typeof analysis.body === 'string' ? analysis.body : JSON.stringify(analysis.body)
      const resp = await httpClient.request({ url: analysis.url, method: analysis.method, headers: analysis.headers, body, timeout: 30000, useWebView: analysis.useWebView, webJs: analysis.webJs, sourceType: source.bookSourceType ?? 0 })
      if (resp.status < 200 || resp.status >= 300) return null
      const html = resp.data as string
      if (!html || typeof html !== 'string') return null
      return { html, redirectUrl: resp.url && resp.url !== url ? resp.url : url }
    }
    const resp = await httpClient.request({ url, method: 'GET', headers, timeout: 30000, sourceType: source.bookSourceType ?? 0 })
    if (resp.status < 200 || resp.status >= 300) return null
    const html = resp.data as string
    if (!html || typeof html !== 'string') return null
    return { html, redirectUrl: resp.url && resp.url !== url ? resp.url : url }
  } catch { return null }
}

async function analyzeTocPage(
  book: any, baseUrl: string, redirectUrl: string, body: string,
  tocRule: NonNullable<BookSource['ruleToc']>, listRule: string,
  bookSource: BookSource, getNextUrl: boolean
): Promise<{ chapters: Chapter[]; nextUrls: string[] }> {
  const chapters: Chapter[] = []
  const nextUrls: string[] = []

  const baseCtx = {
    source: bookSource,
    baseUrl: bookSource.bookSourceUrl || baseUrl,
    book: book || {},
    result: body,
  }

  const isJson = isJsonString(body)
  const parsedData = isJson ? safeParseJson(body) : body
  const elements = await getElements(parsedData, listRule, baseCtx)

  if (getNextUrl && tocRule.nextTocUrl) {
    try {
      const results = await getElements(parsedData, tocRule.nextTocUrl, { ...baseCtx, isUrl: true })
      if (Array.isArray(results)) {
        for (const item of results) {
          if (item && typeof item === 'string' && item.trim() && item.trim() !== redirectUrl) nextUrls.push(item.trim())
        }
      } else if (results && typeof results === 'string' && results.trim() && results.trim() !== redirectUrl) {
        nextUrls.push(results.trim())
      }
    } catch {}
  }

  if (Array.isArray(elements) && elements.length > 0) {
    const nameRule = tocRule.chapterName || ''
    const urlRule = tocRule.chapterUrl || ''
    const vipRule = tocRule.isVip || ''
    const payRule = tocRule.isPay || ''
    const isVolumeRule = tocRule.isVolume || ''
    const upTimeRule = tocRule.updateTime || ''

    const hasDeferredJs = urlRule.includes('@js:') || urlRule.includes('<js>')
    let firstRule = ''
    if (hasDeferredJs) {
      const ruleParts = urlRule.split(/@js:|<js>/)
      firstRule = (ruleParts[0] || '').trim()
      console.log('[toc] deferredJs enabled, firstRule=' + firstRule + ' urlRule前50=' + urlRule.substring(0, 50))
    }

    for (let index = 0; index < elements.length; index++) {
      const item = elements[index]
      if (item === null || item === undefined) continue

      const itemCtx = { ...baseCtx, result: item }

      const title = await getString(item, nameRule, itemCtx) || ''
      if (!title) continue

      let url = ''
      let deferredJs: string | undefined
      let deferredResult: any

      if (hasDeferredJs) {
        if (firstRule) {
          url = await getString(item, firstRule, itemCtx) || ''
        }
        deferredJs = urlRule
        deferredResult = url
      } else {
        url = await getString(item, urlRule, itemCtx) || ''
      }

      const info = upTimeRule ? await getString(item, upTimeRule, itemCtx) || '' : ''
      const isVolumeStr = isVolumeRule ? await getString(item, isVolumeRule, itemCtx) || '' : ''
      let isVolume = false; let tag = ''
      if (isVolumeStr === 'true') { isVolume = true; tag = info } else { tag = info }
      if (!url) url = isVolume ? title + index : redirectUrl

      chapters.push({
        id: chapters.length, title: String(title),
        url: resolveUrl(String(url), redirectUrl), index: chapters.length,
        isVip: vipRule ? await getString(item, vipRule, itemCtx) === 'true' : false,
        isPay: payRule ? await getString(item, payRule, itemCtx) === 'true' : false,
        _deferredJs: deferredJs,
        _deferredResult: deferredResult,
      } as any as Chapter)
    }
  }
  return { chapters, nextUrls }
}

function parseJsonChapters(list: any[], baseUrl: string): Chapter[] {
  const chapters: Chapter[] = []
  for (const item of list) {
    const title = item.chapterName || item.title || item.name || ''
    const url = item.chapterId ? '/chapter/' + item.chapterId : item.url || item.path || ''
    if (title) chapters.push({ id: chapters.length, title: String(title), url: resolveUrl(String(url), baseUrl), index: chapters.length, isVip: !!(item.isFree === 0 || item.isVip), isPay: !!(item.isChapterBuy || item.isPay) } as Chapter)
  }
  chapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })
  return chapters
}

async function applyFormatJs(chapters: Chapter[], formatJs: string, executor: (js: string, context: Record<string, any>) => Promise<string>, source: BookSource): Promise<void> {
  if (!formatJs || chapters.length === 0) return
  const jsCode = formatJs.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
  if (!jsCode) return
  for (let i = 0; i < chapters.length; i++) {
    try {
      const ch = chapters[i]
      const result = await executor(jsCode, { index: i + 1, chapter: ch, title: ch.title, source, baseUrl: source.bookSourceUrl || '' })
      if (result && result.trim()) ch.title = result.trim()
    } catch {}
  }
}

async function applyPreUpdateJs(preUpdateJs: string, executor: (js: string, context: Record<string, any>) => Promise<string>, source: BookSource, book: any, tocUrl: string): Promise<void> {
  if (!preUpdateJs) return
  const jsCode = preUpdateJs.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
  if (!jsCode) return
  try { await executor(jsCode, { source, book: book || {}, baseUrl: source.bookSourceUrl || tocUrl, result: tocUrl }) } catch {}
}

function dedupChapters(chapters: Chapter[]): Chapter[] {
  const seen = new Map<string, Chapter>()
  for (const ch of chapters) { if (!seen.has(ch.url)) seen.set(ch.url, ch) }
  return Array.from(seen.values())
}

export async function getToc(source: BookSource, tocUrl: string, options: TocOptions = {}): Promise<Chapter[]> {
  if (!tocUrl) return []
  const tocRule = source.ruleToc
  if (!tocRule || !tocRule.chapterList) return []

  emitLog('info', '[目录] 开始 url=' + tocUrl.substring(0, 100))
  const httpClient = getGlobalHttpClient()
  const headers = await parseSourceHeader(source, options.book || {})
  const formatJsExecutor = options.formatJsExecutor

  if (tocRule.preUpdateJs && formatJsExecutor) {
    await applyPreUpdateJs(tocRule.preUpdateJs, formatJsExecutor, source, options.book || {}, tocUrl)
  }

  console.log('[toc] chapterUrl规则=' + JSON.stringify(tocRule.chapterUrl))
  let listRule = tocRule.chapterList || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const chapterList: Chapter[] = []
  const nextUrlList = new Set<string>()

  let html = options.cachedHtml || null
  let redirectUrl = options.redirectUrl || tocUrl

  if (!html) {
    const result = await fetchPage(httpClient, tocUrl, headers, source, options.book || {})
    if (!result) return []
    html = result.html; redirectUrl = result.redirectUrl
  }

  if (!html || typeof html !== 'string') return []

  const { chapters: pageChapters, nextUrls } = await analyzeTocPage(
    options.book || {}, tocUrl, redirectUrl, html, tocRule, listRule, source, true
  )
  chapterList.push(...pageChapters)
  nextUrlList.add(redirectUrl)

  if (nextUrls.length === 1) {
    let nextUrl = nextUrls[0]
    for (let page = 0; page < MAX_TOC_PAGES; page++) {
      if (!nextUrl || nextUrlList.has(nextUrl)) break
      nextUrlList.add(nextUrl)
      const result = await fetchPage(httpClient, nextUrl, headers, source, options.book || {})
      if (!result) break
      const { chapters: np, nextUrls: nu } = await analyzeTocPage(
        options.book || {}, nextUrl, result.redirectUrl, result.html, tocRule, listRule, source, true
      )
      chapterList.push(...np)
      nextUrl = nu.length > 0 ? nu[0] : ''
    }
  } else if (nextUrls.length > 1) {
    const cr = await Promise.all(nextUrls.map(async (u) => {
      if (nextUrlList.has(u)) return []; nextUrlList.add(u)
      const result = await fetchPage(httpClient, u, headers, source, options.book || {})
      if (!result) return []
      const { chapters: pc } = await analyzeTocPage(
        options.book || {}, u, result.redirectUrl, result.html, tocRule, listRule, source, false
      )
      return pc
    }))
    for (const chs of cr) chapterList.push(...chs)
  }

  if (chapterList.length === 0) {
    const isJson = isJsonString(html)
    if (isJson) {
      const parsed = safeParseJson(html)
      if (parsed?.data?.list && Array.isArray(parsed.data.list)) {
        chapterList.push(...parseJsonChapters(parsed.data.list, redirectUrl))
      }
    }
  }

  if (chapterList.length === 0) { emitLog('warn', '[目录] 目录为空'); return [] }

  if (!reverse) chapterList.reverse()
  const deduped = dedupChapters(chapterList)
  deduped.reverse()
  deduped.forEach((ch, idx) => { ch.index = idx; ch.id = idx })

  if (tocRule.formatJs && formatJsExecutor) {
    await applyFormatJs(deduped, tocRule.formatJs, formatJsExecutor, source)
  }

  emitLog('info', '[目录] 目录总数:' + deduped.length)
  return deduped
}

