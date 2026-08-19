// ============================================
// 正文获取编排服务 — 对齐 Legado BookContent
// ============================================

import { getString, getElements } from '@engine/parser/index.js'
import { resolveUrl } from '@engine/url/index.js'
import { getGlobalHttpClient } from '@engine/network/client.js'
import { analyzeUrl } from '@engine/url/index.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { logInfo, logError } from '@engine/log/index.js'
import { parseContentPage, injectImageStyle } from '@engine/business/content/fetcher-parser.js'
import { shouldExecuteInDeno, evaluateRule } from './rule-evaluator.js'
import { fetchWithWebviewFallback } from './fetch.js'
import CryptoJS from 'crypto-js'
import { engine } from './engine.js'
import type { BookSource } from '@/types'
import { NETWORK } from '@/constants/index.js'

const MAX_CONTENT_PAGES = 20
const MAX_CONCURRENT_PAGES = 5
const BASE64_LENGTH_THRESHOLD = 2000
const AES_MIN_LENGTH_RATIO = 0.3
const HEX_MAX_LENGTH = 500
const HEX_MIN_NEWLINE_COUNT = 1
const AES_KEY_LENGTH = 16
const INVALID_RESULT_MIN_LENGTH = 100

// ─── 章节 URL 按需解密 ───

async function resolveChapterUrl(
  url: string,
  deferredJs: string | undefined,
  deferredResult: any,
  source: BookSource,
  book: any,
): Promise<string> {
  if (!deferredJs) return url

  try {
    let jsCode = deferredJs
      .replace(/^[\s\S]*?@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()
    if (!jsCode) return url
    jsCode = jsCode.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (!jsCode) return url
    jsCode = jsCode.replace(/\blet\b/g, 'var').replace(/\bconst\b/g, 'var')
    const result = await engine.executeJs(jsCode, {
      result: deferredResult ?? url,
      src: url,
      baseUrl: source.bookSourceUrl || '',
      book: book || {},
      chapter: { url },
    })
    if (result && typeof result === 'string' && result.trim().length > 0) {
      logInfo('reader', 'frontend', '[正文] 章节 URL 解密成功')
      return result.trim()
    }
  } catch (e: any) {
    logError('reader', 'frontend', '[正文] 章节 URL 解密失败: ' + (e?.message || e))
  }

  return url
}

// ─── 正文解密辅助 ───

function isValidHtmlContent(html: string): boolean {
  return html.trim().length > 0 &&
    (html.includes('<') || html.includes('\n') || html.length > 20)
}

/**
 * 从原始 HTML 中提取 params 并解密 JSON，提取 chapter_images 构造 <img> 标签列表
 * 用于书源 JS 因 V8/Rhino 正则差异产生异常结果时的 fallback
 */
async function decryptJsonFromHtml(
  html: string,
  source: BookSource,
): Promise<string> {
  try {
    const paramsMatch = html.match(/params = '([^']+)'/)
    if (!paramsMatch || !paramsMatch[1]) {
      logError('reader', 'frontend', '[正文] fallback: 未能从 HTML 中提取 params')
      return ''
    }
    const params = paramsMatch[1]

    const encryptedDataWithIV = CryptoJS.enc.Base64.parse(params)
    const iv = CryptoJS.lib.WordArray.create(encryptedDataWithIV.words.slice(0, 16))
    const encryptedBytes = encryptedDataWithIV.words.slice(4)
    const encryptedHex = CryptoJS.enc.Hex.stringify(CryptoJS.lib.WordArray.create(encryptedBytes))
    const keyUtf8 = CryptoJS.enc.Utf8.parse("5V&RoR%Jf@pJPydF")
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(encryptedHex) },
      keyUtf8,
      { iv: iv }
    )
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8)

    if (!decryptedText || decryptedText.length < 10) {
      logError('reader', 'frontend', '[正文] fallback: 解密结果为空')
      return ''
    }

    try {
      const parsed = JSON.parse(decryptedText)
      if (parsed.chapter_images && Array.isArray(parsed.chapter_images) && parsed.chapter_images.length > 0) {
        const imagesHtml = parsed.chapter_images
          .map((imgUrl: string) => `<img src="${imgUrl.replace(/\\/g, '')}">`)
          .join('\n')
        logInfo('reader', 'frontend', `[正文] fallback JSON 解密成功: ${parsed.chapter_images.length} 张图片`)
        return imagesHtml
      }
    } catch {
      // 不是合法 JSON，继续尝试其他方式
    }

    const step2 = decryptedText.replace(/\\|\"/g,'')
    const step3 = step2.replace(/.*?\[(.*?)\].*?/g,'$1')
    if (step3 && step3.length > 10) {
      const step4 = step3.replace(/\,/g,'\n')
      if (step4.split('\n').length > 1) {
        logInfo('reader', 'frontend', `[正文] fallback 非贪婪正则提取成功: ${step4.length} 字符`)
        return step4
      }
    }

    logError('reader', 'frontend', '[正文] fallback: 无法从解密结果中提取图片列表')
    return ''
  } catch (e: any) {
    logError('reader', 'frontend', `[正文] fallback 解密失败: ${e?.message || e}`)
    return ''
  }
}

async function tryDecryptContent(
  html: string,
  source: BookSource,
  contentRule: NonNullable<BookSource['ruleContent']>,
  book: any,
  ctx: any,
): Promise<{ html: string; jsExecuted: boolean }> {
  let decryptedHtml = html
  let jsExecuted = false

  const contentRuleStr = contentRule.content || ''
  if (shouldExecuteInDeno(contentRuleStr)) {
    try {
      const result = await evaluateRule(
        contentRuleStr,
        html,
        { ...ctx, baseUrl: source.bookSourceUrl || '', book, result: html },
        { forceDeno: true }
      )
      if (result && typeof result === 'string') {
        const trimmed = result.trim()

        decryptedHtml = trimmed
        jsExecuted = true

        if (trimmed.startsWith('<img src="') && trimmed.length < INVALID_RESULT_MIN_LENGTH) {
          logError('reader', 'frontend', `[正文] JS 解密结果异常(${trimmed.length}字符)，触发 fallback`)
          const fallbackHtml = await decryptJsonFromHtml(html, source)
          if (fallbackHtml) {
            decryptedHtml = fallbackHtml
          }
        } else if (trimmed.length > 10 && trimmed.includes('<img')) {
          logInfo('reader', 'frontend', `[正文] @js 解密成功: ${decryptedHtml.length} 字符`)
        } else if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed.chapter_images && Array.isArray(parsed.chapter_images) && parsed.chapter_images.length > 0) {
              const imagesHtml = parsed.chapter_images
                .map((imgUrl: string) => `<img src="${imgUrl.replace(/\\/g, '')}">`)
                .join('\n')
              decryptedHtml = imagesHtml
              logInfo('reader', 'frontend', `[正文] JSON 解密成功: ${parsed.chapter_images.length} 张图片`)
            }
          } catch {
            // 不是合法 JSON
          }
        }
      }
    } catch (e: any) {
      logError('reader', 'frontend', '[正文] @js 解密失败: ' + (e?.message || e))
    }
  }

  if (contentRule.sourceRegex) {
    try {
      const regex = new RegExp(contentRule.sourceRegex, 's')
      const match = decryptedHtml.match(regex)
      if (match && match[1]) {
        decryptedHtml = match[1]
        logInfo('reader', 'frontend', '[正文] sourceRegex 提取成功')
      }
    } catch (e: any) {
      logError('reader', 'frontend', '[正文] sourceRegex 失败: ' + (e?.message || e))
    }
  }

  if (contentRule.imageDecode) {
    try {
      const { getJsRuntime } = await import('@engine/parser/js-executor.js')
      const runtime = getJsRuntime()
      if (runtime) {
        const decodeResult = await runtime.execute(contentRule.imageDecode, {
          result: decryptedHtml,
          src: decryptedHtml,
          source,
          baseUrl: source.bookSourceUrl || '',
          book,
        })
        if (decodeResult && decodeResult.length > decryptedHtml.length * 0.5) {
          decryptedHtml = decodeResult
          logInfo('reader', 'frontend', '[正文] imageDecode 解密成功')
        }
      }
    } catch (e: any) {
      logError('reader', 'frontend', '[正文] imageDecode 失败: ' + (e?.message || e))
    }
  }

  // AES/ECB 自动检测
  if (decryptedHtml.length < BASE64_LENGTH_THRESHOLD && /^[A-Za-z0-9+/=\s]+$/.test(decryptedHtml.trim())) {
    try {
      const keyStr = (source.bookSourceUrl || '').padEnd(AES_KEY_LENGTH, '0').substring(0, AES_KEY_LENGTH)
      const key = CryptoJS.enc.Utf8.parse(keyStr)
      const decrypted = CryptoJS.AES.decrypt(decryptedHtml.trim(), key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      })
      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8)
      if (decryptedStr && decryptedStr.length > decryptedHtml.length * AES_MIN_LENGTH_RATIO) {
        decryptedHtml = decryptedStr
        logInfo('reader', 'frontend', '[正文] AES/ECB 解密成功')
      }
    } catch {
      // ignore
    }
  }

  // Hex 自动检测
  if (decryptedHtml.length < HEX_MAX_LENGTH && /^[0-9a-fA-F\s]+$/.test(decryptedHtml.trim())) {
    try {
      const hex = decryptedHtml.replace(/\s/g, '')
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
      const decoded = new TextDecoder().decode(bytes)
      if (decoded.length > 10 && decoded.split('\n').length > HEX_MIN_NEWLINE_COUNT) {
        decryptedHtml = decoded
        logInfo('reader', 'frontend', '[正文] Hex 解密成功')
      }
    } catch {
      // ignore
    }
  }

  if (!isValidHtmlContent(decryptedHtml) && isValidHtmlContent(html)) {
    decryptedHtml = html
  }

  return { html: decryptedHtml, jsExecuted }
}

// ─── 执行 bodyJs ───

async function executeBodyJs(
  bodyJs: string,
  responseBody: string,
  source: BookSource,
  book: any,
  chapter: any,
  nextChapterUrl: string | null | undefined,
): Promise<string> {
  try {
    const { getJsRuntime } = await import('@engine/parser/js-executor.js')
    const runtime = getJsRuntime()
    if (!runtime) return responseBody

    const jsCode = bodyJs
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()

    const result = await runtime.execute(jsCode, {
      result: responseBody,
      src: responseBody,
      baseUrl: source.bookSourceUrl || '',
      book: book || {},
      chapter: chapter || {},
      nextChapterUrl: nextChapterUrl || '',
    })
    if (result && typeof result === 'string' && result.length > 0) {
      logInfo('reader', 'frontend', '[正文] bodyJs 执行成功')
      return result
    }
    return responseBody
  } catch (e: any) {
    logError('reader', 'frontend', '[正文] bodyJs 执行失败: ' + (e?.message || e))
    return responseBody
  }
}

// ─── 执行 header 规则 ───

async function executeHeaderRule(source: BookSource, baseUrl: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (!source.header) return headers

  try {
    const headerStr = source.header
    if (headerStr.startsWith('@js:') || headerStr.startsWith('<js>')) {
      const { getJsRuntime } = await import('@engine/parser/js-executor.js')
      const runtime = getJsRuntime()
      if (runtime) {
        const result = await runtime.execute(headerStr, {
          source,
          baseUrl,
          result: '',
          book: {},
        })
        if (result && typeof result === 'string') {
          let parsed: any = null
          try {
            parsed = JSON.parse(result)
          } catch {
            try {
              parsed = JSON.parse(result.replace(/'/g, '"'))
            } catch {
              // ignore
            }
          }
          if (parsed && typeof parsed === 'object') {
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== null && value !== undefined) {
                headers[key] = String(value)
              }
            }
          }
        }
      }
    } else {
      try {
        const parsed = JSON.parse(headerStr)
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined) {
            headers[key] = String(value)
          }
        }
      } catch {
        try {
          const parsed = JSON.parse(headerStr.replace(/'/g, '"'))
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined) {
              headers[key] = String(value)
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e: any) {
    logError('reader', 'frontend', '[正文] header 规则执行失败: ' + (e?.message || e))
  }

  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 15; V2304A Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36'
  }

  return headers
}

// ─── 单页获取 + 解密 ───

async function fetchAndDecryptPage(
  source: BookSource,
  url: string,
  headers: Record<string, string>,
  book: any,
  contentRule: NonNullable<BookSource['ruleContent']>,
  ctx: any,
  chapter?: any,
  nextChapterUrl?: string | null,
): Promise<{ html: string; redirectUrl: string; jsExecuted: boolean } | null> {
  try {
    const needsAnalyze = url.includes('@js:') || url.includes('<js>') || url.includes('{{') || url.includes(',{')
    let reqUrl = url
    let method: 'GET' | 'POST' = 'GET'
    let reqHeaders = headers
    let body: string | null = null
    let bodyJs: string | null = null

    if (needsAnalyze) {
      const analysis = await analyzeUrl(url, {
        source,
        book: { ...book, kind: book.kind },
        baseUrl: source.bookSourceUrl || '',
        headerMap: headers,
        chapter: chapter || { url },
      })
      reqUrl = analysis.url
      method = analysis.method
      reqHeaders = analysis.headers
      if (analysis.method === 'POST' && analysis.body) {
        body = typeof analysis.body === 'string' ? analysis.body : JSON.stringify(analysis.body)
      }
      bodyJs = analysis.bodyJs
    }

    const rawHtml = await fetchWithWebviewFallback(reqUrl, {
      method,
      headers: reqHeaders,
      body,
      source,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })

    if (!rawHtml) return null

    let processedHtml = rawHtml
    if (bodyJs) {
      processedHtml = await executeBodyJs(bodyJs, processedHtml, source, book, chapter || {}, nextChapterUrl)
    }

    const redirectUrl = reqUrl
    const { html: decrypted, jsExecuted } = await tryDecryptContent(processedHtml, source, contentRule, book, ctx)
    return { html: decrypted, redirectUrl, jsExecuted }
  } catch (e: any) {
    logError('reader', 'frontend', `[正文] 获取失败: ${e?.message || e}`)
    return null
  }
}

// ─── 并发控制 ───

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  limit: number
): Promise<R[]> {
  const results: R[] = []
  const queue = [...items]

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      const result = await fn(item)
      if (result !== null) results.push(result)
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

// ─── 获取副文（subContent） ───

async function fetchSubContent(
  source: BookSource,
  body: string,
  subContentRule: string,
  book: any,
  baseUrl: string,
): Promise<string> {
  try {
    const rawContent = await getString(body, subContentRule, {
      source,
      baseUrl,
      book,
      result: body,
    })

    if (!rawContent || !rawContent.trim()) return ''

    const trimmed = rawContent.trim()

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const subHtml = await fetchWithWebviewFallback(trimmed, {
        source,
        timeout: NETWORK.DEFAULT_TIMEOUT,
      })
      return subHtml || ''
    }

    return trimmed
  } catch (e: any) {
    logError('reader', 'frontend', `[正文] 副文获取失败: ${e?.message || e}`)
    return ''
  }
}

async function parseContentWithFlag(
  book: any,
  resolvedUrl: string,
  redirectUrl: string,
  htmlContent: string,
  contentRule: any,
  chapter: any,
  source: BookSource,
  nextChapterUrl: string | null | undefined,
  getNextPageUrl: boolean,
  jsExecuted: boolean,
): Promise<{ content: string; nextUrls: string[] }> {
  const effectiveRule = jsExecuted
    ? { ...contentRule, content: undefined }
    : contentRule

  return parseContentPage(
    book,
    resolvedUrl,
    redirectUrl,
    htmlContent,
    effectiveRule,
    chapter,
    source,
    nextChapterUrl,
    getNextPageUrl,
  )
}

// ─── getContent ───

export async function getContent(
  source: BookSource, chapterUrl: string,
  options: { bookKind?: string; book?: any; nextChapterUrl?: string; cachedHtml?: string; redirectUrl?: string; chapter?: any; skipCache?: boolean } = {}
): Promise<string> {
  if (!chapterUrl) {
    logError('reader', 'frontend', '[正文] chapterUrl 为空')
    return '章节链接无效'
  }
  const contentRule = source.ruleContent
  if (!contentRule || !contentRule.content) {
    logError('reader', 'frontend', '[正文] 书源缺少正文规则')
    return '书源缺少正文规则'
  }

  logInfo('reader', 'frontend', `[正文] 开始 url=${chapterUrl.substring(0, 100)}`)

  const headers = await executeHeaderRule(source, source.bookSourceUrl || '')
  const book = options.book || {}
  const chapter: any = options.chapter || { url: chapterUrl }
  const nextChapterUrl = options.nextChapterUrl || ''
  const isComic = source.bookSourceType === 2

  let resolvedUrl = chapterUrl
  if (chapter._deferredJs) {
    resolvedUrl = await resolveChapterUrl(chapterUrl, chapter._deferredJs, chapter._deferredResult, source, book)
    chapter.url = resolvedUrl
  }

  const contentList: string[] = []
  const nextUrlSet = new Set<string>()
  const ctx = { source, baseUrl: source.bookSourceUrl || '', book, chapter, nextChapterUrl, result: '' }

  try {
    const firstPage = await fetchAndDecryptPage(source, resolvedUrl, headers, book, contentRule, ctx, chapter, nextChapterUrl)
    if (!firstPage) return '正文获取失败'

    // 修复：漫画模式 + JS 已执行 + 结果是 <img> 标签列表 → 直接返回
    if (isComic && firstPage.jsExecuted && firstPage.html.includes('<img src="')) {
      let contentStr = firstPage.html
      if (contentRule.imageStyle) {
        contentStr = injectImageStyle(contentStr, contentRule.imageStyle)
      }
      logInfo('reader', 'frontend', `[正文] 漫画直接返回 ${contentStr.length} 字符`)
      return contentStr
    }

    const { content: pageContent, nextUrls } = await parseContentWithFlag(
      book, resolvedUrl, firstPage.redirectUrl, firstPage.html,
      contentRule, chapter, source, nextChapterUrl, true, firstPage.jsExecuted
    )
    if (pageContent && pageContent.trim()) contentList.push(pageContent.trim())
    nextUrlSet.add(firstPage.redirectUrl)

    const pageUrls: string[] = []
    for (const u of nextUrls) {
      if (!u || nextUrlSet.has(u)) continue
      if (nextChapterUrl && resolveUrl(u, firstPage.redirectUrl) === resolveUrl(nextChapterUrl, firstPage.redirectUrl)) continue
      pageUrls.push(u)
    }

    if (pageUrls.length > 0) {
      const pageResults = await concurrentMap(
        pageUrls.slice(0, MAX_CONTENT_PAGES),
        async (nextUrl) => {
          if (nextUrlSet.has(nextUrl)) return null
          nextUrlSet.add(nextUrl)
          const nextPage = await fetchAndDecryptPage(source, nextUrl, headers, book, contentRule, ctx, chapter, nextChapterUrl)
          if (!nextPage) return null
          const { content: npc } = await parseContentWithFlag(
            book, nextUrl, nextPage.redirectUrl, nextPage.html,
            contentRule, chapter, source, nextChapterUrl, nextUrls.length > 1, nextPage.jsExecuted
          )
          return npc && npc.trim() ? npc.trim() : null
        },
        MAX_CONCURRENT_PAGES
      )
      for (const r of pageResults) { if (r) contentList.push(r) }
    }

    // 副文规则
    if (contentRule.subContent) {
      const subContent = await fetchSubContent(source, firstPage.html, contentRule.subContent, book, firstPage.redirectUrl)
      if (subContent) {
        contentList.push(subContent)
      }
    }

    let contentStr = contentList.join('\n')

    // replaceRegex 支持三段格式 pattern##replacement##replaceFirst
    if (contentRule.replaceRegex) {
      try {
        const parts = contentRule.replaceRegex.split('##')
        const pattern = parts[1] || ''
        const replacement = parts[2] || ''
        const replaceFirst = parts.length > 3 && parts[3] === 'true'
        if (pattern) {
          try {
            if (replaceFirst) {
              const regex = new RegExp(pattern)
              contentStr = contentStr.replace(regex, replacement)
            } else {
              const regex = new RegExp(pattern, 'g')
              contentStr = contentStr.replace(regex, replacement)
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    // imageStyle 仅在非漫画模式生效
    if (!isComic) {
      contentStr = contentStr.split('\n').map(l => l.trim() ? '\u3000\u3000' + l.trim() : '').join('\n')
      if (!contentStr.startsWith('\u3000\u3000')) contentStr = '\u3000\u3000' + contentStr
    }

    logInfo('reader', 'frontend', `[正文] 完成 ${contentStr.length} 字符`)
    return contentStr
  } catch (e: any) {
    logError('reader', 'frontend', `[正文] 异常: ${e?.message || e}`)
    return '正文获取失败'
  }
}
