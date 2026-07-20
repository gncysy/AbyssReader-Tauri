<template>
  <div v-if="book" class="reader-fullscreen">
    <header class="reader-header">
      <button class="btn-back" @click="handleClose" aria-label="返回书架">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
      <div class="header-spacer"></div>
    </header>

    <div ref="contentRef" class="reader-content" @scroll="handleScroll">
      <div class="content-inner" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }" v-html="sanitizedContent"></div>
    </div>

    <footer class="reader-footer">
      <span class="footer-left">{{ Math.round(scrollPercent * 100) }}%</span>
      <div class="footer-center">
        <button class="btn-chapter" :disabled="chapterIndex <= 0" @click="prevChapter">上一章</button>
        <span class="chapter-info">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
        <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter">下一章</button>
        <button v-for="t in themes" :key="t.value" class="btn-theme" :class="{ active: currentTheme === t.value }" @click="setTheme(t.value)">{{ t.label }}</button>
        <button class="btn-size" @click="decreaseFontSize">A−</button>
        <span class="size-value">{{ fontSize }}</span>
        <button class="btn-size" @click="increaseFontSize">A+</button>
      </div>
      <span class="footer-right"></span>
    </footer>

    <div v-if="loadingContent" class="reader-loading"><div class="loading-spinner"></div></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { store, engine, reader as readerApi } from '@/api'
import { useReadingStore } from '@/store'
import { READER_THEMES } from '@shared/constants'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{ book: Book | null; source?: BookSource | null; initialChapters?: Chapter[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const readingStore = useReadingStore()

const fontSize = computed({ get: () => readingStore.fontSize, set: (val: number) => readingStore.setFontSize(val) })
const lineHeight = computed({ get: () => readingStore.lineHeight, set: (val: number) => readingStore.setLineHeight(val) })
const currentTheme = computed({ get: () => readingStore.theme, set: (val: string) => readingStore.setTheme(val) })

const chapters = ref<Chapter[]>([])
const chapterIndex = ref(0)
const content = ref('')
const loadingContent = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const themes = READER_THEMES
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

const sanitizedContent = computed(() => {
  if (!content.value) return ''
  return DOMPurify.sanitize(content.value, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','img','a','blockquote','pre','code','ul','ol','li'],
    ALLOWED_ATTR: ['href','src','alt','title'],
  })
})

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function setTheme(value: string) { readingStore.setTheme(value) }

async function loadChapters() {
  if (props.initialChapters && props.initialChapters.length > 0) {
    chapters.value = props.initialChapters
    // 如果从目录点击进来的，强制使用指定章节
    if ((props.book as any)?._forceChapterIndex !== undefined) {
      chapterIndex.value = (props.book as any)._forceChapterIndex
      await loadContent()
      return
    }
    const progress = await readingStore.loadProgress(String(props.book?.bookUrl || ''), props.book?.name || '', props.book?.author || '')
    if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id) === Number(progress.chapterId)); if (idx !== -1) chapterIndex.value = idx }
    await loadContent()
    return
  }
  if (!props.book) return
  try {
    if (props.book.bookUrl?.startsWith('local://')) {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data: any = await readerApi.getLocalBookChapters(bookId)
      chapters.value = data?.length ? data : [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0 }]
      const progress = await readingStore.loadProgress(String(props.book.bookUrl), props.book.name || '', props.book.author || '')
      if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id) === Number(progress.chapterId)); if (idx !== -1) chapterIndex.value = idx }
      await loadContent(); return
    }
    const allSources = (await store.get('bookSource')) || []
    const source = props.source || (Array.isArray(allSources) ? allSources.find((s: any) => s.bookSourceName === props.book?.originName) : null)
    if (!source) { message.warning('书源未找到'); return }
    const result: any = await engine.getToc(source, props.book.tocUrl || props.book.bookUrl, { kind: props.book.kind })
    chapters.value = result?.success ? result.data : (Array.isArray(result) ? result : [])
    const progress = await readingStore.loadProgress(String(props.book.bookUrl), props.book.name || '', props.book.author || '')
    if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id) === Number(progress.chapterId)); if (idx !== -1) chapterIndex.value = idx }
    await loadContent()
  } catch (err: any) { message.error('加载目录失败: ' + err.message) }
}

async function loadContent() {
  if (!currentChapter.value) return
  loadingContent.value = true
  try {
    if (props.book?.bookUrl?.startsWith('local://')) {
      const bookId = props.book.bookUrl.replace('local://', '')
      content.value = (await readerApi.getLocalChapterContent(bookId, (currentChapter.value?.id ?? 0) as unknown as string) || ''
      await nextTick(); if (contentRef.value) contentRef.value.scrollTop = 0; return
    }
    const allSources = (await store.get('bookSource')) || []
    const source = props.source || (Array.isArray(allSources) ? allSources.find((s: any) => s.bookSourceName === props.book?.originName) : null)
    if (!source) { content.value = '<p>书源未找到</p>'; return }
    const result: any = await engine.getContent(source, currentChapter.value.url, props.book?.kind)
    content.value = result?.success ? (result.data || '<p>内容为空</p>') : (typeof result === 'string' ? result : '<p>加载失败</p>')
    await nextTick(); if (contentRef.value) contentRef.value.scrollTop = 0
    await saveProgress()
  } catch { content.value = '<p>加载失败</p>' }
  finally { loadingContent.value = false }
}

function handleScroll() {
  if (!contentRef.value) return
  const max = contentRef.value.scrollHeight - contentRef.value.clientHeight
  if (max <= 0) return
  scrollPercent.value = Math.min(1, Math.max(0, contentRef.value.scrollTop / max))
}

async function saveProgress() {
  if (!props.book || !currentChapter.value) return
  await readingStore.saveProgress(
    String(props.book.bookUrl), props.book.name || '', props.book.author || '',
    currentChapter.value.id, Math.round(scrollPercent.value * 10000), currentChapter.value.title || ''
  )
}

async function prevChapter() { if (chapterIndex.value > 0) { await saveProgress(); chapterIndex.value--; await loadContent() } }
async function nextChapter() { if (chapterIndex.value < chapters.value.length - 1) { await saveProgress(); chapterIndex.value++; await loadContent() } }

function handleClose() { saveProgress(); emit('close') }

function handleKeydown(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevChapter() }
  if (e.key === 'ArrowRight') { e.preventDefault(); nextChapter() }
  if (e.key === 'Escape') { e.preventDefault(); handleClose() }
}

onMounted(() => { readingStore.loadSettings(); loadChapters(); window.addEventListener('keydown', handleKeydown) })
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); saveProgress() })
</script>

<style scoped>
.reader-fullscreen { position: fixed; inset: 0; z-index: 1000; background: var(--bg); display: flex; flex-direction: column; height: 100vh; }
.reader-header { display: flex; align-items: center; padding: 8px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); min-height: 48px; }
.reader-title { font-size: 14px; font-weight: 500; color: var(--text-secondary); text-align: center; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; margin: 0; }
.header-spacer { width: 140px; flex-shrink: 0; }
.btn-back { color: var(--text-muted); background: transparent; border: 1px solid transparent; cursor: pointer; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); transition: color 0.2s, background 0.2s; flex-shrink: 0; }
.btn-back:hover { color: var(--brand); background: var(--bg-hover); }
.reader-content { flex: 1; overflow-y: auto; padding: 28px 36px; }
.content-inner { max-width: 720px; margin: 0 auto; font-family: var(--font-reading); color: var(--text-primary); }
.reader-footer { display: flex; align-items: center; justify-content: space-between; padding: 10px 24px; background: var(--bg-card); border-top: 1px solid var(--border-color); min-height: 48px; }
.footer-left { font-size: 12px; color: var(--text-muted); min-width: 48px; }
.footer-right { min-width: 48px; }
.footer-center { display: flex; align-items: center; gap: 8px; }
.chapter-info { font-size: 12px; color: var(--text-muted); min-width: 60px; text-align: center; }
.btn-chapter { padding: 5px 12px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-height: 30px; min-width: 56px; transition: color 0.18s, border-color 0.18s; }
.btn-chapter:hover:not(:disabled) { color: var(--text-primary); border-color: var(--brand); }
.btn-chapter:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-theme { padding: 5px 12px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-height: 30px; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.btn-theme.active { color: var(--brand); border-color: var(--brand); }
.btn-size { padding: 5px 10px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-width: 34px; min-height: 30px; display: flex; align-items: center; justify-content: center; transition: border-color 0.18s, color 0.18s; }
.btn-size:hover { border-color: var(--brand); color: var(--text-primary); }
.size-value { font-size: 13px; color: var(--text-secondary); min-width: 24px; text-align: center; }
.reader-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 20; }
</style>
