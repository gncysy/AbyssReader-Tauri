// ============================================
// 目录解析 — 对齐 Legado BookChapterList
// ============================================

import { getString, getElements, resolveUrl } from '../../index.js'
import type { EngineBookSource, EngineChapter } from '../../types.js'

const WORD_COUNT_REGEX = /(?:^|字数[：:、]?|\s+)([0-9万千百\.]{1,6}字)/

function isJsonString(str: string): boolean {
  const t = str.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

function safeParseJson(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function parseJsonChapters(list: any[], baseUrl: string): EngineChapter[] {
  const chapters: EngineChapter[] = []
  for (const item of list) {
    const title = item.chapterName || item.title || item.name || ''
    const hasChapterId = item.chapterId !== undefined && item.chapterId !== null
    const url = hasChapterId
      ? '/chapter/' + String(item.chapterId)
      : (item.url || item.path || '')
    if (title) {
      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), baseUrl),
        index: chapters.length,
        isVip: !!(item.isFree === 0 || item.isVip),
        isPay: !!(item.isChapterBuy || item.isPay),
      })
    }
  }
  chapters.forEach((ch, idx) => {
    ch.index = idx
    ch.id = idx
  })
  return chapters
}

export async function parseTocPage(
  book: any,
  baseUrl: string,
  redirectUrl: string,
  body: string,
  tocRule: NonNullable<EngineBookSource['ruleToc']>,
  listRule: string,
  bookSource: EngineBookSource,
  getNextUrl: boolean,
): Promise<{ chapters: EngineChapter[]; nextUrls: string[] }> {
  const chapters: EngineChapter[] = []
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
          if (item && typeof item === 'string' && item.trim() && item.trim() !== redirectUrl) {
            const abs = resolveUrl(item.trim(), redirectUrl)
            if (abs && !nextUrls.includes(abs) && abs !== redirectUrl) {
              nextUrls.push(abs)
            }
          }
        }
      }
    } catch {
      // ignore
    }
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
      const jsIdx = urlRule.search(/@js:|<js>/)
      firstRule = jsIdx > 0 ? urlRule.substring(0, jsIdx).trim() : ''
    }

    for (const item of elements) {
      if (item === null || item === undefined) continue

      const itemCtx = { ...baseCtx, result: item }

      const title = (await getString(item, nameRule, itemCtx)) || ''
      if (!title) continue

      let url = ''
      let deferredJs: string | undefined
      let deferredResult: any

      if (hasDeferredJs) {
        if (firstRule) {
          url = (await getString(item, firstRule, itemCtx)) || ''
        }
        deferredJs = urlRule
        deferredResult = url
      } else {
        url = (await getString(item, urlRule, itemCtx)) || ''
      }

      const info = upTimeRule ? (await getString(item, upTimeRule, itemCtx)) || '' : ''
      const isVolumeStr = isVolumeRule ? (await getString(item, isVolumeRule, itemCtx)) || '' : ''
      const isVolume = isVolumeStr === 'true'

      let wordCount: string | undefined
      let tag = info
      if (!isVolume) {
        const wcMatch = WORD_COUNT_REGEX.exec(info)
        if (wcMatch) {
          wordCount = wcMatch[1].trim()
          tag = info.replace(wcMatch[0], '')
        }
      }

      if (!url) {
        if (isVolume) {
          url = title + chapters.length
        } else {
          url = baseUrl
        }
      }

      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), redirectUrl),
        index: chapters.length,
        isVip: vipRule ? (await getString(item, vipRule, itemCtx)) === 'true' : false,
        isPay: payRule ? (await getString(item, payRule, itemCtx)) === 'true' : false,
        updateTime: tag || undefined,
        wordCount: wordCount,
        _deferredJs: deferredJs,
        _deferredResult: deferredResult,
      } as any as EngineChapter)
    }
  }
  return { chapters, nextUrls }
}

export function parseTocJson(body: string, redirectUrl: string): EngineChapter[] {
  const isJson = isJsonString(body)
  if (!isJson) return []
  const parsed = safeParseJson(body)
  if (parsed?.data?.list && Array.isArray(parsed.data.list)) {
    return parseJsonChapters(parsed.data.list, redirectUrl)
  }
  return []
}

export function dedupChapters(chapters: EngineChapter[]): EngineChapter[] {
  const seen = new Map<string, EngineChapter>()
  for (const ch of chapters) {
    const key = ch.url || ch.title
    if (!seen.has(key)) seen.set(key, ch)
  }
  return Array.from(seen.values())
}
