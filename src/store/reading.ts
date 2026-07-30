import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/api'
import { READER } from '@shared/constants'

export const useReadingStore = defineStore('reading', () => {
  const theme = ref('dark')
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  const chineseConverterType = ref(0) // 0=不转换, 1=繁转简, 2=简转繁
  const reSegment = ref(false)        // 段落重排

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

  function setTheme(val: string) { theme.value = val; saveSettings() }
  function setFontSize(val: number) { fontSize.value = Math.max(READER.FONT_SIZE_MIN, Math.min(READER.FONT_SIZE_MAX, val)) as any; saveSettings() }
  function setLineHeight(val: number) { lineHeight.value = Math.max(READER.LINE_HEIGHT_MIN, Math.min(READER.LINE_HEIGHT_MAX, val)) as any; saveSettings() }
  function increaseFontSize() { setFontSize(fontSize.value + 1) }
  function decreaseFontSize() { setFontSize(fontSize.value - 1) }
  function increaseLineHeight() { setLineHeight(lineHeight.value + 0.2) }
  function decreaseLineHeight() { setLineHeight(lineHeight.value - 0.2) }
  function setChineseConverterType(val: number) { chineseConverterType.value = val; saveSettings() }
  function setReSegment(val: boolean) { reSegment.value = val; saveSettings() }

  async function saveProgress(bookUrl: string, bookName: string, author: string, chapterId: number, chapterPos: number, chapterTitle: string) {
    const progress = { bookUrl, bookName, author, chapterId, chapterPos, chapterTitle, updatedAt: new Date().toISOString() }
    const all = (await store.get('readingProgress')) || {}
    all[bookUrl] = progress
    await store.set('readingProgress', all)
  }

  async function loadProgress(bookUrl: string, _bookName: string, _author: string): Promise<any> {
    const all = (await store.get('readingProgress')) || {}
    return all[bookUrl] || null
  }

  return {
    theme, fontSize, lineHeight, chineseConverterType, reSegment,
    loadSettings, saveSettings,
    setTheme, setFontSize, setLineHeight,
    increaseFontSize, decreaseFontSize,
    increaseLineHeight, decreaseLineHeight,
    setChineseConverterType, setReSegment,
    saveProgress, loadProgress,
  }
})
