<template>
  <div class="explore-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">发现</h1>
        <p class="page-subtitle">{{ sourceName }}</p>
      </div>
      <button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="showLogModal = true">
        日志
      </button>
    </header>

    <!-- 书源选择 -->
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      <CustomDropdown
        v-model="selectedIndex"
        :options="sourceOptions"
        placeholder="选择书源..."
        @update:modelValue="(v: string | number) => onSourceChange(Number(v))"
        style="min-width:200px"
      />
      <input
        v-model="sourceFilter"
        type="text"
        placeholder="搜索书源..."
        class="input-search"
        style="width:160px"
        autocomplete="off"
      />
      <button
        v-if="hasFilters"
        class="btn-secondary"
        style="padding:4px 12px;font-size:12px"
        @click="resetFilters"
      >
        重置筛选
      </button>
      <span v-if="loadingCategories" style="font-size:12px;color:var(--text-muted)">加载中...</span>
    </div>

    <!-- 分类渲染 -->
    <div v-if="categories.length > 0" class="explore-categories">
      <template v-for="(cat, idx) in categories" :key="idx">
        <!-- 分隔符/标题（无 url） -->
        <div
          v-if="!cat.url && cat.title && cat.title.trim()"
          class="category-divider"
          :class="{ 'category-divider-first': isFirstDivider(idx) }"
        >
          {{ cat.title }}
        </div>

        <!-- url: 普通分类按钮 -->
        <button
          v-else-if="cat.type === 'url' && cat.url"
          class="category-tag"
          :class="{ active: currentCategory?.title === cat.title }"
          @click="exploreCategory(cat)"
        >
          {{ cat.title }}
        </button>

        <!-- text: 文本输入框 -->
        <div v-else-if="cat.type === 'text'" class="category-text-wrapper">
          <span class="category-label">{{ cat.title }}</span>
          <input
            :value="getInfoMapValue(cat)"
            type="text"
            class="category-text-input"
            :placeholder="getViewName(cat) || cat.title"
            @input="onTextInput(cat, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- button: 操作按钮 -->
        <button
          v-else-if="cat.type === 'button'"
          class="category-action-btn"
          @click="onActionClick(cat)"
        >
          {{ getViewName(cat) || cat.title }}
        </button>

        <!-- toggle: 折叠开关 -->
        <button
          v-else-if="cat.type === 'toggle'"
          class="category-toggle-btn"
          @click="onToggleClick(cat)"
        >
          <span class="toggle-char">{{ getToggleChar(cat) }}</span>
          <span>{{ getViewName(cat) || cat.title }}</span>
        </button>

        <!-- select: 下拉选择框 -->
        <div v-else-if="cat.type === 'select'" class="category-select-wrapper">
          <span class="category-label">{{ getViewName(cat) || cat.title }}</span>
          <CustomDropdown
            :model-value="getInfoMapValue(cat) || cat.default || (cat.chars?.[0] || '')"
            :options="(cat.chars || []).map(c => ({ label: c, value: c }))"
            placeholder="请选择"
            @update:modelValue="(v: string | number) => onSelectChange(cat, String(v))"
            style="min-width:100px"
          />
        </div>

        <!-- 占位符 -->
        <span v-else-if="cat.title === '※'" class="category-placeholder"></span>
      </template>
    </div>

    <div v-else-if="!loadingCategories && selectedIndex >= 0" class="empty-state" style="padding:20px 0">
      <p style="color:var(--text-muted)">暂无分类</p>
    </div>

    <!-- 书籍网格 -->
    <div v-if="loading && books.length === 0" class="books-grid">
      <div v-for="i in 12" :key="i" class="book-card-skeleton"><div class="skeleton skeleton-cover"></div></div>
    </div>

    <div v-else-if="books.length > 0" class="books-grid" ref="booksGridRef">
      <div
        v-for="book in books"
        :key="book.bookUrl"
        class="book-card"
        @click="openBookDetail(book)"
      >
        <div class="book-cover">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            loading="lazy"
            @error="(e: Event) => (e.target as HTMLImageElement).style.display='none'"
          />
          <div v-else class="cover-placeholder">
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

    <div v-if="loading && books.length > 0" style="display:flex;justify-content:center;padding:20px 0">
      <div class="loading-spinner"></div>
      <span style="margin-left:12px;color:var(--text-muted);font-size:14px">加载中...</span>
    </div>

    <div
      v-if="!loading && books.length > 0 && !hasMore"
      style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:13px"
    >
      — 已加载全部 —
    </div>

    <div
      v-else-if="!loading && !loadingCategories && books.length === 0 && categories.length > 0 && currentCategory"
      class="empty-state"
      style="padding:40px 0"
    >
      <h3>暂无书籍</h3>
      <p style="color:var(--text-muted);font-size:13px">该分类下没有找到内容</p>
    </div>

    <div
      v-else-if="!loading && !loadingCategories && categories.length > 0 && !currentCategory"
      class="empty-state"
      style="padding:40px 0"
    >
      <h3>选择分类</h3>
      <p style="color:var(--text-muted);font-size:13px">点击上方分类标签加载书籍</p>
    </div>

    <div v-else-if="selectedIndex < 0" class="empty-state" style="padding:40px 0">
      <h3>选择书源</h3>
      <p style="color:var(--text-muted);font-size:13px">从上方下拉框选择书源开始发现</p>
    </div>

    <!-- 日志模态框 - 只显示 explore 模块的日志 -->
    <n-modal v-model:show="showLogModal" preset="card" title="发现页日志" style="max-width:800px;max-height:70vh" :bordered="false">
      <div class="log-modal-body">
        <div class="log-header">
          <span>共 {{ exploreLogs.length }} 条</span>
          <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="clearExploreLogs">清空</button>
        </div>
        <div class="log-list" ref="logListRef">
          <div v-for="(log, idx) in exploreLogs" :key="idx" class="log-entry" :class="'log-' + log.level">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-module">{{ log.module }}</span>
            <span class="log-source">{{ log.source }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
          <div v-if="exploreLogs.length === 0" style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
            暂无发现页日志
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useMessage, NModal } from 'naive-ui'
import { store, engine } from '@/api'
import { useBookshelfStore } from '@/store'
import { useInfoMapStore } from '@/store/info-map'
import CustomDropdown from '@/components/CustomDropdown.vue'
import { onLog, offLog, logHistory, logInfo, logError, logDebug, type LogEntry, type LogModule } from '../../engine/event/index.js'
import type { Book, BookSource } from '@shared/types'
import type { ExploreKind } from '../../engine/business/explore.js'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const infoMapStore = useInfoMapStore()

const sources = ref<BookSource[]>([])
const selectedIndex = ref(-1)
const sourceFilter = ref('')
const categories = ref<ExploreKind[]>([])
const loadingCategories = ref(false)
const currentCategory = ref<ExploreKind | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)
const currentPage = ref(1)
const hasMore = ref(true)
const booksGridRef = ref<HTMLElement | null>(null)
let loadMoreObserver: IntersectionObserver | null = null

// 日志相关 - 只订阅 explore 模块
const showLogModal = ref(false)
const exploreLogs = ref<LogEntry[]>([])
const logListRef = ref<HTMLElement | null>(null)

// 日志处理函数 - 只处理 explore 模块
const logHandler = (entry: LogEntry) => {
  if (entry.module === 'explore') {
    exploreLogs.value = [...exploreLogs.value, entry].slice(-1000)
  }
}

function clearExploreLogs() {
  exploreLogs.value = []
}

// 当前书源 URL
const currentSourceUrl = computed(() => {
  if (selectedIndex.value < 0) return ''
  const arr = Array.isArray(sources.value) ? sources.value : []
  return arr[selectedIndex.value]?.bookSourceUrl || ''
})

const sourceName = computed(() => {
  if (selectedIndex.value < 0) return '选择书源'
  const arr = Array.isArray(sources.value) ? sources.value : []
  return arr[selectedIndex.value]?.bookSourceName || '书源'
})

const hasFilters = computed(() => {
  return categories.value.some(c => c.type === 'select' || c.type === 'toggle' || c.type === 'text')
})

const filteredSources = computed(() => {
  const result: { source: BookSource; originalIndex: number }[] = []
  const filter = sourceFilter.value.trim().toLowerCase()
  const arr = Array.isArray(sources.value) ? sources.value : []
  arr.forEach((source, i) => {
    if (!source.exploreUrl?.trim()) return
    if (filter && !(source.bookSourceName || source.name || '').toLowerCase().includes(filter)) return
    result.push({ source, originalIndex: i })
  })
  return result
})

const sourceOptions = computed(() => {
  const opts: { label: string; value: number }[] = [{ label: '选择书源...', value: -1 }]
  for (const item of filteredSources.value) {
    opts.push({ label: item.source.bookSourceName || item.source.name || '未命名', value: item.originalIndex })
  }
  return opts
})

// ─── 判断是否为第一个分隔符 ───
function isFirstDivider(idx: number): boolean {
  for (let i = idx - 1; i >= 0; i--) {
    const prev = categories.value[i]
    if (prev && prev.title && prev.title.trim() && !prev.url) {
      return false
    }
    if (prev && prev.type === 'url' && prev.url) {
      return true
    }
  }
  return true
}

// ─── InfoMap 操作 ───
function getInfoMapValue(cat: ExploreKind): string {
  const key = cat.title
  return infoMapStore.get(currentSourceUrl.value, key)
}

function setInfoMapValue(cat: ExploreKind, value: string): void {
  const key = cat.title
  infoMapStore.set(currentSourceUrl.value, key, value)
}

// ─── viewName 解析 ───
function getViewName(cat: ExploreKind): string {
  if (!cat.viewName) return ''
  const trimmed = cat.viewName.trim()
  if (trimmed.length >= 3 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return ''
}

// ─── Toggle 字符 ───
function getToggleChar(cat: ExploreKind): string {
  const chars = cat.chars || ['↓ ', '↑ ']
  const current = getInfoMapValue(cat) || cat.default || chars[0]
  return current
}

// ─── 加载书源列表 ───
async function loadSources() {
  try {
    sources.value = (await store.get('bookSource')) || []
    const first = filteredSources.value[0]
    if (first) {
      selectedIndex.value = first.originalIndex
      await loadCategories()
    }
  } catch {}
}

// ─── 加载分类 ───
async function loadCategories() {
  categories.value = []
  loadingCategories.value = true
  books.value = []
  currentCategory.value = null
  currentPage.value = 1
  hasMore.value = true

  if (selectedIndex.value < 0) {
    loadingCategories.value = false
    return
  }

  try {
    const source = sources.value[selectedIndex.value]
    if (!source) { loadingCategories.value = false; return }

    logInfo('explore', 'frontend', '开始加载分类, 书源=' + (source.bookSourceName || source.name))

    const { getExploreCategoriesAsync } = await import('../../engine/business/explore.js')
    const result = await getExploreCategoriesAsync(source)

    logInfo('explore', 'frontend', '分类加载完成, 数量=' + (result ? result.length : 0))

    if (result && Array.isArray(result)) {
      categories.value = result
      const first = result.find(c => c.type === 'url' && c.url)
      if (first) {
        await exploreCategory(first)
      }
    }
  } catch (err) {
    logError('explore', 'frontend', '加载分类失败: ' + (err as Error).message)
    console.warn('[Explore] 加载分类失败:', err)
  } finally {
    loadingCategories.value = false
  }
}

// ─── 切换书源 ───
async function onSourceChange(val: number) {
  selectedIndex.value = val
  await loadCategories()
}

// ─── 点击分类 ───
async function exploreCategory(cat: ExploreKind) {
  if (!cat.url) return
  if (selectedIndex.value < 0) return
  currentCategory.value = cat
  currentPage.value = 1
  books.value = []
  hasMore.value = true
  await loadBooks()
}

// ─── Select 变化 ───
async function onSelectChange(cat: ExploreKind, value: string) {
  setInfoMapValue(cat, value)
  if (cat.action) {
    await executeAction(cat.action)
  }
  if (currentCategory.value) {
    currentPage.value = 1
    books.value = []
    hasMore.value = true
    await loadBooks()
  }
}

// ─── Toggle 点击 ───
async function onToggleClick(cat: ExploreKind) {
  const chars = cat.chars || ['↓ ', '↑ ']
  const current = getInfoMapValue(cat) || cat.default || chars[0]
  const currentIndex = chars.indexOf(current)
  const nextIndex = (currentIndex + 1) % chars.length
  const next = chars[nextIndex] || chars[0]
  setInfoMapValue(cat, next)
  if (cat.action) {
    await executeAction(cat.action)
  }
  await loadCategories()
}

// ─── Text 输入 ───
let textInputTimer: any = null
async function onTextInput(cat: ExploreKind, value: string) {
  setInfoMapValue(cat, value)
  if (cat.action) {
    if (textInputTimer) {
      clearTimeout(textInputTimer)
    }
    textInputTimer = setTimeout(async () => {
      await executeAction(cat.action)
      textInputTimer = null
    }, 600)
  }
}

// ─── Button 点击 ───
async function onActionClick(cat: ExploreKind) {
  if (cat.action) {
    await executeAction(cat.action)
  }
}

// ─── 执行 Action ───
async function executeAction(action: string) {
  try {
    let processed = action
    processed = processed.replace(/Map\(['"]([^'"]+)['"]\)/g, (_, key) => {
      return JSON.stringify(infoMapStore.get(currentSourceUrl.value, key) || '')
    })
    processed = processed.replace(/infoMap\['([^']+)'\]/g, (_, key) => {
      return JSON.stringify(infoMapStore.get(currentSourceUrl.value, key) || '')
    })
    processed = processed.replace(/infoMap\["([^"]+)"\]/g, (_, key) => {
      return JSON.stringify(infoMapStore.get(currentSourceUrl.value, key) || '')
    })
    const fn = new Function(
      'sourceUrl',
      'infoMap',
      'java',
      'setInfoMap',
      'getInfoMap',
      'refreshExplore',
      'return (' + processed + ')'
    )
    await fn(
      currentSourceUrl.value,
      infoMapStore,
      {
        toast: (msg: string) => message.info(msg),
        log: console.log,
        refreshExplore: () => loadCategories(),
      },
      (key: string, val: string) => infoMapStore.set(currentSourceUrl.value, key, val),
      (key: string) => infoMapStore.get(currentSourceUrl.value, key),
      () => loadCategories()
    )
  } catch (e) {
    logError('explore', 'frontend', 'action执行失败: ' + (e as Error).message)
  }
}

// ─── 重置筛选 ───
function resetFilters() {
  const map = infoMapStore.getMap(currentSourceUrl.value)
  for (const cat of categories.value) {
    if (cat.type === 'select' || cat.type === 'toggle' || cat.type === 'text') {
      delete map.data[cat.title]
    }
  }
  map.needSave = true
  infoMapStore.saveNow(currentSourceUrl.value)
  loadCategories()
}

// ─── 加载书籍 ───
async function loadBooks() {
  if (!currentCategory.value) return
  if (!hasMore.value) return
  if (loading.value) return

  loading.value = true
  try {
    const source = sources.value[selectedIndex.value]
    if (!source) return

    let url = currentCategory.value.url || ''
    url = url.replace(/\{\{page\}\}/g, String(currentPage.value))
    url = url.replace(/\{\{if\(page==1\)\{([^}]*)\}\}\}/g, (_, expr) => {
      if (currentPage.value === 1) {
        return expr || ''
      }
      return ''
    })
    url = url.replace(/\{\{source\.get\(['"]([^'"]+)['"]\)\}\}/g, (_, key) => {
      return source[key] || ''
    })
    url = url.replace(/\{\{infoMap\[['"]([^'"]+)['"]\]\}\}/g, (_, key) => {
      return infoMapStore.get(currentSourceUrl.value, key) || ''
    })

    const result = await engine.getExploreBooks(source, url, currentPage.value)
    const newBooks = Array.isArray(result) ? result : []
    if (newBooks.length === 0) {
      hasMore.value = false
    } else {
      books.value = [...books.value, ...newBooks]
      currentPage.value++
      if (newBooks.length < 10) {
        hasMore.value = false
      }
    }
  } catch (err) {
    logError('explore', 'frontend', '加载书籍失败: ' + (err as Error).message)
    hasMore.value = false
  } finally {
    loading.value = false
    nextTick(() => setupLoadMoreObserver())
  }
}

// ─── 滚动加载 ───
function setupLoadMoreObserver() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect()
    loadMoreObserver = null
  }

  const grid = booksGridRef.value
  if (!grid) return

  let sentinel = grid.querySelector('.load-more-sentinel')
  if (!sentinel) {
    sentinel = document.createElement('div')
    sentinel.className = 'load-more-sentinel'
    sentinel.style.height = '1px'
    sentinel.style.width = '100%'
    sentinel.style.visibility = 'hidden'
    grid.parentNode?.appendChild(sentinel)
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !loading.value && hasMore.value && currentCategory.value) {
        loadBooks()
      }
    },
    { rootMargin: '0px 0px 100px 0px' }
  )
  loadMoreObserver.observe(sentinel)
}

// ─── 打开书籍详情 ───
function openBookDetail(book: Book) {
  const source = sources.value[selectedIndex.value]
  if (!source) return
  const bookWithOrigin = {
    ...book,
    origin: source.bookSourceUrl || '',
    originName: source.bookSourceName || source.name || '',
  }
  bookshelfStore.openDetail(bookWithOrigin, source)
}

// ─── 日志订阅 ───
function setupLogSubscription() {
  // 只订阅 explore 模块的日志
  const unsubscribe = onLog(logHandler)

  // 回放历史日志中 explore 模块的
  for (const entry of logHistory) {
    if (entry.module === 'explore') {
      exploreLogs.value = [...exploreLogs.value, entry].slice(-1000)
    }
  }

  // 保存取消函数
  ;(window as any).__exploreUnsubscribe = unsubscribe
}

onMounted(() => {
  loadSources()
  setupLogSubscription()
})

onUnmounted(() => {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect()
    loadMoreObserver = null
  }
  infoMapStore.saveAll()
  // 取消订阅
  const unsubscribe = (window as any).__exploreUnsubscribe
  if (unsubscribe) {
    unsubscribe()
    delete (window as any).__exploreUnsubscribe
  }
})

watch(selectedIndex, () => { loadCategories() })
</script>

<style scoped>
.explore-page { position: relative; z-index: 1; }

.explore-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  padding: 8px 0 16px 0;
  min-height: 40px;
}

/* ─── 分隔符/标题 ─── */
.category-divider {
  width: 100%;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 10px 0 4px 0;
  margin-top: 6px;
  border-top: 1px solid var(--border-color);
  opacity: 0.7;
  letter-spacing: 0.06em;
}
.category-divider-first {
  border-top: none;
  margin-top: 0;
  padding-top: 2px;
}

/* ─── 普通分类标签 ─── */
.category-tag {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s, border-color 0.2s;
}
.category-tag:hover { color: var(--text-primary); }
.category-tag.active { color: var(--brand); border-bottom-color: var(--brand); }

.category-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.category-text-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}
.category-text-input {
  padding: 4px 10px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  outline: none;
  min-width: 120px;
  height: 32px;
}
.category-text-input:focus { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); }

.category-action-btn {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--brand);
  background: var(--bg-active);
  border: 1px solid rgba(212, 160, 23, 0.2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s, background 0.2s;
}
.category-action-btn:hover {
  background: var(--brand);
  color: #fff;
}

.category-toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.category-toggle-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--brand);
}
.toggle-char {
  font-size: 12px;
  color: var(--text-muted);
}

.category-select-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.category-placeholder {
  display: none;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px;
}

/* ─── 日志模态框 ─── */
.log-modal-body {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.log-list {
  flex: 1;
  overflow-y: auto;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}
.log-entry {
  display: flex;
  gap: 6px;
  padding: 1px 4px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
}
.log-time {
  color: var(--text-muted);
  min-width: 70px;
  font-size: 10px;
  flex-shrink: 0;
}
.log-module {
  color: var(--brand);
  min-width: 50px;
  font-size: 9px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 600;
}
.log-source {
  color: var(--text-muted);
  min-width: 32px;
  font-size: 9px;
  flex-shrink: 0;
  text-align: center;
}
.log-message {
  word-break: break-all;
}
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-warn .log-message { color: #d4a017; }
.log-info .log-message { color: var(--text-secondary); }
</style>
