// ============================================
// HTTP 客户端 — 纯接口，零环境依赖
// ============================================

import type { RequestConfig, ResponseData } from '../types.js'

export interface HttpClientAdapter {
  request(config: RequestConfig): Promise<ResponseData>
}

export class RequestInterceptor {
  private requestFns: Array<(config: RequestConfig) => RequestConfig | Promise<RequestConfig>> = []
  private responseFns: Array<(response: ResponseData) => ResponseData | Promise<ResponseData>> = []
  private errorFns: Array<(error: any) => any> = []

  useRequest(fn: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>): void { this.requestFns.push(fn) }
  useResponse(fn: (response: ResponseData) => ResponseData | Promise<ResponseData>): void { this.responseFns.push(fn) }
  useError(fn: (error: any) => any): void { this.errorFns.push(fn) }

  async interceptRequest(config: RequestConfig): Promise<RequestConfig> {
    let result = config
    for (const fn of this.requestFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断请求
      }
    }
    return result
  }

  async interceptResponse(response: ResponseData): Promise<ResponseData> {
    let result = response
    for (const fn of this.responseFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断响应
      }
    }
    return result
  }

  async interceptError(error: any): Promise<any> {
    let result = error
    for (const fn of this.errorFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断错误传递
      }
    }
    return result
  }

  clear(): void { this.requestFns = []; this.responseFns = []; this.errorFns = [] }
}

export class HttpClient {
  private defaultHeaders: Record<string, string>
  private defaultTimeout: number
  private interceptor: RequestInterceptor
  private adapter: HttpClientAdapter | null = null
  private cookies: Record<string, string> = {}

  constructor(options: {
    defaultHeaders?: Record<string, string>
    defaultTimeout?: number
    interceptor?: RequestInterceptor
    adapter?: HttpClientAdapter
  } = {}) {
    this.defaultHeaders = options.defaultHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    this.defaultTimeout = options.defaultTimeout || 30000
    this.interceptor = options.interceptor || new RequestInterceptor()
    this.adapter = options.adapter || null
  }

  setAdapter(adapter: HttpClientAdapter): void { this.adapter = adapter }

  async request(config: RequestConfig): Promise<ResponseData> {
    if (!this.adapter) throw new Error('HttpClient: 未设置适配器，请在 services/ 层调用 setAdapter()')
    const finalConfig = await this.interceptor.interceptRequest(config)
    const startTime = Date.now()
    const headers = { ...this.defaultHeaders, ...(finalConfig.headers || {}) }
    const cookieStr = this.getCookieString(finalConfig.url)
    if (cookieStr && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = cookieStr
    }
    try {
      const response = await this.adapter.request({ ...finalConfig, headers })
      const duration = Date.now() - startTime
      const result = { ...response, duration }
      if (response.headers) {
        const setCookie = response.headers['Set-Cookie'] || response.headers['set-cookie']
        if (setCookie) {
          this.setCookieFromString(finalConfig.url, setCookie)
        }
      }
      return await this.interceptor.interceptResponse(result)
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

  setCookie(url: string, cookieStr: string): void {
    try {
      const domain = new URL(url).hostname
      this.cookies[domain] = cookieStr
    } catch {
      // ignore
    }
  }

  setCookieFromString(url: string, cookieStr: string): void {
    this.setCookie(url, cookieStr)
  }

  getCookieString(url: string): string {
    try {
      const domain = new URL(url).hostname
      return this.cookies[domain] || ''
    } catch {
      return ''
    }
  }

  clearCookies(): void {
    this.cookies = {}
  }

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value
  }
}

let globalHttpClient: HttpClient | null = null

export function getGlobalHttpClient(): HttpClient {
  if (!globalHttpClient) globalHttpClient = new HttpClient()
  return globalHttpClient
}

export function resetGlobalHttpClient(): void { globalHttpClient = null }
export function setGlobalHttpClient(client: HttpClient): void { globalHttpClient = client }
