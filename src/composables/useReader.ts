// ============================================
// useReader — 阅读器 UI 状态
// ============================================

import { ref, computed } from 'vue'
import { useReaderStore } from '@/stores/reader.js'
import { READER } from '@/constants/reader.js'

const SCROLL_PERCENT_MULTIPLIER = 10000

export function useReader(bookUrl: string, bookName: string, author: string) {
  const readerStore = useReaderStore()
  const showControls = ref(true)
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  const readChapterIds = ref(new Set<number>())

  // 修复：purifyEnabled 从 readConfig 读取，跟随设置变化
  const purifyEnabled = computed(() => {
    const settings = readerStore.getBookSettings(bookUrl)
    if (settings.useReplaceRule !== undefined && settings.useReplaceRule !== null) {
      return settings.useReplaceRule
    }
    return true
  })

  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearHideTimer(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  }

  function resetHideTimer(): void {
    clearHideTimer()
    hideTimer = setTimeout(() => { showControls.value = false }, READER.CONTROLS_HIDE_DELAY)
  }

  function toggleControls(): void {
    showControls.value = !showControls.value
    if (showControls.value) resetHideTimer()
  }

  async function saveProgress(chapterId: number, scrollPercent: number, chapterTitle: string): Promise<void> {
    const chapterPos = Math.round(scrollPercent * SCROLL_PERCENT_MULTIPLIER)
    await readerStore.saveProgress(bookUrl, bookName, author, chapterId, chapterPos, chapterTitle)
  }

  function markChapterRead(chapterId: number): void {
    if (!readChapterIds.value.has(chapterId)) {
      readChapterIds.value.add(chapterId)
      readerStore.incrementTodayReadCount()
    }
  }

  return {
    showControls, fontSize, lineHeight, purifyEnabled, readChapterIds,
    clearHideTimer, resetHideTimer, toggleControls,
    saveProgress, markChapterRead,
  }
}
