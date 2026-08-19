import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/services'
import { READER } from '@/constants/reader.js'

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

function saveTodayCount(count: number): void {
  try {
    localStorage.setItem(TODAY_KEY, getTodayStr())
    localStorage.setItem(TODAY_COUNT_KEY, String(count))
  } catch {
    // ignore
  }
}

export const useReaderStore = defineStore('reader', () => {
  const readerTheme = ref('dark')
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  const chineseConverterType = ref(0)
  const reSegment = ref(false)
  const todayReadCount = ref(loadTodayCount())
  const loaded = ref(false)
  const bookSettings = ref<Record<string, any>>({})

  // 内存缓存 readingProgress，避免频繁读写磁盘
  let progressCache: Record<string, any> | null = null

  async function loadSettings(): Promise<void> {
    try {
      const settings = await store.get('readerSettings')
      if (settings) {
        readerTheme.value = settings.readerTheme || 'dark'
        fontSize.value = settings.fontSize || READER.FONT_SIZE_DEFAULT
        lineHeight.value = settings.lineHeight || READER.LINE_HEIGHT_DEFAULT
        chineseConverterType.value = settings.chineseConverterType ?? 0
        reSegment.value = settings.reSegment ?? false
      }
      const saved = await store.get('bookReaderSettings')
      if (saved) {
        bookSettings.value = saved
      }
    } catch {
      // ignore
    }
    todayReadCount.value = loadTodayCount()
    loaded.value = true
  }

  async function saveSettings(): Promise<void> {
    await store.set('readerSettings', {
      readerTheme: readerTheme.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      chineseConverterType: chineseConverterType.value,
      reSegment: reSegment.value,
    })
  }

  function saveBookSettings(bookUrl: string, settings: any): void {
    bookSettings.value = {
      ...bookSettings.value,
      [bookUrl]: settings,
    }
    store.set('bookReaderSettings', bookSettings.value).catch(() => {})
  }

  function getBookSettings(bookUrl: string): any {
    return bookSettings.value[bookUrl] || {}
  }

  function hasBookSettings(bookUrl: string): boolean {
    return !!bookSettings.value[bookUrl]
  }

  function clearBookSettings(bookUrl: string): void {
    if (bookSettings.value[bookUrl]) {
      delete bookSettings.value[bookUrl]
      store.set('bookReaderSettings', bookSettings.value).catch(() => {})
    }
  }

  function incrementTodayReadCount(): void {
    todayReadCount.value++
    saveTodayCount(todayReadCount.value)
  }

  function setReaderTheme(val: string): void {
    readerTheme.value = val
    saveSettings()
  }

  function setFontSize(val: number): void {
    fontSize.value = Math.max(READER.FONT_SIZE_MIN, Math.min(READER.FONT_SIZE_MAX, val))
    saveSettings()
  }

  function setLineHeight(val: number): void {
    lineHeight.value = Math.max(READER.LINE_HEIGHT_MIN, Math.min(READER.LINE_HEIGHT_MAX, val))
    saveSettings()
  }

  function increaseFontSize(): void { setFontSize(fontSize.value + 1) }
  function decreaseFontSize(): void { setFontSize(fontSize.value - 1) }
  function increaseLineHeight(): void { setLineHeight(lineHeight.value + 0.2) }
  function decreaseLineHeight(): void { setLineHeight(lineHeight.value - 0.2) }

  function setChineseConverterType(val: number): void {
    chineseConverterType.value = val
    saveSettings()
  }

  function setReSegment(val: boolean): void {
    reSegment.value = val
    saveSettings()
  }

  async function saveProgress(
    bookUrl: string,
    _bookName: string,
    _author: string,
    chapterId: number,
    chapterPos: number,
    chapterTitle: string,
  ): Promise<void> {
    if (!bookUrl) return
    try {
      if (!progressCache) {
        const raw = await store.get('readingProgress')
        progressCache = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      }
      progressCache[bookUrl] = {
        bookUrl,
        chapterId,
        chapterPos,
        chapterTitle,
        updatedAt: new Date().toISOString(),
      }
      await store.set('readingProgress', progressCache)
    } catch (e) {
      console.warn('[reader] saveProgress 失败:', e)
    }
  }

  async function loadProgress(
    bookUrl: string,
    _bookName?: string,
    _author?: string,
  ): Promise<any> {
    if (!bookUrl) return null
    try {
      if (progressCache && progressCache[bookUrl] !== undefined) {
        return progressCache[bookUrl]
      }
      const raw = await store.get('readingProgress')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        progressCache = raw
        return raw[bookUrl] || null
      }
    } catch (e) {
      console.warn('[reader] loadProgress 失败:', e)
    }
    return null
  }

  function resetProgressCache(): void {
    progressCache = null
  }

  return {
    readerTheme, fontSize, lineHeight, chineseConverterType, reSegment,
    todayReadCount, loaded, bookSettings,
    loadSettings, saveSettings, saveBookSettings, getBookSettings, hasBookSettings, clearBookSettings,
    setReaderTheme, setFontSize, setLineHeight,
    increaseFontSize, decreaseFontSize,
    increaseLineHeight, decreaseLineHeight,
    setChineseConverterType, setReSegment,
    incrementTodayReadCount,
    saveProgress, loadProgress, resetProgressCache,
  }
})
