<template>
  <div class="search-page">
    <header class="page-header"><h1 class="page-title">搜索</h1><p class="page-subtitle">多书源并发搜索</p></header>
    <div class="search-bar">
      <SearchInput ref="searchInput" v-model="keyword" placeholder="输入书名或作者..." name="main-search" @search="handleSearch" style="flex:1;min-width:150px" />
      <button class="btn-primary" :disabled="loading || !keyword.trim()" @click="handleSearch">{{ loading ? '搜索中...' : '搜索' }}</button>

      <button v-if="loading" class="btn-secondary" @click="cancelSearch">取消</button>
      <button v-else-if="searched && !loading" class="btn-secondary" @click="clearResults">清空</button>

      <span v-if="!loading && completedCount > 0 && searched" style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);white-space:nowrap;margin-left:4px">
        <ProgressBar :percent="100" style="width:80px;display:inline-block;vertical-align:middle" />
        <span>{{ completedCount }}/{{ totalSources }}</span>
        <span style="color:var(--text-muted)">✓</span>
      </span>
    </div>

    <div v-if="loading && totalSources > 0" class="search-progress">
      <ProgressBar :percent="progressPercent" style="width:100%;height:4px" />
      <span class="progress-text">{{ completedCount }}/{{ totalSources }} 个书源已完成</span>
    </div>

    <div v-if="resultKeys.length === 0 && !loading && searched" class="empty-wrapper">
      <EmptyState title="未找到相关书籍" description="试试其他关键词" />
    </div>
    <div v-else-if="resultKeys.length === 0 && !loading && !searched" class="empty-wrapper">
      <EmptyState title="输入关键词开始搜索" description="支持书名、作者搜索，多书源并发" />
    </div>

    <div v-if="resultKeys.length > 0" class="results">
      <BookSection v-for="key in resultKeys" :key="key" :title="key" :count="searchResults[key]?.length || 0">
        <BookGrid :books="searchResults[key] || []" @click-book="openBookDetail($event, key)" />
      </BookSection>
    </div>

    <BookDetail v-if="bookshelfStore.showDetail" :book="bookshelfStore.detailBook ? JSON.parse(JSON.stringify(bookshelfStore.detailBook)) : null" :source="bookshelfStore.detailSource ? JSON.parse(JSON.stringify(bookshelfStore.detailSource)) : null" @close="bookshelfStore.closeDetail()" />
    <Reader v-if="bookshelfStore.showReader" :book="bookshelfStore.readerBook ? JSON.parse(JSON.stringify(bookshelfStore.readerBook)) : null" :source="bookshelfStore.readerSource ? JSON.parse(JSON.stringify(bookshelfStore.readerSource)) : null" :initial-chapters="bookshelfStore.readerChapters" @close="bookshelfStore.closeReader()" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import { useBookshelfStore } from '@/stores/bookshelf.js'
import { useSearch } from '@/composables/useSearch.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource } from '@/types'
import SearchInput from '@/components/common/SearchInput.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import BookSection from '@/components/book/BookSection.vue'
import BookGrid from '@/components/book/BookGrid.vue'
import BookDetail from '@/components/book/BookDetail.vue'
import Reader from '@/components/reader/Reader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const msg = useMessage()
const bookshelfStore = useBookshelfStore()
const { handleAndNotify } = useErrorHandler()
const sources = ref<BookSource[]>([])
const keyword = ref('')
const searchInput = ref<InstanceType<typeof SearchInput> | null>(null)
const searched = ref(false)
const { loading, completedCount, totalSources, searchResults, doSearch, cancelSearch, clearResults: clearSearchResults } = useSearch()

const resultKeys = computed(() => Object.keys(searchResults.value).filter((k) => searchResults.value[k]?.length > 0))
const progressPercent = computed(() => {
  if (totalSources.value === 0) return 0
  return Math.round((completedCount.value / totalSources.value) * 100)
})

async function loadSources(): Promise<void> {
  try {
    sources.value = (await store.get('bookSource')) || []
  } catch (err) {
    handleAndNotify(err, { module: 'search', operation: 'loadSources', userMessage: '加载书源失败' })
  }
}

function clearResults(): void {
  if (loading.value) return
  clearSearchResults()
  searched.value = false
}

async function handleSearch(): Promise<void> {
  const kw = keyword.value.trim()
  if (!kw) { msg.warning('请输入关键词'); searchInput.value?.$el?.focus(); return }
  const enabled = sources.value.filter((s) => s.enabled !== false)
  if (!enabled.length) { msg.warning('没有已启用的书源'); return }
  searched.value = true
  try {
    await doSearch(enabled, kw, { page: 1 })
    if (Object.keys(searchResults.value).length === 0) msg.info('未找到相关书籍')
  } catch (err) {
    handleAndNotify(err, { module: 'search', operation: 'handleSearch', userMessage: '搜索失败' })
  }
}

function openBookDetail(book: Book, sourceName: string): void {
  // 同名书源：优先匹配 book.origin 或 book.originName
  const source = sources.value.find((s) => {
    const sName = s.bookSourceName || s.name
    return sName === sourceName || sName === (book as any).originName || s.bookSourceUrl === (book as any).origin
  })
  bookshelfStore.openDetail(
    { ...book, origin: source?.bookSourceUrl || '', originName: source?.bookSourceName || source?.name || '' },
    source || null
  )
}

onMounted(() => { loadSources(); nextTick(() => searchInput.value?.$el?.focus()) })
onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.search-page { position: relative; z-index: 1; }
.search-bar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.search-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 6px 12px; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.progress-text { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
.results { margin-top: 20px; }
.empty-wrapper { margin-top: 40px; }
</style>
