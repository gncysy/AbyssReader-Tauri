// ============================================
// T10 - 请求/响应拦截器
// ============================================

import type { RequestConfig, ResponseData } from '../types.js'

export type RequestInterceptorFn = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
export type ResponseInterceptorFn = (response: ResponseData) => ResponseData | Promise<ResponseData>
export type ErrorInterceptorFn = (error: any) => any

export class RequestInterceptor {
  private requestInterceptors: RequestInterceptorFn[] = []
  private responseInterceptors: ResponseInterceptorFn[] = []
  private errorInterceptors: ErrorInterceptorFn[] = []

  useRequest(fn: RequestInterceptorFn): void {
    this.requestInterceptors.push(fn)
  }

  useResponse(fn: ResponseInterceptorFn): void {
    this.responseInterceptors.push(fn)
  }

  useError(fn: ErrorInterceptorFn): void {
    this.errorInterceptors.push(fn)
  }

  async interceptRequest(config: RequestConfig): Promise<RequestConfig> {
    let result = config
    for (const fn of this.requestInterceptors) {
      result = await fn(result)
    }
    return result
  }

  async interceptResponse(response: ResponseData): Promise<ResponseData> {
    let result = response
    for (const fn of this.responseInterceptors) {
      result = await fn(result)
    }
    return result
  }

  async interceptError(error: any): Promise<any> {
    let result = error
    for (const fn of this.errorInterceptors) {
      result = await fn(result)
    }
    return result
  }

  clear(): void {
    this.requestInterceptors = []
    this.responseInterceptors = []
    this.errorInterceptors = []
  }
}
