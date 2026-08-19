// ============================================
// useBookDetail — 书籍详情页业务逻辑
// ============================================

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useBookshelfStore, useReaderStore } from '@/stores'
import { store, engine } from '@/services'
import { useBookInfo } from '@/composables/useBookInfo.js'
import { useToc } from '@/composables/useToc.js'
import { useChangeSource } from '@/composables/useChangeSource.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource, Chapter } from '@/types'

const COVER_SEARCH_CONCURRENCY = 5

function safeString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (typeof (val as any).text === 'function') {
      return String((val as any).text() || '')
    }
    if (typeof (val as any).toString === 'function' && (val as any).toString() !== '[object Object]') {
      return (val as any).toString()
    }
    try {
      return JSON.stringify(val)
    } catch {
      return ''
    }
  }
  return String(val)
}

export function useBookDetail(book: Book | null, source: BookSource | null) {
  const router = useRouter()
  const msg = useMessage()
  const bookshelfStore = useBookshelfStore()
  const readerStore = useReaderStore()
  const { handleAndNotify } = useErrorHandler()
  const { loadedIntro, loadedKind, loadedLastChapter, loadedWordCount, loadedCover, loadBookInfo } = useBookInfo()
  const { chapters, loadingToc, loadTocSmart } = useToc()
  const { showChangeSource, changeSourceResults, changingSource, searchDone, searchTotal, openChangeSource, searchForChange, closeChangeSource } = useChangeSource()

  const currentChapterId = ref<number | null>(null)
  const hasReadingProgress = ref(false)
  const lastChapterId = ref<number | null>(null)
  const isLoggedIn = ref(false)
  const showRemoveConfirm = ref(false)
  const showMoreMenu = ref(false)
  const showSourceVarModal = ref(false)
  const showBookVarModal = ref(false)
  const sourceVarInput = ref('')
  const bookVarInput = ref('')

  const showCoverPicker = ref(false)
  const coverPickerLoading = ref(false)
  const coverOptions = ref<{ coverUrl: string | null; label: string; sourceName: string; isCurrent: boolean; sourceIndex?: number }[]>([])

  const needsLogin = computed(() => !!(source as any)?.loginUrl)
  const isInShelf = computed(() => bookshelfStore.hasBook(book?.bookUrl || ''))

  const mainCover = computed(() => {
    if (loadedCover.value) {
      const str = safeString(loadedCover.value)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        return str
      }
    }
    if (book?.customCoverUrl) {
      const str = safeString(book.customCoverUrl)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        return str
      }
    }
    if (book?.coverUrl) {
      const str = safeString(book.coverUrl)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        return str
      }
    }
    return null
  })

  const fallbackCoverUrls = computed(() => {
    const urls: string[] = []
    if (book?.coverUrl && mainCover.value !== book.coverUrl) {
      const str = safeString(book.coverUrl)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        urls.push(str)
      }
    }
    if (book?.customCoverUrl && mainCover.value !== book.customCoverUrl) {
      const str = safeString(book.customCoverUrl)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        urls.push(str)
      }
    }
    if (loadedCover.value && mainCover.value !== loadedCover.value) {
      const str = safeString(loadedCover.value)
      if (str && !str.startsWith('[object') && str !== 'undefined' && str !== 'null') {
        urls.push(str)
      }
    }
    return urls
  })

  const displayAuthor = computed(() => {
    const raw = book?.author || '未知作者'
    const str = safeString(raw)
    if (str.startsWith('[object') || str === 'undefined' || str === 'null') return '未知作者'
    return str.replace(/^\s*作\s*者[:：\s]+|\s+著$/g, '').trim() || '未知作者'
  })

  const displayIntro = computed(() => {
    const intro = loadedIntro.value || book?.customIntro || book?.intro || null
    if (!intro) return '暂无简介'
    const str = safeString(intro)
    if (str.startsWith('[object') || str === 'undefined' || str === 'null' || !str.trim()) {
      return '暂无简介'
    }
    return str
  })

  const fullIntroHtml = computed(() => {
    const text = displayIntro.value
    if (text === '暂无简介' || !text) {
      return '<span style="color:var(--text-muted)">暂无简介</span>'
    }
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return text
    }
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => '\u3000\u3000' + l)
      .join('<br>')
  })

  const safeKind = computed(() => {
    const raw = loadedKind.value
    if (!raw) return null
    const str = safeString(raw)
    if (str.startsWith('[object') || str === 'undefined' || str === 'null' || !str.trim()) return null
    return str
  })

  const safeWordCount = computed(() => {
    const raw = loadedWordCount.value
    if (!raw) return null
    const str = safeString(raw)
    if (str.startsWith('[object') || str === 'undefined' || str === 'null' || !str.trim()) return null
    return str
  })

  const safeLastChapter = computed(() => {
    const raw = loadedLastChapter.value
    if (!raw) return null
    const str = safeString(raw)
    if (str.startsWith('[object') || str === 'undefined' || str === 'null' || !str.trim()) return null
    return str
  })

  async function loadReadingProgress(): Promise<void> {
    if (!book) return
    try {
      const progress = await readerStore.loadProgress(book.bookUrl, book.name, book.author)
      if (progress && progress.chapterId !== undefined) {
        hasReadingProgress.value = true
        lastChapterId.value = progress.chapterId
      }
    } catch {
      // ignore
    }
  }

  async function init(): Promise<void> {
    if (!book || !source) return

    loadingToc.value = true

    try {
      await Promise.all([loadBookInfo(book, source), loadReadingProgress()])

      await loadTocSmart(source, book.tocUrl || book.bookUrl, book)

      if (lastChapterId.value && chapters.value.length > 0) {
        const idx = chapters.value.findIndex((c) => c.id === lastChapterId.value)
        if (idx !== -1) {
          currentChapterId.value = lastChapterId.value
          setTimeout(() => {
            const el = document.querySelector('.chapter-item.active')
            if (el) el.scrollIntoView({ block: 'center' })
          }, 100)
        }
      }
    } catch (err) {
      loadingToc.value = false
      const result = handleAndNotify(err, {
        module: 'bookshelf',
        operation: 'initBookDetail',
        sourceUrl: source?.bookSourceUrl,
        userMessage: '加载书籍详情失败',
      })
      if (result.shouldShowUser) msg.warning(result.message)
    }
  }

  function handleChapterClick(ch: Chapter): void {
    if (!book) return
    currentChapterId.value = ch.id
    bookshelfStore.closeDetail()
    bookshelfStore.openReader({ ...book, _forceChapterIndex: chapters.value.findIndex((c) => c.id === ch.id) }, source, chapters.value)
  }

  async function handleRead(): Promise<void> {
    if (!book) return
    bookshelfStore.closeDetail()
    if (hasReadingProgress.value && lastChapterId.value !== null && chapters.value.length > 0) {
      const idx = chapters.value.findIndex((c) => c.id === lastChapterId.value)
      if (idx !== -1) {
        bookshelfStore.openReader({ ...book, _forceChapterIndex: idx }, source, chapters.value)
        return
      }
    }
    bookshelfStore.openReader(book, source, chapters.value)
  }

  async function handleAddToShelf(): Promise<void> {
    if (isInShelf.value) {
      msg.info('已在书架中')
      return
    }
    const bookToSave = { ...book!, kind: safeKind.value || book?.kind }
    if (await bookshelfStore.addBook({
      ...bookToSave,
      origin: source?.bookSourceUrl || '',
      originName: source?.bookSourceName || source?.name || ''
    })) {
      msg.success('已添加《' + book!.name + '》')
    }
  }

  async function handleRemoveFromShelf(): Promise<void> {
    showRemoveConfirm.value = false
    await bookshelfStore.removeBookByUrl(book!.bookUrl)
    msg.success('已移出')
  }

  function handleChangeSource(): void {
    showMoreMenu.value = false
    openChangeSource()
  }

  async function handleSearchForChange(): Promise<void> {
    if (book) await searchForChange(book.name)
  }

  async function handleConfirmChangeSource(item: any): Promise<void> {
    const newValues = {
      bookUrl: item.bookUrl,
      tocUrl: item.tocUrl || item.bookUrl,
      coverUrl: safeString(item.coverUrl) || null,
      intro: safeString(item.intro) || null,
      kind: safeString(item.kind) || null,
      lastChapter: safeString(item.lastChapter) || null,
      wordCount: safeString(item.wordCount) || null,
      origin: item._sourceUrl || '',
      originName: item._sourceName || ''
    }
    await bookshelfStore.updateBook(book!.bookUrl, newValues)
    closeChangeSource()
    chapters.value = []
    await init()
    msg.success('书源已切换')
  }

  function handleSearchKind(): void {
    if (safeKind.value) router.push({ name: 'search', query: { keyword: safeKind.value } })
  }

  function toggleMoreMenu(): void {
    showMoreMenu.value = !showMoreMenu.value
  }

  async function handleLoginFromMenu(): Promise<void> {
    showMoreMenu.value = false
    if (!source) return
    const src = source as any
    if (src.loginUrl) {
      try {
        const { loginWebview } = await import('@/services/network.js')
        await loginWebview(src.bookSourceUrl || src.loginUrl || '', src.bookSourceName || '登录', 300)
        msg.success('登录成功')
        isLoggedIn.value = true
        chapters.value = []
        await init()
      } catch (err: any) {
        msg.error('登录失败: ' + (err?.message || String(err)))
      }
    }
  }

  function openSourceVar(): void {
    showMoreMenu.value = false
    showSourceVarModal.value = true
  }

  function openBookVar(): void {
    showMoreMenu.value = false
    showBookVarModal.value = true
  }

  function openBookUrl(): void {
    if (!book) return
    const url = book.bookUrl || book.tocUrl
    if (!url) {
      msg.warning('该书籍没有可打开的网址')
      return
    }
    window.open(url, '_blank')
  }

  async function saveSourceVar(): Promise<void> {
    if (!source) return
    const value = sourceVarInput.value.trim()
    try {
      const safeValue = JSON.stringify(value)
      await engine.executeJs(`java.put("custom", ${safeValue})`, {
        source: source,
        baseUrl: source.bookSourceUrl || '',
        book: book || {},
        result: value,
      })
      showSourceVarModal.value = false
      msg.success('源变量已保存')
      chapters.value = []
      await init()
    } catch (err: any) {
      msg.error('保存失败: ' + err.message)
    }
  }

  async function saveBookVar(): Promise<void> {
    if (!source) return
    const value = bookVarInput.value.trim()
    try {
      const safeValue = JSON.stringify(value)
      await engine.executeJs(`java.put("custom", ${safeValue})`, {
        source: source,
        baseUrl: source.bookSourceUrl || '',
        book: book || {},
        result: value,
      })
      showBookVarModal.value = false
      msg.success('书籍变量已保存')
      chapters.value = []
      await init()
    } catch (err: any) {
      msg.error('保存失败: ' + err.message)
    }
  }

  async function openCoverPicker(): Promise<void> {
    if (!book) return
    showCoverPicker.value = true
    coverPickerLoading.value = true
    coverOptions.value = []

    try {
      const allSources: any[] = (await store.get('bookSource')) || []
      const enabledSources = allSources.filter((s: any) => s.enabled !== false)
      const bookName = book.name

      const results: { sourceName: string; coverUrl: string | null; sourceIndex: number }[] = []
      results.push({ sourceName: '默认封面', coverUrl: null, sourceIndex: -1 })

      const queue = [...enabledSources]
      const workerCount = Math.min(COVER_SEARCH_CONCURRENCY, queue.length)

      async function worker() {
        while (queue.length > 0) {
          const sourceItem = queue.shift()
          if (!sourceItem) break
          try {
            const { search } = await import('@/services/search.js')
            const books = await search(sourceItem, bookName, { page: 1 })
            if (books && books.length > 0) {
              const found = books.find((b: any) => b.name === bookName)
              if (found && found.coverUrl) {
                results.push({
                  sourceName: sourceItem.bookSourceName || sourceItem.name || '未知书源',
                  coverUrl: safeString(found.coverUrl) || null,
                  sourceIndex: enabledSources.indexOf(sourceItem),
                })
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const workers = []
      for (let i = 0; i < workerCount; i++) workers.push(worker())
      await Promise.all(workers)

      const seen = new Set<string>()
      const uniqueResults = results.filter((item) => {
        const key = item.coverUrl || '__default__'
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const currentCover = book?.customCoverUrl || book?.coverUrl

      coverOptions.value = uniqueResults.map((item) => ({
        coverUrl: item.coverUrl,
        label: item.sourceName,
        sourceName: item.sourceName,
        sourceIndex: item.sourceIndex,
        isCurrent: item.coverUrl === currentCover || (item.coverUrl === null && currentCover === null),
      }))
    } catch (err) {
      msg.error('加载封面失败: ' + (err?.message || String(err)))
    } finally {
      coverPickerLoading.value = false
    }
  }

  async function selectCover(item: { coverUrl: string | null; label: string; sourceName: string; isCurrent: boolean }): Promise<void> {
    if (!book) return
    if (item.isCurrent) {
      showCoverPicker.value = false
      return
    }

    try {
      await bookshelfStore.updateBook(book.bookUrl, {
        customCoverUrl: item.coverUrl,
      })
      book.customCoverUrl = item.coverUrl || undefined
      coverOptions.value = coverOptions.value.map((opt) => ({
        ...opt,
        isCurrent: opt.coverUrl === item.coverUrl && opt.sourceName === item.sourceName,
      }))
      msg.success('封面已更换')
      await init()
    } catch (err) {
      msg.error('更换封面失败: ' + (err?.message || String(err)))
    }
  }

  function handleEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (showMoreMenu.value) {
        showMoreMenu.value = false
        return
      }
      if (book) {
        handleClose()
      }
    }
  }

  function handleClose(): void {
    showMoreMenu.value = false
  }

  function onDocumentClick(e: MouseEvent): void {
    if (showMoreMenu.value) {
      const target = e.target as HTMLElement
      if (!target.closest('.more-menu') && !target.closest('.btn-icon-footer')) {
        showMoreMenu.value = false
      }
    }
  }

  return {
    currentChapterId,
    hasReadingProgress,
    lastChapterId,
    isLoggedIn,
    showRemoveConfirm,
    showMoreMenu,
    showSourceVarModal,
    showBookVarModal,
    sourceVarInput,
    bookVarInput,
    showCoverPicker,
    coverPickerLoading,
    coverOptions,
    needsLogin,
    isInShelf,
    mainCover,
    fallbackCoverUrls,
    displayAuthor,
    displayIntro,
    fullIntroHtml,
    loadedKind: safeKind,
    loadedWordCount: safeWordCount,
    loadedLastChapter: safeLastChapter,
    loadedIntro,
    chapters,
    loadingToc,
    showChangeSource,
    changeSourceResults,
    changingSource,
    searchDone,
    searchTotal,
    init,
    handleChapterClick,
    handleRead,
    handleAddToShelf,
    handleRemoveFromShelf,
    handleChangeSource,
    handleSearchForChange,
    handleConfirmChangeSource,
    handleSearchKind,
    toggleMoreMenu,
    handleLoginFromMenu,
    openSourceVar,
    openBookVar,
    openBookUrl,
    saveSourceVar,
    saveBookVar,
    openCoverPicker,
    selectCover,
    handleEscape,
    handleClose,
    onDocumentClick,
  }
}
