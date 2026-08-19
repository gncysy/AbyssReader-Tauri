// ============================================
// 智能网络获取 — HTTP 失败自动降级 WebView
// ============================================

import { getGlobalHttpClient } from '@engine/network/client.js'
import { logInfo, logError } from '@engine/log/index.js'
import { network } from './network.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { NETWORK } from '@/constants/index.js'
import type { BookSource } from '@/types'

const WEBVIEW_MIN_HTML_LENGTH = 100
const WEBVIEW_DECODE_MAX_ITERATIONS = 5

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err)
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const obj = err as Record<string, any>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.NetworkError === 'string') return obj.NetworkError
    if (typeof obj.error === 'string') return obj.error
    try { return JSON.stringify(err) } catch { return String(err) }
  }
  return String(err)
}

function decodeWebviewHtml(raw: string): string {
  let current = raw.trim()
  let iterations = 0

  while (iterations < WEBVIEW_DECODE_MAX_ITERATIONS) {
    if (current.startsWith('"') && current.endsWith('"') && current.length >= 2) {
      try {
        const inner = JSON.parse(current)
        if (typeof inner === 'string' && inner.length > 0 && inner !== current) {
          current = inner.trim()
          iterations++
          continue
        }
      } catch {
        // 不是合法 JSON，停止解码
      }
    }
    break
  }

  return current
}

function resolveAbsoluteUrl(url: string, baseUrl?: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (!baseUrl) return url
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

export async function fetchWithWebviewFallback(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string | null
    source?: BookSource | null
    timeout?: number
    preserveStyle?: boolean
    baseUrl?: string
  } = {},
): Promise<string | null> {
  const httpClient = getGlobalHttpClient()
  const source = options.source || null
  const timeout = options.timeout || NETWORK.DEFAULT_TIMEOUT
  const absoluteUrl = resolveAbsoluteUrl(url, options.baseUrl || source?.bookSourceUrl || '')

  // 修复：始终解析 source.header 并应用
  const sourceHeaders = source?.header
    ? await parseSourceHeader(source)
    : {}
  const mergedHeaders = { ...sourceHeaders, ...(options.headers || {}) }

  try {
    const response = await httpClient.request({
      url: absoluteUrl,
      method: options.method || 'GET',
      headers: mergedHeaders,
      body: options.body || null,
      timeout,
      sourceType: source?.bookSourceType ?? 0,
    })
    if (response.status >= 200 && response.status < 300) {
      return response.data as string
    }
    logInfo('network', 'frontend', `[fetch] HTTP ${response.status}，降级为 WebView`)
  } catch (err: any) {
    const errorMsg = formatErrorMessage(err)
    logInfo('network', 'frontend', `[fetch] HTTP 请求失败: ${errorMsg}，降级为 WebView`)
  }

  try {
    const webviewHtml = await network.fetchWebView(absoluteUrl, {
      headers: mergedHeaders,
      timeout,
      sourceType: source?.bookSourceType ?? 0,
      preserveStyle: options.preserveStyle ?? true,
    })
    if (webviewHtml && webviewHtml.length > WEBVIEW_MIN_HTML_LENGTH) {
      const decoded = decodeWebviewHtml(webviewHtml)
      if (decoded !== webviewHtml) {
        logInfo('network', 'frontend', `[fetch] WebView HTML 已解码: ${decoded.length} 字符`)
      }
      return decoded
    }
    logInfo('network', 'frontend', `[fetch] WebView 返回内容过短: ${webviewHtml?.length || 0} 字符`)
    return null
  } catch (err: any) {
    const errorMsg = formatErrorMessage(err)
    logError('network', 'frontend', `[fetch] WebView 降级失败: ${errorMsg}`)
    return null
  }
}
