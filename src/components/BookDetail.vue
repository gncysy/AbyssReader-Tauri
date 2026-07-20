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
            <div v-else class="cover-placeholder">
              <div class="cover-overlay"><div class="cover-title-text">{{ book.name }}</div><div class="cover-author-text">{{ book.author }}</div></div>
            </div>
          </div>
          <div class="detail-info">
            <h1 class="book-title">{{ book.name }}</h1>
            <p class="book-author">{{ book.author || '未知作者' }}</p>
            <p class="book-intro">{{ book.intro || '暂无简介' }}</p>
          </div>
        </div>

        <div class="detail-toc">
          <div class="toc-header">
            <h3>目录</h3>
            <span class="toc-count">{{ safeChapters.length }} 章</span>
          </div>
          <div class="toc-list" v-if="!loadingToc">
            <div
              v-for="ch in safeChapters.slice(0, 100)"
              :key="ch.id"
              class="toc-item"
              :class="{ active: ch.id === currentChapterId }"
              @click="handleChapterClick(ch)"
            >
              <span class="toc-title">{{ ch.title }}</span>
              <span v-if="ch.isVip" class="badge badge-vip">VIP</span>
            </div>
            <div v-if="safeChapters.length === 0" class="empty-state" style="padding:40px"><p>暂无目录</p></div>
          </div>
          <div v-else style="display:flex;align-items:center;justify-content:center;gap:12px;padding:40px">
            <div class="loading-spinner"></div><span style="color:var(--text-muted)">加载目录中...</span>
          </div>
        </div>

        <footer class="detail-footer">
          <button class="btn-danger" @click="handleRemoveFromShelf">移出</button>
          <div style="flex:1"></div>
          <button class="btn-secondary" @click="handleAddToShelf" :disabled="isInShelf">{{ isInShelf ? '已在书架' : '加书架' }}</button>
          <button class="btn-primary" @click="handleRead">开始阅读</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useBookshelfStore, useReadingStore } from '@/store'
import { engine, reader as readerApi, store } from '@/api'
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

const safeChapters = computed(() => Array.isArray(chapters.value) ? chapters.value : [])
const isInShelf = computed(() => bookshelfStore.hasBook(props.book?.bookUrl || ''))

async function loadToc() {
  if (!props.book || loadingToc.value) return
  if (props.book.bookUrl?.startsWith('local://')) {
    try {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data: any = await readerApi.getLocalBookChapters(bookId)
      chapters.value = Array.isArray(data) ? data : [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0 }]
    } catch { chapters.value = [{ id: 0, title: '正文', url: props.book.bookUrl || '', index: 0 }] }
    return
  }

  loadingToc.value = true
  try {
    const allSources = await store.get('bookSource') || []
    const arr = Array.isArray(allSources) ? allSources : []
    const source = props.source || arr.find((s: any) => s.bookSourceName === props.book?.originName)
    if (!source) { chapters.value = []; return }

    const tocUrl = props.book.tocUrl || props.book.bookUrl
    const result: any = await engine.getToc(source, tocUrl, { kind: props.book?.kind ? String(props.book.kind) : '' })
    chapters.value = Array.isArray(result) ? result : (result?.success ? (result.data || []) : [])
  } catch (err: any) { message.error('加载目录失败: ' + err.message); chapters.value = [] }
  finally { loadingToc.value = false }

  const progress = await readingStore.loadProgress(props.book.bookUrl, props.book.name, props.book.author)
  if (progress) currentChapterId.value = progress.chapterId
}

function handleChapterClick(ch: Chapter) {
  if (!props.book) return
  currentChapterId.value = ch.id
  const chapterIdx = chapters.value.findIndex(c => c.id === ch.id)
  const bookWithChapter = { ...props.book, _forceChapterIndex: chapterIdx >= 0 ? chapterIdx : 0 }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(bookWithChapter, props.source, chapters.value)
}

function handleRead() {
  if (!props.book) return
  let chapterIdx = 0
  if (currentChapterId.value !== null) {
    const found = chapters.value.findIndex(c => c.id === currentChapterId.value)
    if (found !== -1) chapterIdx = found
  }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(props.book, props.source, chapters.value)
}

async function handleAddToShelf() {
  if (isInShelf.value) { message.info('已在书架中'); return }
  if (await bookshelfStore.addBook(props.book!)) message.success(`已添加《${props.book!.name}》`)
}

async function handleRemoveFromShelf() {
  dialog.warning({
    title: '确认移出', content: `确定将《${props.book!.name}》移出书架？`, positiveText: '移出', negativeText: '取消',
    onPositiveClick: async () => { await bookshelfStore.removeBookByUrl(props.book!.bookUrl); message.success('已移出'); handleClose() },
  })
}

function handleClose() { emit('close') }
function handleImageError(e: Event) { (e.target as HTMLImageElement).style.display = 'none' }

onMounted(() => {
  loadToc()
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') handleClose() })
})
onUnmounted(() => { document.removeEventListener('keydown', () => {}) })
watch(() => props.book, () => loadToc())
</script>

<style scoped>
.detail-enter-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.detail-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.detail-enter-from { opacity: 0; transform: scale(0.96); }
.detail-leave-to { opacity: 0; transform: scale(0.98); }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.55); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.detail-container { width: 100%; max-width: 840px; height: 90vh; max-height: 800px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-xl); }
.detail-header { display: flex; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--border-color); gap: 14px; }
.detail-title { font-size: 17px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.btn-back { background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px; transition: background 0.2s, color 0.2s; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color); }
.detail-body { display: flex; gap: 28px; padding: 22px 26px; border-bottom: 1px solid var(--border-color); }
.detail-cover { width: 130px; min-width: 130px; height: 180px; border-radius: var(--radius-md); overflow: hidden; }
.detail-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { width: 100%; height: 100%; background: url('/images/cover.jpg') center/cover; position: relative; }
.cover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 14px; }
.cover-title-text { font-size: 14px; font-weight: 600; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
.cover-author-text { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 4px; }
.detail-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.book-title { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.book-author { font-size: 14px; color: var(--text-secondary); margin: 0; }
.book-intro { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.detail-toc { flex: 1; display: flex; flex-direction: column; padding: 0 22px 4px; min-height: 0; overflow: hidden; }
.toc-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 8px; border-bottom: 1px solid var(--border-color); }
.toc-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
.toc-count { font-size: 13px; color: var(--text-muted); }
.toc-list { flex: 1; overflow-y: auto; padding: 6px 0; display: flex; flex-direction: column; gap: 2px; }
.toc-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer; transition: background 0.18s; min-height: 42px; }
.toc-item:hover { background: var(--bg-hover); }
.toc-item.active { background: var(--bg-active); }
.toc-item.active .toc-title { color: var(--brand); }
.toc-title { font-size: 14px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail-footer { display: flex; align-items: center; gap: 14px; padding: 16px 26px; border-top: 1px solid var(--border-color); }
</style>
