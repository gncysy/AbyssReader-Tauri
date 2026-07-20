// ============================================
// URL 解析（兼容 legado AnalyzeUrl）
// ============================================

import type { UrlAnalysis } from '../../types.js'

const PAGE_PATTERN = /<([^>]*)>/g
const PARAM_PATTERN = /\s*,\s*(?=\{)/
const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:\s*([^\s,{]+)/gi

// 外部注入的 JS 执行器（由 api/index.ts 注入）
let jsExecutor: ((code: string, context: Record<string, any>) => Promise<string>) | null = null

export function setJsExecutor(fn: (code: string, context: Record<string, any>) => Promise<string>) {
  jsExecutor = fn
}

async function evalJsExpr(jsStr: string, context: Record<string, any>): Promise<string> {
  // 优先走 Rust deno_core
  if (jsExecutor) {
    try {
      return await jsExecutor(jsStr, context)
    } catch {}
  }
  // 回退：浏览器 new Function
  try {
    const keys = Object.keys(context)
    const values = Object.values(context)
    const fn = new Function(...keys, 'return (' + jsStr + ')')
    const result = fn(...values)
    if (result === null || result === undefined) return ''
    return String(result)
  } catch { return '' }
}

export function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return ''
  if (url.match(/^https?:\/\//)) return url
  try {
    const base = new URL(baseUrl)
    return url.startsWith('/') ? base.origin + url : base.origin + '/' + url.replace(/^\/+/, '')
  } catch { return url }
}

export function buildUrl(url: string, baseUrl: string, variables: Record<string, any> = {}): string {
  if (!url) return ''
  let result = url
  for (const [key, val] of Object.entries(variables)) {
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), encodeURIComponent(String(val)))
  }
  return resolveUrl(result, baseUrl)
}

export async function analyzeUrl(ruleUrl: string, options: {
  baseUrl?: string; key?: string; page?: number; source?: any; book?: any; chapter?: any; headerMap?: Record<string, string>
} = {}): Promise<UrlAnalysis> {
  let baseUrl = options.baseUrl || ''
  const urlMatcher = PARAM_PATTERN.exec(baseUrl)
  if (urlMatcher) baseUrl = baseUrl.substring(0, urlMatcher.index)

  const headerMap: Record<string, string> = {}
  if (options.source?.header) {
    try {
      const h = typeof options.source.header === 'string' ? JSON.parse(options.source.header.replace(/'/g, '"')) : options.source.header
      Object.assign(headerMap, h)
    } catch {}
  }
  if (options.headerMap) Object.assign(headerMap, options.headerMap)

  let processed = ruleUrl
  let jsResult = processed

  // 1. 执行 @js: / <js> 片段（异步，走 deno_core）
  processed = processed.replace(JS_PATTERN, (_m, tagContent?: string, attrContent?: string) => {
    const code = (tagContent || attrContent || '').trim()
    if (!code) return ''
    const ctx = { result: jsResult, baseUrl, key: options.key, page: options.page, book: options.book, source: options.source }
    // 同步转异步：在 replace 回调里用 Promise，但 replace 不支持 async
    // 所以先用占位符替换，再统一处理
    return `__JS_EXPR_${code}__`
  })

  // 2. 执行所有 __JS_EXPR_ 占位符
  const jsExprs = processed.match(/__JS_EXPR_(.+?)__/g)
  if (jsExprs) {
    for (const placeholder of jsExprs) {
      const code = placeholder.replace('__JS_EXPR_', '').replace('__', '')
      const ctx = { result: jsResult, baseUrl, key: options.key, page: options.page, book: options.book, source: options.source }
      const val = await evalJsExpr(code, ctx)
      processed = processed.replace(placeholder, val)
    }
  }

  processed = processed.replace(/@result/g, () => jsResult)

  // 3. 替换 {{ }} 变量
  processed = processed.replace(/\{\{([^}]+)\}\}/g, (_m, expr: string) => {
    const trimmed = expr.trim()
    if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
      if (trimmed === 'key' && options.key !== undefined) return encodeURIComponent(String(options.key))
      if (trimmed === 'page' && options.page !== undefined) return String(options.page)
      if (options.source?.[trimmed] !== undefined) return encodeURIComponent(String(options.source[trimmed]))
      if (options.book?.[trimmed] !== undefined) return encodeURIComponent(String(options.book[trimmed]))
      return ''
    }
    return ''
  })

  // 4. 替换 <page>
  if (options.page !== undefined && options.page > 0) {
    processed = processed.replace(PAGE_PATTERN, (_m, pagesStr: string) => {
      const pages = pagesStr.split(',').map((s: string) => s.trim())
      return options.page! <= pages.length ? pages[options.page! - 1] : pages[pages.length - 1]
    })
  }

  // 5. 解析 URL 选项
  let urlNoOption = processed
  let option: any = null
  const paramMatch = PARAM_PATTERN.exec(processed)
  if (paramMatch) {
    urlNoOption = processed.substring(0, paramMatch.index)
    try { option = JSON.parse(processed.substring(paramMatch.index + 1).replace(/'/g, '"')) } catch {}
  }

  let url = buildUrl(urlNoOption, baseUrl)
  try { const p = new URL(url); baseUrl = p.origin } catch {}

  const method: 'GET' | 'POST' = option?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET'
  if (option?.headers) Object.assign(headerMap, option.headers)

  let body: string | null = option?.body || null
  if (typeof body === 'object' && body !== null) { try { body = JSON.stringify(body) } catch { body = null } }

  if (option?.js) {
    const val = await evalJsExpr(option.js, { result: url, baseUrl, key: options.key, page: options.page, book: options.book, source: options.source })
    if (val) url = val
  }

  return {
    url, method, headers: headerMap, body,
    charset: option?.charset || null,
    retry: option?.retry || 0,
    useWebView: option?.webView === true,
    webJs: option?.webJs || null,
    serverID: option?.serverID || null,
    baseUrl,
  }
}
