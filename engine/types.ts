// ============================================
// 引擎内部类型
// ============================================

import type { Book, BookSource, Chapter } from '../src/shared/types.js'

// ─── 规则上下文 ───
export interface ParseContext {
  source?: BookSource
  book?: Partial<Book>
  chapter?: Partial<Chapter>
  baseUrl?: string
  nextChapterUrl?: string
  page?: number
  key?: string
  isUrl?: boolean
  result?: any
  src?: any
}

// ─── 规则模式 ───
export type RuleMode = 'css' | 'json' | 'xpath' | 'js' | 'regex'

// ─── 单个规则 ───
export interface SourceRule {
  mode: RuleMode
  rule: string
  replaceRegex?: string
  replacement?: string
  replaceFirst?: boolean
  putMap?: Record<string, string>
}

// ─── URL 解析结果 ───
export interface UrlAnalysis {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: string | null
  charset: string | null
  retry: number
  useWebView: boolean
  webJs: string | null
  serverID: number | null
  baseUrl: string
}

// ─── 网络请求配置 ───
export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  headers?: Record<string, string>
  body?: any
  timeout?: number
  retry?: number
  followRedirect?: boolean
  responseType?: 'text' | 'arraybuffer' | 'json'
  charset?: string
}

// ─── 网络响应 ───
export interface ResponseData {
  status: number
  data: string | ArrayBuffer
  headers: Record<string, string>
  url: string
  duration: number
}

// ─── 引擎配置 ───
export interface EngineConfig {
  cookieJar?: any
}

// ─── 业务选项 ───
export interface SearchOptions {
  page?: number
  timeout?: number
}

export interface TocOptions {
  redirectUrl?: string
  cachedHtml?: string
  book?: Partial<Book>
}

export interface ContentOptions {
  redirectUrl?: string
  cachedHtml?: string
  nextChapterUrl?: string
  bookKind?: string
  book?: Partial<Book>
}

export interface BookInfoOptions {
  redirectUrl?: string
  cachedHtml?: string
}
