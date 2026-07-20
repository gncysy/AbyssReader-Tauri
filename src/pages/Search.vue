<template>
  <div class="search-page">
    <header class="page-header">
      <h1 class="page-title">搜索</h1>
      <p class="page-subtitle">多书源并发搜索</p>
    </header>

    <div class="search-bar">
      <input ref="searchInput" v-model="keyword" type="text" placeholder="输入书名或作者..." class="search-input" name="main-search" id="main-search" autocomplete="off" @keydown.enter="doSearch" />
      <button class="btn-primary" :disabled="loading || !keyword.trim()" @click="doSearch">
        {{ loading ? '搜索中...' : '搜索' }}
      </button>
      <button class="btn-secondary" @click="clearResults">清空</button>
    </div>

    <div v-if="loading" style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      <div class="progress-bar" style="flex:1"><div class="progress-fill" :style="{ width: (completedCount / Math.max(totalSources, 1) * 100) + '%' }"></div></div>
      <span style="font-size:12px;color:var(--text-muted)">{{ completedCount }} / {{ totalSources }}</span>
      <button class="btn-secondary" @click="cancelSearch">取消</button>
    </div>

    <div v-if="resultKeys.length > 0" class="results">
      <div v-for="key in resultKeys" :key="key" class="result-group">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border-color);margin-bottom:14px">
          <h3 style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0">{{ key }}</h3>
          <span style="font-size:13px;color:var(--text-muted)">{{ searchResults[key]?.length || 0 }} 本</span>
        </div>
        <div class="books-grid">
          <div v-for="book in searchResults[key]" :key="book.bookUrl" class="book-card" @click="openBookDetail(book, key)">
            <div class="book-cover">
              <img v-if="book.coverUrl" :src="book.coverUrl" loading="lazy" @error="handleImageError" />
              <div v-else class="cover-placeholder">
                <div class="cover-overlay"><div class="cover-title">{{ book.name || '未命名' }}</div><div class="cover-author">{{ book.author || '佚名' }}</div></div>
              </div>
            </div>
            <div class="book-info"><h4>{{ book.name || '未命名' }}</h4><p>{{ book.author || '佚名' }}</p></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="searched && !loading" class="empty-state">
      <h3>未找到相关书籍</h3>
      <p>试试其他关键词</p>
    </div>

    <div v-else class="empty-state" style="padding:88px 0">
      <h3>输入关键词开始搜索</h3>
      <p>支持书名、作者搜索，多书源并发</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { store, engine } from '@/api'
import { useBookshelfStore } from '@/store'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const sources = ref<BookSource[]>([])
const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const completedCount = ref(0)
const totalSources = ref(0)
const searchResults = ref<Record<string, Book[]>>({})
const searchInput = ref<HTMLInputElement | null>(null)

const CONCURRENCY = 5
let globalAbort = new AbortController()

const resultKeys = computed(() => Object.keys(searchResults.value).filter(k => searchResults.value[k]?.length > 0))

async function loadSources() {
  try {
    const raw = await store.get('bookSource')
    sources.value = Array.isArray(raw) ? raw : []
  } catch {}
}

function clearResults() {
  searchResults.value = {}
  searched.value = false
  completedCount.value = 0
  totalSources.value = 0
}

function cancelSearch() {
  globalAbort.abort()
  globalAbort = new AbortController()
  loading.value = false
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) { message.warning('请输入关键词'); searchInput.value?.focus(); return }

  const arr = Array.isArray(sources.value) ? sources.value : []
  const enabled = arr.filter(s => s.enabled !== false)
  if (!enabled.length) { message.warning('没有已启用的书源'); return }

  cancelSearch()
  globalAbort = new AbortController()
  const signal = globalAbort.signal

  loading.value = true
  searched.value = true
  completedCount.value = 0
  totalSources.value = enabled.length
  searchResults.value = {}

  const queue = [...enabled]
  const workers: Promise<void>[] = []

  async function worker() {
    while (queue.length > 0 && !signal.aborted) {
      const source = queue.shift()
      if (!source) break

      try {
        if (signal.aborted) return
        // 调用 Rust engine_search（内部已支持 header + @js: 的 URL）
        const result: any = await engine.search(source, kw, 1)
        if (signal.aborted) return

        if (result?.success && result?.data?.html) {
          const html = result.data.html
          let books: Book[] = []
          try {
            const json = JSON.parse(html)
            if (json.data && Array.isArray(json.data)) {
              books = json.data.map((item: any) => ({
                name: item.novelName || item.name || item.title || '',
                author: item.authorName || item.author || '',
                bookUrl: item.novelId ? `${(source.bookSourceUrl || '').replace(/##.*$/, '')}/novel/${item.novelId}` : (item.bookUrl || item.url || ''),
                coverUrl: item.cover || item.coverUrl || '',
                intro: item.summary || item.intro || '',
              } as Book))
            }
          } catch {}

          if (books.length > 0) {
            const key = source.bookSourceName || source.name || source.bookSourceUrl
            searchResults.value = { ...searchResults.value, [key]: books }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal.aborted) return
      }
      if (!signal.aborted) completedCount.value++
    }
  }

  for (let i = 0; i < Math.min(CONCURRENCY, enabled.length); i++) {
    workers.push(worker())
  }

  await Promise.all(workers).catch(() => {})
  if (!signal.aborted) {
    loading.value = false
    const total = Object.values(searchResults.value).reduce((sum, arr) => sum + arr.length, 0)
    if (total === 0) message.info('未找到相关书籍')
    else message.success(`找到 ${total} 本书`)
  }
}

function openBookDetail(book: Book, sourceName: string) {
  const arr = Array.isArray(sources.value) ? sources.value : []
  const source = arr.find(s => (s.bookSourceName || s.name) === sourceName)
  bookshelfStore.openDetail(book, source || null)
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement
  const parent = img.parentElement
  if (!parent) return
  img.remove()
  if (!parent.querySelector('.cover-placeholder')) {
    const div = document.createElement('div'); div.className = 'cover-placeholder'
    const title = parent.closest('.book-card')?.querySelector('h4')?.textContent || '未命名'
    const author = parent.closest('.book-card')?.querySelector('p')?.textContent || '佚名'
    div.innerHTML = `<div class="cover-overlay"><div class="cover-title">${title}</div><div class="cover-author">${author}</div></div>`
    parent.appendChild(div)
  }
}

onMounted(() => { loadSources(); nextTick(() => searchInput.value?.focus()) })
onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.search-page { position: relative; z-index: 1; }
.search-bar { display: flex; gap: 12px; margin-bottom: 18px; }
.search-input { flex: 1; min-width: 220px; }
.results { margin-top: 20px; }
.result-group { margin-bottom: 36px; }
</style>
