// ============================================
// Chapter 类型
// ============================================

export interface Chapter {
  id: number
  title: string
  url: string
  index: number
  isVip?: boolean
  isPay?: boolean
  content?: string | null
  _deferredJs?: string
  _deferredResult?: any
  updateTime?: string
}
