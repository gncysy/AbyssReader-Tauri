import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/api'
import { READER } from '@shared/constants'

const TODAY_KEY = 'todayReadDate'
const TODAY_COUNT_KEY = 'todayReadCount'

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadTodayCount(): number {
  try {
    const date = localStorage.getItem(TODAY_KEY)
    const today = getTodayStr()
    if (date === today) {
      return parseInt(localStorage.getItem(TODAY_COUNT_KEY) || '0', 10) || 0
    }
    localStorage.setItem(TODAY_KEY, today)
    localStorage.setItem(TODAY_COUNT_KEY, '0')
    return 0
  } catch {
    return 0
  }
}

function saveTodayCount(count: number) {
  try {
    localStorage.setItem(TODAY_KEY, getTodayStr())
    localStorage.setItem(TODAY_COUNT_KEY, String(count))
  } catch {}
}

export const useReadingStore = defineStore('reading', () => {
  const theme = ref('dark')
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  const chineseConverterType = ref(0)
  const reSegment = ref(false)
  const todayReadCount = ref(loadTodayCount())
  const loaded = ref(false)

  async function loadSettings() {
    try {
      const settings = await store.get('settings')
      if (settings) {
        theme.value = settings.theme || 'dark'
        fontSize.value = settings.fontSize || READER.FONT_SIZE_DEFAULT
        lineHeight.value = settings.lineHeight || READER.LINE_HEIGHT_DEFAULT
        chineseConverterType.value = settings.chineseConverterType ?? 0
        reSegment.value = settings.reSegment ?? false
      }
    } catch {}
    todayReadCount.value = loadTodayCount()
    loaded.value = true
  }

  async function saveSettings() {
    await store.set('settings', {
      theme: theme.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      chineseConverterType: chineseConverterType.value,
      reSegment: reSegment.value,
    })
  }

  function incrementTodayReadCount() {
    todayReadCount.value++
    saveTodayCount(todayReadCount.value)
  }

  function setTheme(val: string) { theme.value = val; saveSettings() }
  function setFontSize(val: number) { fontSize.value = Math.max(READER.FONT_SIZE_MIN, Math.min(READER.FONT_SIZE_MAX, val)) as any; saveSettings() }
  function setLineHeight(val: number) { lineHeight.value = Math.max(READER.LINE_HEIGHT_MIN, Math.min(READER.LINE_HEIGHT_MAX, val)) as any; saveSettings() }
  function increaseFontSize() { setFontSize(fontSize.value + 1) }
  function decreaseFontSize() { setFontSize(fontSize.value - 1) }
  function increaseLineHeight() { setLineHeight(lineHeight.value + 0.2) }
  function decreaseLineHeight() { setLineHeight(lineHeight.value - 0.2) }
  function setChineseConverterType(val: number) { chineseConverterType.value = val; saveSettings() }
  function setReSegment(val: boolean) { reSegment.value = val; saveSettings() }

  async function saveProgress(bookUrl: string, _bookName: string, _author: string, chapterId: number, chapterPos: number, chapterTitle: string) {
    if (!bookUrl) return
    try {
      const progress = { bookUrl, chapterId, chapterPos, chapterTitle, updatedAt: new Date().toISOString() }
      const raw = await store.get('readingProgress')
      const all = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
      all[bookUrl] = progress
      await store.set('readingProgress', all)
    } catch (e) {
      console.warn('[reading] saveProgress 失败:', e)
    }
  }

  async function loadProgress(bookUrl: string, _bookName?: string, _author?: string): Promise<any> {
    if (!bookUrl) return null
    try {
      const raw = await store.get('readingProgress')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw[bookUrl] || null
      }
    } catch (e) {
      console.warn('[reading] loadProgress 失败:', e)
    }
    return null
  }

  return {
    theme, fontSize, lineHeight, chineseConverterType, reSegment, todayReadCount, loaded,
    loadSettings, saveSettings,
    setTheme, setFontSize, setLineHeight,
    increaseFontSize, decreaseFontSize,
    increaseLineHeight, decreaseLineHeight,
    setChineseConverterType, setReSegment,
    incrementTodayReadCount,
    saveProgress, loadProgress,
  }
})
