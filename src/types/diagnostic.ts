// ============================================
// 诊断日志条目类型
// ============================================

export interface DiagEntry {
  id: string
  type: string
  timestamp: string
  tag: string
  sourceUrl: string
  hasCrypto: boolean
  resultLen: number
  outputLen: number
  cachedLen: number
  preview: string
  d0?: string
  d1?: string
  errorInfo?: string
}
