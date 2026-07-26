<template>
  <div class="bookshelf-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书架</h1>
        <p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p>
      </div>
      <div class="header-actions">
        <input v-model="searchText" type="text" placeholder="搜索书名..." class="input-search" autocomplete="off" name="bookshelf-search" id="bookshelf-search" />
        <button class="btn-secondary" @click="showAddUrlModal = true">添加网址</button>
        <button class="btn-secondary" @click="triggerImport">导入 TXT</button>
        <button class="btn-secondary" @click="refreshBooks">刷新</button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".txt" class="hidden" name="txt-import" id="txt-import" @change="onImport" />

    <n-modal v-model:show="showAddUrlModal" preset="dialog" title="添加网址" positive-text="添加" @positive-click="addUrlBook">
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
        <div><label>书籍链接</label><n-input v-model:value="addUrl" placeholder="输入书籍详情页或目录页链接..." /></div>
        <div><label>选择书源</label>
          <CustomDropdown v-model="addUrlSourceIndex" :options="addUrlSourceOptions" placeholder="选择书源..." />
        </div>
      </div>
    </n-modal>

    <div v-if="bookshelfStore.loading" class="books-grid">
      <div v-for="i in 8" :key="i" class="book-card-skeleton">
        <div class="skeleton skeleton-cover"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-author"></div>
      </div>
    </div>

    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="books-grid">
      <div
        v-for="(book, idx) in bookshelfStore.filteredBooks"
        :key="book.bookUrl || idx"
        class="book-card"
        @click="openBook(idx)"
      >
        <div class="book-cover">
          <img
            v-if="getCoverSrc(book) && !(book as any)._coverFailed"
            :src="getCoverSrc(book)"
            loading="lazy"
            @error="() => (book as any)._coverFailed = true"
          />
          <div v-if="!getCoverSrc(book) || (book as any)._coverFailed" class="cover-placeholder">
            <div class="cover-overlay">
              <div class="cover-title">{{ book.name || '未命名' }}</div>
              <div class="cover-author">{{ book.author || '佚名' }}</div>
            </div>
          </div>
        </div>
        <div class="book-info">
          <h4>{{ book.name || '未命名' }}</h4>
          <p>{{ book.author || '佚名' }}</p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <h3>书架空空如也</h3>
      <p>导入 TXT、添加网址或搜索添加书籍</p>
      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn-primary" @click="triggerImport">导入 TXT</button>
        <button class="btn-primary" @click="showAddUrlModal = true">添加网址</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { useBookshelfStore } from '@/store'
import { store, reader as readerApi } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import CustomDropdown from '@/components/CustomDropdown.vue'
import type { BookSource, Book } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const showAddUrlModal = ref(false)
const addUrl = ref('')
const addUrlSourceIndex = ref(0)
const coverCache = ref<Record<string, string>>({})

const addUrlSourceOptions = computed(() =>
  (Array.isArray(sources.value) ? sources.value : []).map((s: BookSource, i: number) => ({
    label: s.bookSourceName || '未命名',
    value: i
  }))
)

watch(searchText, (val) => bookshelfStore.setFilter(val))

async function loadSources() {
  try { sources.value = (await store.get('bookSource')) || [] } catch { sources.value = [] }
}

function getCoverSrc(book: Book): string | null {
  if (!book.coverUrl) return null
  if (coverCache.value[book.coverUrl]) return coverCache.value[book.coverUrl]
  loadCoverFromCache(book)
  return book.coverUrl
}

async function loadCoverFromCache(book: Book) {
  if (!book.coverUrl) return
  try {
    const cached = await invoke('cache_get_cover', { url: book.coverUrl })
    if (cached) {
      coverCache.value = { ...coverCache.value, [book.coverUrl!]: cached as string }
    }
  } catch {}
}

async function refreshBooks() {
  await bookshelfStore.loadBooks()
  await loadSources()
  message.success('已刷新')
}

function triggerImport() { fileInput.value?.click() }

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    if (!text?.trim()) { message.warning('文件内容为空'); return }
    const name = file.name.replace(/\.txt$/i, '')
    const result: any = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks()
    message.success(`已导入《${result.name || name}》`)
  } catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = '' }
}

async function addUrlBook() {
  if (!addUrl.value.trim()) { message.warning('请输入书籍链接'); return }
  const arr = Array.isArray(sources.value) ? sources.value : []
  const source = arr[addUrlSourceIndex.value]
  if (!source) { message.error('请选择书源'); return }
  try {
    const { getBookInfo } = await import('../../engine/business/book-info.js')
    const result = await getBookInfo(source, addUrl.value.trim())
    if (!result || !result.name) throw new Error('获取失败')
    const newBook = { ...result, origin: source.bookSourceUrl || '', originName: source.bookSourceName || source.name || '' }
    const books = (await store.get('bookshelf')) || []
    const bookList = Array.isArray(books) ? books : []
    bookList.unshift(newBook)
    await store.set('bookshelf', bookList)
    await bookshelfStore.loadBooks()
    message.success(`已添加《${newBook.name}》到书架`)
    showAddUrlModal.value = false; addUrl.value = ''
  } catch (err: any) { message.error('添加失败: ' + err.message) }
}

function openBook(index: number) {
  const books = bookshelfStore.filteredBooks
  const book = Array.isArray(books) ? books[index] : null
  if (!book) return
  const arr = Array.isArray(sources.value) ? sources.value : []
  const source = arr.find(s => (s.bookSourceName || s.name) === book.originName)
  bookshelfStore.openDetail(book, source || null)
}

onMounted(() => { Promise.all([bookshelfStore.loadBooks(), loadSources()]) })
</script>

<style scoped>
.bookshelf-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input-search { width: 200px; }
</style>
