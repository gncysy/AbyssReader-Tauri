import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Book, BookSource } from '@shared/types'
import { store } from '@/api'

export const useBookshelfStore = defineStore('bookshelf', () => {
  const books = ref<Book[]>([])
  const loading = ref(false)
  const filterText = ref('')
  const showDetail = ref(false)
  const detailBook = ref<Book | null>(null)
  const detailSource = ref<BookSource | null>(null)
  const showReader = ref(false)
  const readerBook = ref<Book | null>(null)
  const readerSource = ref<BookSource | null>(null)

  const filteredBooks = computed(() => {
    if (!filterText.value.trim()) return books.value
    const kw = filterText.value.trim().toLowerCase()
    return books.value.filter(b =>
      b.name.toLowerCase().includes(kw) ||
      b.author.toLowerCase().includes(kw)
    )
  })

  async function loadBooks() {
    loading.value = true
    try {
      books.value = (await store.get('bookshelf')) || []
    } finally { loading.value = false }
  }

  function setFilter(text: string) { filterText.value = text }

  function hasBook(bookUrl: string): boolean {
    return books.value.some(b => b.bookUrl === bookUrl)
  }

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

  function openDetail(book: Book, source: BookSource | null) {
    detailBook.value = book
    detailSource.value = source
    showDetail.value = true
  }

  function closeDetail() { showDetail.value = false; detailBook.value = null }

  function openReader(book: Book, source: BookSource | null, chapters?: any[]) {
    readerBook.value = book
    readerSource.value = source
    showReader.value = true
  }

  function closeReader() { showReader.value = false; readerBook.value = null }

  return {
    books, loading, filterText, filteredBooks,
    showDetail, detailBook, detailSource,
    showReader, readerBook, readerSource,
    loadBooks, setFilter, hasBook, addBook, removeBookByUrl,
    openDetail, closeDetail, openReader, closeReader,
  }
})
