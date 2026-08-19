// ============================================
// ReplaceRule 类型
// ============================================

export interface ReplaceRule {
  id: number
  name: string
  group?: string | null
  pattern: string
  replacement: string
  scope?: string | null
  scopeTitle: boolean
  scopeContent: boolean
  excludeScope?: string | null
  isEnabled: boolean
  isRegex: boolean
  timeoutMillisecond: number
  order: number
}
