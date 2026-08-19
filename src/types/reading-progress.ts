// ============================================
// 阅读进度类型
// ============================================

export interface ReadingProgress {
  bookUrl: string
  chapterId: number
  chapterTitle: string
  scrollPercent: number
  updatedAt: string
}
