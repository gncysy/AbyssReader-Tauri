// ============================================
// HTTP 客户端（Tauri 版：走 Rust 后端）
// ============================================

import type { RequestConfig, ResponseData } from '../types.js'
import { RequestInterceptor } from './interceptor.js'
import { network } from '../../src/api/index.js'

export class HttpClient {
  private defaultHeaders: Record<string, string>
  private defaultTimeout: number
  private interceptor: RequestInterceptor

  constructor(options: {
    defaultHeaders?: Record<string, string>
    defaultTimeout?: number
    interceptor?: RequestInterceptor
  } = {}) {
    this.defaultHeaders = options.defaultHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    this.defaultTimeout = options.defaultTimeout || 30000
    this.interceptor = options.interceptor || new RequestInterceptor()
  }

  async request(config: RequestConfig): Promise<ResponseData> {
    const finalConfig = await this.interceptor.interceptRequest(config)
    const startTime = Date.now()

    const headers = { ...this.defaultHeaders, ...(finalConfig.headers || {}) }

    try {
      const result = await network.fetch(finalConfig.url, {
        method: finalConfig.method || 'GET',
        headers,
        body: finalConfig.body ? (
          typeof finalConfig.body === 'string' ? finalConfig.body : JSON.stringify(finalConfig.body)
        ) : undefined,
        timeout: finalConfig.timeout || this.defaultTimeout,
        responseType: finalConfig.responseType || 'text',
      })

      const data = typeof result === 'string' ? result : JSON.stringify(result)

      const response: ResponseData = {
        status: 200,
        data,
        headers: {},
        url: finalConfig.url,
        duration: Date.now() - startTime,
      }

      return await this.interceptor.interceptResponse(response)
    } catch (error: any) {
      return await this.interceptor.interceptError(error)
    }
  }

  async get(url: string, headers?: Record<string, string>): Promise<ResponseData> {
    return this.request({ url, method: 'GET', headers })
  }

  async post(url: string, body: any, headers?: Record<string, string>): Promise<ResponseData> {
    return this.request({ url, method: 'POST', body, headers })
  }

  clearCookies(): void {}
  setDefaultHeader(_key: string, _value: string): void {}
}

let globalHttpClient: HttpClient | null = null

export function getGlobalHttpClient(): HttpClient {
  if (!globalHttpClient) {
    globalHttpClient = new HttpClient()
  }
  return globalHttpClient
}

export function resetGlobalHttpClient(): void {
  globalHttpClient = null
}
