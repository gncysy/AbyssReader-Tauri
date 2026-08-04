<template>
  <Transition name="detail">
    <div v-if="book" class="detail-overlay" @click.self="handleClose" role="dialog" aria-modal="true">
      <div class="detail-container" tabindex="-1">
        <header class="detail-header">
          <button class="btn-back" @click="handleClose">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h2 class="detail-title">{{ book.name || '加载中...' }}</h2>
        </header>
        <div class="detail-body">
          <div class="detail-cover">
            <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.name" @error="handleImageError" />
            <div v-else class="cover-placeholder"><div class="cover-overlay"><div class="cover-title-text">{{ book.name }}</div><div class="cover-author-text">{{ book.author }}</div></div></div>
            <div v-if="book.originName" class="cover-source-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {{ book.originName }}
            </div>
          </div>
          <div class="detail-info">
            <h1 class="book-title">{{ book.name }}</h1>
            <p class="book-author">{{ book.author || '未知作者' }}</p>
            <div class="book-meta-row">
              <span v-if="loadedKind" class="meta-chip meta-kind">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                {{ loadedKind }}
              </span>
              <span v-if="loadedWordCount" class="meta-chip meta-word-count">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/></svg>
                {{ loadedWordCount }}
              </span>
              <span v-if="loadedLastChapter" class="meta-chip meta-last-chapter">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <span class="meta-chip-scroll">{{ loadedLastChapter }}</span>
              </span>
            </div>
            <div class="book-intro-scroll" v-html="fullIntroHtml"></div>
          </div>
        </div>
        <div v-if="showLoginUi" class="login-ui-panel">
          <div class="login-ui-header"><span>登录 - {{ props.source?.bookSourceName || '' }}</span><button class="btn-back-inline" @click="showLoginUi = false">关闭</button></div>
          <div class="login-ui-body">
            <div v-for="(item, idx) in loginUiItems" :key="idx" class="login-ui-row">
              <template v-if="item.type === 'button'"><button class="btn-primary" style="padding:6px 14px;font-size:12px;width:100%" @click="handleLoginAction(item)">{{ item.name }}</button></template>
              <template v-else-if="item.type === 'toggle'"><span style="font-size:12px;color:var(--text-secondary)">{{ item.name }}</span><div class="debug-tabs" style="margin-left:auto"><button v-for="c in item.chars" :key="c" class="debug-tab" :class="{ active: loginUiState[item.name] === c }" @click="loginUiState[item.name] = c">{{ c }}</button></div></template>
              <template v-else-if="item.type === 'text'"><span style="font-size:12px;color:var(--text-muted)">{{ item.name }}</span></template>
            </div>
          </div>
        </div>
        <div class="detail-toc">
          <div class="toc-header">
            <h3>目录</h3>
            <span class="toc-count">{{ filteredChapters.length }} 章</span>
            <div class="toc-search" v-if="!loadingToc && safeChapters.length > 0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toc-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="tocFilter" type="text" placeholder="搜索..." class="toc-search-input" />
            </div>
            <div v-if="totalTocPages > 1" class="toc-pagination-inline">
              <button class="btn-page" :disabled="tocCurrentPage <= 0" @click="tocCurrentPage--">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span class="page-num">{{ tocCurrentPage + 1 }}/{{ totalTocPages }}</span>
              <button class="btn-page" :disabled="tocCurrentPage >= totalTocPages - 1" @click="tocCurrentPage++">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
          <div class="toc-list" ref="tocListRef" v-if="!loadingToc">
            <div v-for="ch in pagedChapters" :key="ch.id" class="toc-item" :class="{ active: ch.id === currentChapterId }" @click="handleChapterClick(ch)">
              <span class="toc-title">{{ ch.title }}</span>
              <span v-if="ch.isVip" class="badge badge-vip">VIP</span>
            </div>
            <div v-if="filteredChapters.length === 0 && safeChapters.length > 0" class="empty-state" style="padding:40px"><p>未找到匹配章节</p></div>
            <div v-if="safeChapters.length === 0 && !loadingToc" class="empty-state" style="padding:40px"><p>暂无目录</p></div>
          </div>
          <div v-if="loadingToc" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:40px"><div class="loading-spinner"></div><span style="color:var(--text-muted)">加载目录中...</span></div>
        </div>
        <footer class="detail-footer">
          <button class="btn-danger" @click="handleRemoveFromShelf">移出</button>
          <button class="btn-secondary" @click="openChangeSource" style="padding:6px 14px;font-size:12px">换源</button>
          <div style="flex:1"></div>
          <button v-if="needsLogin && !isLoggedIn" class="btn-primary" @click="handleLogin" style="background:var(--brand);">登录</button>
          <button class="btn-secondary" @click="handleAddToShelf" :disabled="isInShelf">{{ isInShelf ? '已在书架' : '加书架' }}</button>
          <button class="btn-primary" @click="handleRead">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            {{ hasReadingProgress ? '继续阅读' : '开始阅读' }}
          </button>
        </footer>
      </div>
      <n-modal v-model:show="showChangeSource" preset="card" title="换源" style="max-width:650px" :bordered="false" @after-enter="lockBodyScroll" @after-leave="unlockBodyScroll">
        <div class="cs-wrapper">
          <button class="btn-primary" @click="searchForChange" :disabled="changingSource" style="padding:10px 18px;font-size:14px;width:100%;flex-shrink:0">{{ changingSource ? '搜索中... (' + searchDone + '/' + searchTotal + ')' : '开始换源搜索' }}</button>
          <div v-if="changeSourceResults.length > 0" class="change-source-list">
            <div v-for="item in changeSourceResults" :key="item.bookUrl + item._sourceName" class="change-source-item" @click="confirmChangeSource(item)">
              <div class="cs-item-main"><span class="cs-item-name">{{ item.name }}</span><span class="cs-item-author">{{ item.author }}</span></div>
              <div class="cs-item-meta"><span class="cs-item-source">{{ item._sourceName }}</span><span v-if="item.lastChapter" class="cs-item-chapter">{{ item.lastChapter }}</span></div>
            </div>
          </div>
          <div v-else-if="changingSource" style="display:flex;justify-content:center;padding:40px;flex-shrink:0"><div class="loading-spinner"></div></div>
          <div v-else style="color:var(--text-muted);text-align:center;padding:20px;flex-shrink:0">点击按钮并发搜索所有书源</div>
        </div>
      </n-modal>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMessage, useDialog, NModal } from 'naive-ui'
import { useBookshelfStore, useReadingStore } from '@/store'
import { reader as readerApi, store, loginWebview } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{ book: Book | null; source: BookSource | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const dialog = useDialog()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()

const chapters = ref<Chapter[]>([])
const loadingToc = ref(false)
const currentChapterId = ref<number | null>(null)
const tocFilter = ref('')
const tocCurrentPage = ref(0)
const tocPageSize = 200
const tocListRef = ref<HTMLElement | null>(null)
const loadedIntro = ref<string | null>(null)
const loadedKind = ref<string | null>(null)
const loadedLastChapter = ref<string | null>(null)
const loadedWordCount = ref<string | null>(null)
const showChangeSource = ref(false)
const isLoggedIn = ref(false)
const showLoginUi = ref(false)
const loginUiItems = ref<any[]>([])
const loginUiState = ref<Record<string, string>>({})
const needsLogin = computed(() => !!(props.source as any)?.loginUrl)
const changeSourceResults = ref<any[]>([])
const changingSource = ref(false); const searchDone = ref(0); const searchTotal = ref(0)
const allSourceList = ref<BookSource[]>([])
const hasReadingProgress = ref(false)
const lastChapterId = ref<number | null>(null)

const safeChapters = computed(() => Array.isArray(chapters.value) ? chapters.value : [])
const filteredChapters = computed(() => {
  const kw = tocFilter.value.trim().toLowerCase()
  if (!kw) return safeChapters.value
  return safeChapters.value.filter(ch => ch.title.toLowerCase().includes(kw))
})
const totalTocPages = computed(() => Math.ceil(filteredChapters.value.length / tocPageSize))
const pagedChapters = computed(() => {
  const start = tocCurrentPage.value * tocPageSize
  return filteredChapters.value.slice(start, start + tocPageSize)
})
const isInShelf = computed(() => bookshelfStore.hasBook(props.book?.bookUrl || ''))
const fullIntro = computed(() => loadedIntro.value || props.book?.intro || '暂无简介')
const fullIntroHtml = computed(() => {
  if (fullIntro.value === '暂无简介') return '<span style="color:var(--text-muted)">暂无简介</span>'
  return fullIntro.value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0).map(l => '　　' + l).join('<br>')
})
const bookInfoCache = new Map<string, { intro: string | null; kind: string | null; lastChapter: string | null; wordCount: string | null }>()

watch(tocFilter, () => { tocCurrentPage.value = 0 })

const formatJsExecutor = async (js: string, context: Record<string, any>) => {
  try {
    const safeContext: Record<string, any> = {}
    for (const [k, v] of Object.entries(context)) {
      if (v === null || v === undefined) { safeContext[k] = v; continue }
      if (typeof v === 'function') continue
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const plain: Record<string, any> = {}
        for (const [pk, pv] of Object.entries(v)) { if (typeof pv !== 'function' && typeof pv !== 'object') plain[pk] = pv }
        safeContext[k] = plain
      } else { safeContext[k] = v }
    }
    const response: any = await invoke('execute_js_rule', { code: js, context: safeContext, timeoutMs: 10000 })
    return response?.success ? (response.result || '') : ''
  } catch { return '' }
}

function getTocCacheKey(): string { return 'toc__' + (props.source?.bookSourceUrl || '') + '__' + (props.book?.tocUrl || props.book?.bookUrl || '') }
async function loadTocFromCache(): Promise<Chapter[] | null> { try { const raw = await invoke('cache_get_toc', { bookUrl: getTocCacheKey() }); if (raw) return JSON.parse(raw as string) } catch {}; return null }
async function saveTocToCache(chs: Chapter[]) { try { await invoke('cache_put_toc', { bookUrl: getTocCacheKey(), dataJson: JSON.stringify(chs) }) } catch {} }

async function loadBookInfo() {
  if (!props.book || !props.source) return
  const cacheKey = props.book.bookUrl
  const cached = bookInfoCache.get(cacheKey)
  if (cached) { loadedIntro.value = cached.intro; loadedKind.value = cached.kind; loadedLastChapter.value = cached.lastChapter; loadedWordCount.value = cached.wordCount; return }
  try {
    const { getString } = await import('../../engine/core/rule-parser/index.js')
    const httpClient = (await import('../../engine/network/client.js')).getGlobalHttpClient()
    const headers = props.source.header ? JSON.parse((props.source.header || '{}').replace(/'/g, '"')) : {}
    const response = await httpClient.request({ url: props.book.bookUrl, method: 'GET', headers, timeout: 30000 })
    const html = response.data
    const rule = props.source.ruleBookInfo
    if (rule) {
      const ctx = { source: props.source, baseUrl: props.source.bookSourceUrl, result: html }
      if (rule.intro) loadedIntro.value = await getString(html, rule.intro, ctx) || null
      if (rule.kind) { const kindVal = await getString(html, rule.kind, ctx) || null; loadedKind.value = kindVal; if (kindVal) await bookshelfStore.updateBookKind(props.book.bookUrl, kindVal) }
      if (rule.lastChapter) loadedLastChapter.value = await getString(html, rule.lastChapter, ctx) || null
      if ((rule as any).wordCount) loadedWordCount.value = await getString(html, (rule as any).wordCount, ctx) || null
    }
    bookInfoCache.set(cacheKey, { intro: loadedIntro.value, kind: loadedKind.value, lastChapter: loadedLastChapter.value, wordCount: loadedWordCount.value })
  } catch {}
}

async function loadReadingProgress() {
  if (!props.book) return
  try {
    const progress = await readingStore.loadProgress(props.book.bookUrl, props.book.name, props.book.author)
    if (progress && progress.chapterId !== undefined) {
      hasReadingProgress.value = true
      lastChapterId.value = progress.chapterId
    }
  } catch {}
}

function scrollToChapter() {
  if (!lastChapterId.value || chapters.value.length === 0) return
  const idx = chapters.value.findIndex(ch => ch.id === lastChapterId.value)
  if (idx === -1) return
  const pageIndex = Math.floor(idx / tocPageSize)
  tocCurrentPage.value = pageIndex
  currentChapterId.value = lastChapterId.value
  setTimeout(() => {
    const el = tocListRef.value?.querySelector('.toc-item.active')
    if (el) el.scrollIntoView({ block: 'center' })
  }, 100)
}

async function loadToc() {
  if (!props.book || loadingToc.value) return
  if (loadedKind.value === null && props.book.bookUrl && !bookInfoCache.has(props.book.bookUrl)) await loadBookInfo()
  const kind = loadedKind.value || bookshelfStore.getBookKind(props.book.bookUrl) || ''
  const bookForToc = { ...props.book, kind }
  if (props.book.bookUrl?.startsWith('local://')) {
    try { const bookId = props.book.bookUrl.replace('local://', ''); const data: any = await readerApi.getLocalBookChapters(bookId); chapters.value = Array.isArray(data) ? data : [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0 }] }
    catch { chapters.value = [{ id: 0, title: '正文', url: props.book.bookUrl || '', index: 0 }] }
    scrollToChapter()
    return
  }
  const cached = await loadTocFromCache()
  if (cached && cached.length > 0 && (cached[0] as any)?._deferredJs === undefined) {
    chapters.value = cached
    scrollToChapter()
    return
  }
  loadingToc.value = true
  try {
    const allSources: any[] = (await store.get('bookSource')) || []
    const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
    if (!source) { chapters.value = []; return }
    let tocUrl = props.book.tocUrl || props.book.bookUrl || ''
    if (!props.book.tocUrl && source.ruleBookInfo?.tocUrl) {
      try {
        const { getBookInfo } = await import('../../engine/business/book-info.js')
        const bookInfo = await getBookInfo(source, props.book.bookUrl, { book: bookForToc })
        if (bookInfo?.tocUrl) tocUrl = bookInfo.tocUrl
      } catch(e) {}
    }
    const { getToc } = await import('../../engine/business/toc.js')
    const result = await getToc(source, tocUrl, { book: bookForToc, bookKind: kind, formatJsExecutor }) || []
    chapters.value = result
    if (result.length > 0) await saveTocToCache(result)
    scrollToChapter()
  } catch (err: any) { console.error('[加载目录]', err); message.error('加载目录失败: ' + (err.message || String(err))); chapters.value = [] }
  finally { loadingToc.value = false }
}

function handleChapterClick(ch: Chapter) {
  if (!props.book) return
  currentChapterId.value = ch.id
  bookshelfStore.closeDetail()
  bookshelfStore.openReader({ ...props.book, _forceChapterIndex: chapters.value.findIndex(c => c.id === ch.id) }, props.source, chapters.value)
}
async function handleRead() {
  if (!props.book) return
  bookshelfStore.closeDetail()
  if (hasReadingProgress.value && lastChapterId.value !== null && chapters.value.length > 0) {
    const idx = chapters.value.findIndex(c => c.id === lastChapterId.value)
    if (idx !== -1) {
      bookshelfStore.openReader({ ...props.book, _forceChapterIndex: idx }, props.source, chapters.value)
      return
    }
  }
  bookshelfStore.openReader(props.book, props.source, chapters.value)
}
async function handleAddToShelf() { if (isInShelf.value) { message.info('已在书架中'); return }; const bookToSave = { ...props.book!, kind: loadedKind.value || props.book?.kind }; if (await bookshelfStore.addBook({ ...bookToSave, origin: props.source?.bookSourceUrl || '', originName: props.source?.bookSourceName || props.source?.name || '' })) message.success(`已添加《${props.book!.name}》`) }
async function handleRemoveFromShelf() { dialog.warning({ title: '确认移出', content: `确定将《${props.book!.name}》移出书架？`, positiveText: '移出', negativeText: '取消', onPositiveClick: async () => { await bookshelfStore.removeBookByUrl(props.book!.bookUrl); message.success('已移出'); handleClose() } }) }
async function openChangeSource() { allSourceList.value = (await store.get('bookSource')) || []; changeSourceResults.value = []; showChangeSource.value = true }
function lockBodyScroll() { document.body.style.overflow = 'hidden' }
function unlockBodyScroll() { document.body.style.overflow = '' }

const CS_CONCURRENCY = 5
async function searchForChange() {
  changingSource.value = true; changeSourceResults.value = []; searchDone.value = 0
  try {
    const { search: engineSearch } = await import('../../engine/business/search.js')
    const queue = allSourceList.value.filter(s => s.enabled && s.bookSourceType === 0)
    searchTotal.value = queue.length
    const workers: Promise<void>[] = []
    async function worker() { while (queue.length > 0) { const source = queue.shift(); if (!source) break; try { const results = await engineSearch(source, props.book!.name, { page: 1 }); searchDone.value++; if (Array.isArray(results) && results.length > 0) { const matched = results.filter((b: any) => b.name === props.book!.name).map((b: any) => ({ ...b, _sourceName: source.bookSourceName || source.name, _sourceUrl: source.bookSourceUrl })); if (matched.length > 0) changeSourceResults.value = [...changeSourceResults.value, ...matched] } } catch (e) { searchDone.value++ } } }
    for (let i = 0; i < Math.min(CS_CONCURRENCY, searchTotal.value); i++) workers.push(worker())
    await Promise.all(workers)
  } catch { changeSourceResults.value = [] }
  finally { changingSource.value = false }
}

async function confirmChangeSource(item: any) {
  const source = allSourceList.value.find(s => s.bookSourceName === item._sourceName)
  const newValues = { bookUrl: item.bookUrl, tocUrl: item.tocUrl || item.bookUrl, coverUrl: item.coverUrl, intro: item.intro, kind: item.kind, lastChapter: item.lastChapter, wordCount: item.wordCount, origin: item._sourceUrl || source?.bookSourceUrl || '', originName: item._sourceName || '' }
  await bookshelfStore.updateBook(props.book!.bookUrl, newValues)
  showChangeSource.value = false; unlockBodyScroll(); changeSourceResults.value = []
  loadedIntro.value = newValues.intro || null; loadedKind.value = newValues.kind || null; loadedLastChapter.value = newValues.lastChapter || null
  chapters.value = []; currentChapterId.value = null; tocCurrentPage.value = 0; tocFilter.value = ''
  message.success('书源已切换，正在重新加载目录...'); await loadToc()
}

async function loadLoginUi() { if (!props.source) return; try { const response: any = await invoke('source_login_ui', { source: JSON.parse(JSON.stringify(props.source)) }); if (response?.success && response.result) { loginUiItems.value = JSON.parse(response.result); showLoginUi.value = true } } catch (e) { console.error('加载登录UI失败', e) } }
async function handleLoginAction(item: any) { if (!props.source || !item.action) return; try { await invoke('source_login_action', { source: JSON.parse(JSON.stringify(props.source)), action: item.action }); message.success('操作完成') } catch (e: any) { message.error(e?.message || String(e)) } }

function isValidUrl(str: string): boolean { try { const url = new URL(str); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false } }

async function handleLogin() {
  if (!props.source) return
  const src = props.source as any
  if (src.loginUi) { await loadLoginUi() }
  else if (src.loginUrl) {
    try {
      message.info('正在打开登录窗口...')
      let loginUrl = src.bookSourceUrl || src.loginUrl || ''
      if (!isValidUrl(loginUrl)) { message.warning('书源登录 URL 无效'); return }
      const result = await loginWebview(loginUrl, src.bookSourceName || '登录', 300)
      if (typeof result === 'string' && result.includes('cookies')) { message.success('登录成功'); isLoggedIn.value = true; chapters.value = []; await loadToc() }
      else { message.success('登录窗口已关闭'); isLoggedIn.value = true; chapters.value = []; await loadToc() }
    } catch (err: any) { message.error('登录失败: ' + (err?.message || String(err))) }
  }
}

function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
function handleClose() { emit('close') }
function handleImageError(e: Event) { (e.target as HTMLImageElement).style.display = 'none' }

onMounted(() => { loadBookInfo(); loadReadingProgress(); loadToc(); document.addEventListener('keydown', handleEscape) })
onUnmounted(() => { document.removeEventListener('keydown', handleEscape); unlockBodyScroll() })
watch(() => props.book, () => { tocCurrentPage.value = 0; tocFilter.value = ''; loadBookInfo(); loadReadingProgress(); loadToc() })
</script>

<style scoped>
.detail-enter-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.detail-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.detail-enter-from { opacity: 0; transform: scale(0.96); }
.detail-leave-to { opacity: 0; transform: scale(0.98); }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.55); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; overscroll-behavior: contain; }
.detail-container { width: 100%; max-width: 840px; height: 90vh; max-height: 800px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-xl); }
.detail-header { display: flex; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--border-color); gap: 14px; }
.detail-title { font-size: 17px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.btn-back { background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px; transition: background 0.2s, color 0.2s; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color); }
.detail-body { display: flex; gap: 28px; padding: 22px 26px; border-bottom: 1px solid var(--border-color); overflow: hidden; align-items: flex-start; }
.detail-cover { width: 130px; min-width: 130px; height: 180px; border-radius: var(--radius-md); overflow: hidden; position: relative; }
.detail-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { width: 100%; height: 100%; background: url('/images/cover.jpg') center/cover; position: relative; }
.cover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 14px; }
.cover-title-text { font-size: 14px; font-weight: 600; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
.cover-author-text { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 4px; }
.cover-source-badge { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: rgba(255,255,255,0.7); font-size: 9px; padding: 3px 6px; display: flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cover-source-badge svg { flex-shrink: 0; }
.detail-info { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; align-self: stretch; }
.book-title { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; flex-shrink: 0; line-height: 1.3; }
.book-author { font-size: 14px; color: var(--text-secondary); margin: 0; flex-shrink: 0; }
.book-meta-row { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: nowrap; align-items: center; }
.meta-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.meta-chip svg { flex-shrink: 0; }
.meta-kind { background: rgba(212,160,23,0.12); color: var(--brand); border: 1px solid rgba(212,160,23,0.25); flex-shrink: 0; }
.meta-word-count { background: rgba(128,128,128,0.1); color: var(--text-muted); border: 1px solid var(--border-color); flex-shrink: 0; }
.meta-last-chapter { background: rgba(92,138,122,0.12); color: #5c8a7a; border: 1px solid rgba(92,138,122,0.25); flex: 1; min-width: 0; overflow: hidden; }
.meta-chip-scroll { white-space: nowrap; overflow-x: auto; display: block; }
.meta-chip-scroll::-webkit-scrollbar { height: 2px; }
.meta-chip-scroll::-webkit-scrollbar-thumb { background: rgba(92,138,122,0.3); border-radius: 1px; }
.book-intro-scroll { font-size: 13px; color: var(--text-muted); line-height: 1.8; height: 96px; overflow-y: auto; padding-right: 8px; flex-shrink: 0; overscroll-behavior: contain; }
.book-intro-scroll::-webkit-scrollbar { width: 4px; }
.book-intro-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }
.detail-toc { flex: 1; display: flex; flex-direction: column; padding: 0 22px 4px; min-height: 0; overflow: hidden; overscroll-behavior: contain; }
.toc-header { display: flex; align-items: center; padding: 12px 0 8px; border-bottom: 1px solid var(--border-color); gap: 10px; }
.toc-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; flex-shrink: 0; }
.toc-count { font-size: 13px; color: var(--text-muted); flex-shrink: 0; }
.toc-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.toc-search-icon { flex-shrink: 0; color: var(--text-muted); }
.toc-search-input { flex: 1; min-width: 80px; padding: 4px 8px; font-size: 12px; color: var(--text-primary); background: transparent; border: none; border-bottom: 1px solid var(--border-color); outline: none; border-radius: 0; }
.toc-search-input:focus { border-bottom-color: var(--brand); }
.toc-search-input::placeholder { color: var(--text-muted); font-size: 11px; }
.toc-pagination-inline { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.btn-page { width: 26px; height: 26px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; padding: 0; transition: border-color 0.18s, color 0.18s; }
.btn-page:hover:not(:disabled) { border-color: var(--brand); color: var(--text-primary); }
.btn-page:disabled { opacity: 0.3; cursor: not-allowed; }
.page-num { font-size: 10px; color: var(--text-muted); min-width: 36px; text-align: center; }
.toc-list { flex: 1; overflow-y: auto; padding: 6px 0; display: flex; flex-direction: column; gap: 2px; overscroll-behavior: contain; }
.toc-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer; transition: background 0.18s; min-height: 42px; }
.toc-item:hover { background: var(--bg-hover); }
.toc-item.active { background: var(--bg-active); }
.toc-item.active .toc-title { color: var(--brand); }
.toc-title { font-size: 14px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail-footer { display: flex; align-items: center; gap: 14px; padding: 16px 26px; border-top: 1px solid var(--border-color); }
.cs-wrapper { display: flex; flex-direction: column; gap: 12px; height: 60vh; max-height: 520px; overflow: hidden; }
.change-source-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 4px 0; overscroll-behavior: contain; }
.change-source-item { display:flex; flex-direction:column; padding:10px 14px; cursor:pointer; border-radius:var(--radius-sm); transition:background 0.15s }
.change-source-item:hover { background:var(--bg-hover) }
.cs-item-main { display:flex; gap:8px; align-items:baseline }
.cs-item-name { font-size:14px; font-weight:500; color:var(--text-primary) }
.cs-item-author { font-size:12px; color:var(--text-muted) }
.cs-item-meta { display:flex; gap:12px; margin-top:3px; font-size:11px; color:var(--text-muted) }
.cs-item-source { color:var(--brand) }
.login-ui-panel { margin: 0 26px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; }
.login-ui-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 13px; color: var(--text-primary); }
.login-ui-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
.login-ui-row { display: flex; align-items: center; gap: 8px; }
</style>
