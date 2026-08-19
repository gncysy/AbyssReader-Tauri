// ============================================
// useChapterContent — 章节正文加载 & 预加载
// ============================================

import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getContent } from '@/services/content.js'
import { purifyText } from '@engine/business/content/purify.js'
import type { PurifyOptions } from '@engine/business/content/purify.js'
import { extractImageUrls, createComicImages } from '@engine/business/comic/index.js'
import type { ComicImage } from '@engine/business/comic/index.js'
import { loadComicImages, prefetchComicImages } from '@/services/comic.js'
import { getCachedContent, setCachedContent, getPreloadedContent, setPreloadedContent, getRawContent, setRawContent } from '@/services/cache.js'
import { engine } from '@/services/engine.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource, Chapter } from '@/types'
import { READER } from '@/constants/reader.js'

export function useChapterContent() {
  const message = useMessage()
  const { handleAndNotify } = useErrorHandler()
  const content = ref('')
  const loadingContent = ref(false)
  const chapterIndex = ref(0)
  const chapters = ref<Chapter[]>([])
  const isComic = ref(false)
  const comicImages = ref<ComicImage[]>([])
  const scrollPercent = ref(0)

  let preloadQueue: number[] = []
  const preloadingSet = new Set<number>()
  let isChaptersLoaded = false
  let chaptersLoadPromise: Promise<void> | null = null

  const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

  async function loadChaptersForBook(
    book: Book, source: BookSource | null,
    initialChapters?: Chapter[],
  ): Promise<void> {
    if (isChaptersLoaded && chapters.value.length > 0) return
    if (chaptersLoadPromise) {
      await chaptersLoadPromise
      return
    }

    if (initialChapters?.length) {
      chapters.value = initialChapters
      isChaptersLoaded = true
      return
    }

    chaptersLoadPromise = (async () => {
      try {
        if (book.bookUrl?.startsWith('local://')) {
          const { reader } = await import('@/services/reader.js')
          const bookId = book.bookUrl.replace('local://', '')
          const data = await reader.getLocalBookChapters(bookId)
          chapters.value = Array.isArray(data) ? data : [{ id: 0, title: '正文', url: book.bookUrl, index: 0 }]
          return
        }
        if (!source) {
          const { store } = await import('@/services/store.js')
          const allSources: any[] = (await store.get('bookSource')) || []
          source = allSources.find((s: any) => s.bookSourceName === book.originName) || null
        }
        if (!source) { chapters.value = []; return }
        const { useToc } = await import('./useToc.js')
        const toc = useToc()
        const result = await toc.loadToc(source, book.tocUrl || book.bookUrl, book)
        chapters.value = result
      } catch (err: any) {
        const result = handleAndNotify(err, {
          module: 'reader',
          operation: 'loadChaptersForBook',
          sourceUrl: source?.bookSourceUrl,
          userMessage: '加载目录失败，请检查书源',
        })
        if (result.shouldShowUser) message.warning(result.message)
        chapters.value = []
      } finally {
        isChaptersLoaded = true
        chaptersLoadPromise = null
      }
    })()

    await chaptersLoadPromise
  }

  async function chineseConvert(text: string): Promise<string> {
    try {
      const { useReaderStore } = await import('@/stores/reader.js')
      const readerStore = useReaderStore()
      const converterType = readerStore.chineseConverterType
      if (converterType === 0 || !text) return text
      const fnName = converterType === 1 ? 'java.t2s' : 'java.s2t'
      const result = await engine.executeJs(fnName + '(result)', {
        result: text,
        baseUrl: '',
        book: {},
        source: {},
      })
      if (result) return result
      return text
    } catch {
      return text
    }
  }

  async function loadRawContent(
    book: Book, source: BookSource,
    _reSegmentEnabled: boolean, _bookName: string, _replaceRules: any[],
    forceRefresh = false
  ): Promise<string> {
    const ch = currentChapter.value
    if (!ch) return ''

    if (!forceRefresh) {
      const rawCached = getRawContent(book, chapterIndex.value)
      if (rawCached) return rawCached

      const cached = await getCachedContent(book, ch.id)
      if (cached) {
        setRawContent(book, chapterIndex.value, cached)
        return cached
      }
    }

    if (book.bookUrl?.startsWith('local://')) {
      const { reader } = await import('@/services/reader.js')
      const bookId = book.bookUrl.replace('local://', '')
      const raw = String(await reader.getLocalChapterContent(bookId, ch.id) || '')
      setRawContent(book, chapterIndex.value, raw)
      return raw
    }

    isComic.value = source.bookSourceType === 2
    const rawContent = await getContent(source, ch.url, {
      bookKind: book.kind,
      book,
      nextChapterUrl: chapters.value[chapterIndex.value + 1]?.url || '',
      chapter: ch,
      skipCache: forceRefresh
    })

    setRawContent(book, chapterIndex.value, rawContent)
    return rawContent
  }

  function applyTransform(raw: string, purifyEnabled: boolean, reSegmentEnabled: boolean, bookName: string, replaceRules: any[]): string {
    if (!raw) return ''
    const purifyOptions: PurifyOptions = {
      chapterTitle: currentChapter.value?.title || '',
      bookName,
      reSegmentEnabled,
      purifyEnabled,
      rules: replaceRules
    }
    return purifyEnabled ? purifyText(raw, purifyOptions) : raw
  }

  async function loadContent(
    book: Book, source: BookSource, purifyEnabled: boolean,
    reSegmentEnabled: boolean, bookName: string, replaceRules: any[],
    forceRefresh = false
  ): Promise<void> {
    const ch = currentChapter.value
    if (!ch) return
    comicImages.value = []
    scrollPercent.value = 0

    // 修复：先检查内存缓存，命中则直接返回，不显示 loading
    if (!forceRefresh) {
      const rawCached = getRawContent(book, chapterIndex.value)
      if (rawCached) {
        content.value = rawCached
        return
      }
    }

    loadingContent.value = true

    try {
      const raw = await loadRawContent(book, source, reSegmentEnabled, bookName, replaceRules, forceRefresh)
      content.value = raw

      if (isComic.value && raw && typeof raw === 'string') {
        const urls = extractImageUrls(raw)
        if (urls.length > 0) {
          comicImages.value = createComicImages(urls)
          const comicId = book.bookUrl + '/' + (ch.id ?? 0)
          loadComicImages(comicImages.value, JSON.stringify(source), comicId)
        }
      }

      if (!forceRefresh) {
        await setCachedContent(book, ch.id, raw)
      }
    } catch (err: any) {
      const result = handleAndNotify(err, {
        module: 'reader',
        operation: 'loadContent',
        sourceUrl: source.bookSourceUrl,
        userMessage: '加载章节失败，请检查网络',
      })
      if (result.shouldShowUser) message.warning(result.message)
      content.value = '<p style="color:var(--text-muted);text-align:center;padding:40px">' + result.message + '</p>'
    } finally {
      loadingContent.value = false
    }
  }

  function startPreload(book: Book, source: BookSource, purifyEnabled: boolean, reSegmentEnabled: boolean, bookName: string, replaceRules: any[]): void {
    if (isComic.value) return
    preloadQueue = []
    preloadingSet.clear()

    for (let i = chapterIndex.value + 1; i < Math.min(chapterIndex.value + 1 + READER.PRELOAD_COUNT, chapters.value.length); i++) {
      if (getPreloadedContent(book, i)) continue
      if (preloadingSet.has(i)) continue
      preloadingSet.add(i)
      preloadQueue.push(i)
    }
    processPreloadQueue(book, source, purifyEnabled, reSegmentEnabled, bookName, replaceRules)
  }

  async function processPreloadQueue(book: Book, source: BookSource, _purifyEnabled: boolean, _reSegmentEnabled: boolean, _bookName: string, _replaceRules: any[]): Promise<void> {
    async function preloadOne(): Promise<void> {
      while (preloadQueue.length > 0) {
        const idx = preloadQueue.shift()!
        const ch = chapters.value[idx]
        if (!ch) continue
        const cached = await getCachedContent(book, ch.id)
        if (cached) {
          setPreloadedContent(book, idx, cached)
          continue
        }
        try {
          const raw = await getContent(source, ch.url, { bookKind: book.kind, book, nextChapterUrl: chapters.value[idx + 1]?.url || '', chapter: ch })
          if (raw) {
            setRawContent(book, idx, raw)
            setPreloadedContent(book, idx, raw)
            await setCachedContent(book, ch.id, raw)
          }
        } catch {
          // ignore
        }
      }
    }
    preloadOne(); preloadOne()
  }

  function prevChapter(): void { if (chapterIndex.value > 0) { chapterIndex.value--; scrollPercent.value = 0 } }
  function nextChapter(): void { if (chapterIndex.value < chapters.value.length - 1) { chapterIndex.value++; scrollPercent.value = 0 } }

  return {
    content, loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter,
    loadChaptersForBook, loadContent, loadRawContent, startPreload,
    prevChapter, nextChapter, chineseConvert
  }
}
