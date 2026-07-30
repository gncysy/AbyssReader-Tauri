import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Book, BookSource } from '@shared/types'
import { store } from '@/api'

export const useBookshelfStore = defineStore('bookshelf', () => {
  const books = ref<Book[]>([])
  const loading = ref(false)
  const filterText = ref('')
  const activeGroup = ref<number>(-1)
  const showDetail = ref(false)
  const detailBook = ref<Book | null>(null)
  const detailSource = ref<BookSource | null>(null)
  const showReader = ref(false)
  const readerBook = ref<Book | null>(null)
  const readerSource = ref<BookSource | null>(null)
  const readerChapters = ref<any[]>([])

  const filteredBooks = computed(() => {
    let result = books.value
    if (filterText.value.trim()) {
      const kw = filterText.value.trim().toLowerCase()
      result = result.filter(b => b.name.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw))
    }
    if (activeGroup.value !== -1) {
      result = result.filter(b => (b.group || -1) === activeGroup.value)
    }
    return result
  })

  async function loadBooks() {
    loading.value = true
    try { books.value = (await store.get('bookshelf')) || [] } catch { books.value = [] }
    finally { loading.value = false }
  }

  function setFilter(text: string) { filterText.value = text }
  function setActiveGroup(groupId: number) { activeGroup.value = groupId }
  function hasBook(bookUrl: string): boolean { return books.value.some(b => b.bookUrl === bookUrl) }

  async function addBook(book: Book): Promise<boolean> {
    if (hasBook(book.bookUrl)) return false
    const all = (await store.get('bookshelf')) || []
    all.unshift(book)
    await store.set('bookshelf', all)
    await loadBooks()
    return true
  }

  async function removeBookByUrl(bookUrl: string) {
    const all = (await store.get('bookshelf')) || []
    await store.set('bookshelf', all.filter((b: Book) => b.bookUrl !== bookUrl))
    await loadBooks()
  }

  async function updateBook(bookUrl: string, fields: Partial<Book>) {
    const all = (await store.get('bookshelf')) || []
    const index = all.findIndex((b: Book) => b.bookUrl === bookUrl)
    if (index !== -1) {
      all[index] = { ...all[index], ...fields }
      await store.set('bookshelf', all)
      const localIndex = books.value.findIndex((b: Book) => b.bookUrl === bookUrl)
      if (localIndex !== -1) books.value[localIndex] = { ...books.value[localIndex], ...fields }
      if (detailBook.value && detailBook.value.bookUrl === bookUrl) detailBook.value = { ...detailBook.value, ...fields }
    }
  }

  async function updateBookKind(bookUrl: string, kind: string) { await updateBook(bookUrl, { kind }) }

  function getBookKind(bookUrl: string): string {
    if (detailBook.value && detailBook.value.bookUrl === bookUrl && detailBook.value.kind) return detailBook.value.kind
    const found = books.value.find((b: Book) => b.bookUrl === bookUrl)
    return found?.kind || ''
  }

  function openDetail(book: Book, source: BookSource | null) { detailBook.value = book; detailSource.value = source; showDetail.value = true }
  function closeDetail() { showDetail.value = false; detailBook.value = null }

  function openReader(book: Book, source: BookSource | null, chapters?: any[]) {
    readerBook.value = book; readerSource.value = source; readerChapters.value = chapters || []; showReader.value = true
  }
  function closeReader() { showReader.value = false; readerBook.value = null; readerChapters.value = [] }

  return {
    books, loading, filterText, activeGroup, filteredBooks,
    showDetail, detailBook, detailSource,
    showReader, readerBook, readerSource, readerChapters,
    loadBooks, setFilter, setActiveGroup, hasBook, addBook, removeBookByUrl,
    updateBook, updateBookKind, getBookKind,
    openDetail, closeDetail, openReader, closeReader,
  }
})
