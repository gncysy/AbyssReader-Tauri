// ============================================
// 引擎类型 — 单一数据源（零外部依赖）
// ============================================

// ─── 轻量书源类型（引擎层自用，不含 UI 字段） ───
export interface EngineBookSource {
  bookSourceName?: string
  bookSourceUrl?: string
  bookSourceType?: number
  bookSourceGroup?: string | null
  bookUrlPattern?: string | null
  header?: string | null
  searchUrl?: string | null
  exploreUrl?: string | null
  ruleSearch?: Record<string, any> | null
  ruleBookInfo?: Record<string, any> | null
  ruleToc?: Record<string, any> | null
  ruleContent?: Record<string, any> | null
  ruleExplore?: Record<string, any> | null
  enabled?: boolean
  [key: string]: any
}

// ─── 轻量书籍类型（引擎层自用） ───
export interface EngineBook {
  name?: string
  author?: string
  bookUrl?: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  tocUrl?: string | null
  wordCount?: string | null
  [key: string]: any
}

// ─── 轻量章节类型（引擎层自用） ───
export interface EngineChapter {
  id?: number
  title?: string
  url?: string
  index?: number
  isVip?: boolean
  isPay?: boolean
  [key: string]: any
}

// ─── 规则上下文 ───
export interface ParseContext {
  source?: EngineBookSource
  book?: Partial<EngineBook>
  chapter?: Partial<EngineChapter>
  baseUrl?: string
  nextChapterUrl?: string
  page?: number
  key?: string
  isUrl?: boolean
  result?: any
  src?: any
}

// ─── 规则模式 ───
export type RuleMode = 'css' | 'json' | 'xpath' | 'js' | 'regex' | 'webjs'

// ─── 单个规则 ───
export interface SourceRule {
  mode: RuleMode
  rule: string
  replaceRegex?: string
  replacement?: string
  replaceFirst?: boolean
  putMap?: Record<string, string>
  _combineType?: '&&' | '||' | '%%'
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
  bodyJs: string | null
  webViewDelayTime: number
}

// ─── 网络请求 ───
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
  useWebView?: boolean
  webJs?: string | null
  sourceType?: number
  bodyJs?: string | null
}

// ─── 响应数据 ───
export interface ResponseData {
  status: number
  data: string | ArrayBuffer
  headers: Record<string, string>
  url: string
  duration: number
}

// ─── JS 运行时接口 ───
export interface JsRuntime {
  execute(code: string, context: Record<string, any>): Promise<string>
  setCookieJar?(jar: any): void
  clearCache?(): void
}

// ─── 解析器接口 ───
export interface DomParser {
  parse(html: string, baseUrl?: string): DomNode
}

export interface DomNode {
  tag: string
  attrs: Record<string, string>
  children: DomNode[]
  text: string
  html: string
  outerHtml: string
  querySelectorAll(selector: string): DomNode[]
}

export interface JsonPathQuery {
  query(obj: any, path: string): any
}
