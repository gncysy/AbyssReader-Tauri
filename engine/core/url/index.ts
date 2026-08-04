// ============================================
// URL 解析（兼容 legado AnalyzeUrl）
// ============================================

import type { UrlAnalysis } from '../../types.js'
import { parseSourceHeader } from '../../business/source-helper.js'
import { logDebug, logInfo, logWarn, logError } from '../../event/index.js'

const PAGE_PATTERN = /<([^>]*)>/g
const PARAM_PATTERN = /\s*,\s*(?=\{)/

let jsExecutor: ((code: string, context: Record<string, any>) => Promise<string>) | null = null

export function setJsExecutor(fn: (code: string, context: Record<string, any>) => Promise<string>) {
  jsExecutor = fn
  logInfo('url', 'frontend', 'URL解析 JS执行器已注入 (deno_core)')
}

async function evalJsExpr(jsStr: string, context: Record<string, any>): Promise<string> {
  if (jsExecutor) {
    try {
      const result = await jsExecutor(jsStr, context)
      return (result === null || result === undefined) ? '' : String(result)
    } catch (e: any) {
      logError('url', 'frontend', 'deno_core 执行失败: ' + (e?.message || e))
      return ''
    }
  }
  logWarn('url', 'frontend', 'deno_core 不可用')
  return ''
}

// 对齐 NetworkUtils.getAbsoluteURL：
// javascript: 返回空，data: 直接返回，已是绝对 URL 直接返回
export function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return ''
  // 对齐阅读：javascript: 伪协议返回空
  if (url.startsWith('javascript')) return ''
  // 对齐阅读：data: URL 直接返回
  if (url.startsWith('data:')) return url
  // 对齐阅读：已是绝对 URL 直接返回
  if (url.match(/^https?:\/\//)) return url
  const paramMatch = PARAM_PATTERN.exec(baseUrl)
  if (paramMatch) baseUrl = baseUrl.substring(0, paramMatch.index)
  const hashIdx = baseUrl.indexOf('#')
  if (hashIdx !== -1) baseUrl = baseUrl.substring(0, hashIdx)
  try { const base = new URL(baseUrl); return url.startsWith('/') ? base.origin + url : base.origin + '/' + url.replace(/^\/+/, '') }
  catch { const cleanBase = baseUrl.replace(/\/+$/, ''); return cleanBase + '/' + url.replace(/^\/+/, '') }
}

export function buildUrl(url: string, baseUrl: string, variables: Record<string, any> = {}): string {
  if (!url) return ''
  let result = url
  for (const [key, val] of Object.entries(variables)) {
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), encodeURIComponent(String(val)))
  }
  return resolveUrl(result, baseUrl)
}

function parseUrlWithOption(combined: string): { url: string; option: any } | null {
  const trimmed = combined.trim()
  const match = trimmed.match(/^(.*?),\s*(\{.*\})$/s)
  if (!match) return null
  const url = match[1].trim(); let optionStr = match[2].trim()
  try { const option = JSON.parse(optionStr); return { url, option } }
  catch { try { const fixed = optionStr.replace(/'/g, '"'); const option = JSON.parse(fixed); return { url, option } } catch { return null } }
}

function isValidUrl(str: string): boolean {
  if (!str) return false
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/')
}

function createSourceProxy(sourceObj: any): any {
  if (!sourceObj || typeof sourceObj !== 'object') return sourceObj
  return new Proxy(sourceObj, {
    get(target, prop) {
      if (prop === 'key') {
        return target.bookSourceUrl || ''
      }
      if (prop in target) {
        const val = target[prop]
        return typeof val === 'function' ? val.bind(target) : val
      }
      return undefined
    }
  })
}

function analyzeJs(ruleUrl: string, ctx: Record<string, any>): Promise<string> {
  const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([^\n]*)/gi
  let start = 0
  let result = ruleUrl
  let jsMatch: RegExpExecArray | null

  return (async () => {
    while ((jsMatch = JS_PATTERN.exec(ruleUrl)) !== null) {
      if (jsMatch.index > start) {
        const text = ruleUrl.substring(start, jsMatch.index).trim()
        if (text) result = text.replace(/@result/g, result)
      }
      const jsCode = (jsMatch[2] || jsMatch[1]).trim()
      if (jsCode) {
        const jsResult = await evalJsExpr(jsCode, { ...ctx, result })
        result = jsResult || result
      }
      start = jsMatch.index + jsMatch[0].length
    }
    if (ruleUrl.length > start) {
      const text = ruleUrl.substring(start).trim()
      if (text) result = text.replace(/@result/g, result)
    }
    return result
  })()
}

export async function analyzeUrl(ruleUrl: string, options: {
  baseUrl?: string; key?: string; page?: number; source?: any; book?: any; chapter?: any; headerMap?: Record<string, string>
} = {}): Promise<UrlAnalysis> {
  logDebug('url', 'frontend', '开始 ruleUrl前100=' + ruleUrl.substring(0, 100) + ' key=' + options.key)
  let baseUrl = options.baseUrl || ''
  const urlMatcher = PARAM_PATTERN.exec(baseUrl)
  if (urlMatcher) baseUrl = baseUrl.substring(0, urlMatcher.start())
  const hashIdx = baseUrl.indexOf('#')
  if (hashIdx !== -1) baseUrl = baseUrl.substring(0, hashIdx)

  const headerMap: Record<string, string> = {}
  if (options.source?.header) {
    const jsHeaders = await parseSourceHeader(options.source, options.book)
    Object.assign(headerMap, jsHeaders)
  }
  if (options.headerMap) Object.assign(headerMap, options.headerMap)

  let processed = ruleUrl
  const sourceObj = options.source || {}
  const proxySource = createSourceProxy(sourceObj)
  const ctx: Record<string, any> = {
    result: ruleUrl,
    baseUrl: baseUrl,
    key: options.key || '',
    page: options.page || 1,
    book: options.book || {},
    source: proxySource,
  }
  for (const [k, v] of Object.entries(sourceObj)) {
    if (!(k in ctx)) { ctx[k] = v }
  }
  if (options.key !== undefined) { ctx.key = options.key }

  if (processed.includes('@js:') || processed.includes('<js>')) {
    logInfo('url', 'frontend', '检测到JS规则')
    try {
      const result = await analyzeJs(processed, ctx)
      if (result && result.trim()) {
        const parsed = parseUrlWithOption(result)
        if (parsed) {
          const { url, option } = parsed
          const method = option?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET'
          let body: any = option?.body || null
          if (typeof body === 'string') {
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(body)) {
              const ctx2 = { data: result, ...ctx }
              try { const fn = new Function(...Object.keys(ctx2), 'return (' + body + ')'); const val = fn(...Object.values(ctx2)); if (val !== undefined && val !== null) body = val } catch {}
            } else if (body.startsWith('{') && body.endsWith('}')) { try { body = JSON.parse(body) } catch {} }
          }
          if (typeof body === 'object' && body !== null) body = JSON.stringify(body)
          const resolvedUrl = resolveUrl(url, baseUrl)
          if (!isValidUrl(resolvedUrl)) {
            logWarn('url', 'frontend', 'JS规则返回无效URL: ' + resolvedUrl + ', 使用原始URL')
            return { url: resolveUrl(ruleUrl, baseUrl), method: 'GET', headers: headerMap, body: null, charset: null, retry: 0, useWebView: false, webJs: null, serverID: null, baseUrl }
          }
          return { url: resolvedUrl, method, headers: { ...headerMap, ...(option?.headers || {}) }, body: typeof body === 'string' ? body : (body ? JSON.stringify(body) : null), charset: option?.charset || null, retry: option?.retry || 0, useWebView: option?.webView === true, webJs: option?.webJs || null, serverID: option?.serverID || null, baseUrl }
        }
        if (isValidUrl(result) && (result.startsWith('http://') || result.startsWith('https://') || result.startsWith('/'))) {
          return { url: resolveUrl(result, baseUrl), method: 'GET', headers: headerMap, body: null, charset: null, retry: 0, useWebView: false, webJs: null, serverID: null, baseUrl }
        }
        processed = result
      }
    } catch (e: any) { logError('url', 'frontend', 'JS异常: ' + (e?.message || e)) }
  }

  processed = processed.replace(/\{\{([^}]+)\}\}/g, (_m, expr: string) => {
    const trimmed = expr.trim()
    const encMatch = trimmed.match(/^encodeURI\((.+)\)$/i)
    if (encMatch) {
      const inner = encMatch[1].trim()
      const val = resolveSimpleVar(inner, options)
      return val ? encodeURIComponent(val) : ''
    }
    const val = resolveSimpleVar(trimmed, options)
    return val ? encodeURIComponent(val) : ''
  })

  if (options.page !== undefined && options.page > 0) {
    processed = processed.replace(PAGE_PATTERN, (_m, pagesStr: string) => {
      const pages = pagesStr.split(',').map((s: string) => s.trim())
      return options.page! <= pages.length ? pages[options.page! - 1] : pages[pages.length - 1]
    })
  }

  let urlNoOption = processed; let option: any = null
  const paramMatch = PARAM_PATTERN.exec(processed)
  if (paramMatch) { urlNoOption = processed.substring(0, paramMatch.index); try { option = JSON.parse(processed.substring(paramMatch.index + 1).replace(/'/g, '"')) } catch {} }

  let url = buildUrl(urlNoOption, baseUrl)
  try { const p = new URL(url); baseUrl = p.origin } catch {}

  const method: 'GET' | 'POST' = option?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET'
  if (option?.headers) Object.assign(headerMap, option.headers)
  let body: string | null = option?.body || null
  if (typeof body === 'object' && body !== null) { try { body = JSON.stringify(body) } catch { body = null } }
  if (option?.js) {
    const val = await evalJsExpr(option.js, { result: url, baseUrl, key: options.key, page: options.page, book: options.book, source: options.source })
    if (val && isValidUrl(val)) url = val
  }

  logInfo('url', 'frontend', '最终URL: ' + url.substring(0, 100))
  return { url, method, headers: headerMap, body, charset: option?.charset || null, retry: option?.retry || 0, useWebView: option?.webView === true, webJs: option?.webJs || null, serverID: option?.serverID || null, baseUrl }
}

function resolveSimpleVar(name: string, options: Record<string, any>): string {
  name = name.trim()
  if (name === 'key' && options.key !== undefined) return String(options.key)
  if (name === 'page' && options.page !== undefined) return String(options.page)
  if (name.startsWith('book.') && options.book) {
    const field = name.substring(5)
    return options.book[field] !== undefined ? String(options.book[field]) : ''
  }
  if (name.startsWith('source.') && options.source) {
    const field = name.substring(7)
    if (field === 'key') return options.source.bookSourceUrl || ''
    return options.source[field] !== undefined ? String(options.source[field]) : ''
  }
  if (options.source && name in options.source) {
    if (name === 'key') return options.source.bookSourceUrl || ''
    return String(options.source[name])
  }
  return ''
}
