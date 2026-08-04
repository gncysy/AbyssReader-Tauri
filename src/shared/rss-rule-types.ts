// ============================================
// RSS 规则类型 — 对齐 Legado SourceRule
// ============================================

export type RuleMode = 'css' | 'xpath' | 'jsonpath' | 'js' | 'regex' | 'webjs' | 'default'

export interface PutMap {
  [key: string]: string
}

export interface RuleContext {
  source?: any
  baseUrl?: string
  book?: any
  result?: any
  isUrl?: boolean
  redirectUrl?: string
}

export interface ParsedRule {
  rule: string
  mode: RuleMode
  replaceRegex: string
  replacement: string
  replaceFirst: boolean
  putMap: PutMap
}

export interface RuleResult {
  value: string | string[] | any[]
  isList: boolean
}
