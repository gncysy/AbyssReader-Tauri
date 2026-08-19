// ============================================
// InfoMap 条目类型
// ============================================

export interface InfoMapEntry {
  data: Record<string, string>
  needSave: boolean
  saveTime: number
}
