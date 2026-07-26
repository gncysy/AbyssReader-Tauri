<template>
  <div v-if="book" class="reader-fullscreen">
    <Transition name="controls-slide">
      <header v-if="showControls" class="reader-header" @mouseenter="clearHideTimer" @mouseleave="resetHideTimer">
        <button class="btn-back" @click.stop="handleClose" aria-label="返回书架">
          <span class="btn-click-area">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </span>
        </button>
        <div class="reader-title-drag">
          <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
        </div>
        <div class="header-spacer"></div>
      </header>
    </Transition>

    <div ref="contentRef" class="reader-content" @scroll="handleScroll" @click="handleContentClick">
      <div class="content-inner" :class="{ 'content-comic': isComic }" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }" v-html="sanitizedContent"></div>
    </div>

    <Transition name="controls-slide">
      <footer v-if="showControls" class="reader-footer" @mouseenter="clearHideTimer" @mouseleave="resetHideTimer">
        <span class="footer-left">{{ Math.round(scrollPercent * 100) }}%</span>
        <div class="footer-center">
          <button class="btn-chapter" :disabled="chapterIndex <= 0" @click.stop="prevChapter">上一章</button>
          <span class="chapter-info">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
          <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click.stop="nextChapter">下一章</button>
          <button v-for="t in themes" :key="t.value" class="btn-theme" :class="{ active: currentTheme === t.value }" @click.stop="setTheme(t.value)">{{ t.label }}</button>
          <button class="btn-size" @click.stop="decreaseFontSize">A−</button>
          <span class="size-value">{{ fontSize }}</span>
          <button class="btn-size" @click.stop="increaseFontSize">A+</button>
        </div>
        <span class="footer-right"></span>
      </footer>
    </Transition>

    <div v-if="loadingContent" class="reader-loading"><div class="loading-spinner"></div></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { store, reader as readerApi } from '@/api'
import { useReadingStore } from '@/store'
import { READER_THEMES } from '@shared/constants'
import type { Book, BookSource, Chapter } from '@shared/types'
import { invoke } from '@tauri-apps/api/core'

const props = defineProps<{ book: Book | null; source?: BookSource | null; initialChapters?: Chapter[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const readingStore = useReadingStore()

const fontSize = ref(18)
const lineHeight = ref(1.8)
const currentTheme = ref('dark')
const chapters = ref<Chapter[]>([])
const chapterIndex = ref(0)
const content = ref('')
const loadingContent = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const showControls = ref(true)
const isComic = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null
const themes = READER_THEMES
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)
const sanitizedContent = computed(() => {
  if (!content.value) return ''
  let text = content.value
  try {
    const { useReplaceRuleStore } = require('@/store/replace-rules.js')
    const replaceStore = useReplaceRuleStore()
    for (const rule of replaceStore.rules) {
      if (!rule.isEnabled) continue
      try {
        if (rule.isRegex) {
          text = text.replace(new RegExp(rule.pattern, 'g'), rule.replacement)
        } else {
          text = text.split(rule.pattern).join(rule.replacement)
        }
      } catch {}
    }
  } catch {}
  if (isComic.value) {
    text = text.replace(/<img\s/g, '<img style="display:block;width:100%;height:auto;" ')
  } else {
    text = '<p>' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'
  }
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','img','a','blockquote','pre','code','ul','ol','li'], ALLOWED_ATTR: ['href','src','alt','title','style'] })
})

function increaseFontSize() { fontSize.value = Math.min(32, fontSize.value + 1) }
function decreaseFontSize() { fontSize.value = Math.max(12, fontSize.value - 1) }
function setTheme(value: string) { currentTheme.value = value }

function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('a') || target.closest('.reader-header') || target.closest('.reader-footer')) return
  showControls.value = !showControls.value
  if (showControls.value) resetHideTimer()
}

function clearHideTimer() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }
function resetHideTimer() { clearHideTimer(); hideTimer = setTimeout(() => { showControls.value = false }, 3000) }

async function loadChapters() {
  if (!props.book) return
  if (props.initialChapters && props.initialChapters.length > 0) {
    chapters.value = props.initialChapters
    if ((props.book as any)?._forceChapterIndex !== undefined) { chapterIndex.value = (props.book as any)._forceChapterIndex; await loadContent(); return }
    const progress = await readingStore.loadProgress(String(props.book.bookUrl || ''), props.book.name || '', props.book.author || '')
    if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id) === Number(progress.chapterId)); if (idx !== -1) chapterIndex.value = idx }
    await loadContent(); return
  }
  try {
    if (props.book.bookUrl?.startsWith('local://')) {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data: any = await readerApi.getLocalBookChapters(bookId)
      chapters.value = data?.length ? data : [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0 }]
      await loadContent(); return
    }
    const allSources: any[] = (await store.get('bookSource')) || []
    const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
    if (!source) { message.warning('书源未找到'); return }
    const { getToc } = await import('../../engine/business/toc.js')
    const result = await getToc(source, props.book.tocUrl || props.book.bookUrl, { book: props.book })
    chapters.value = Array.isArray(result) ? result : []
    await loadContent()
  } catch (err: any) { message.error('加载目录失败: ' + err.message) }
}

async function resolveChapterUrl(ch: any, source: any): Promise<string> {
  if (ch.url && !ch._deferredJs) return ch.url
  if (!ch._deferredJs) return ch.url || ''
  try {
    const { executeJs } = await import('../../engine/core/rule-parser/js.js')
    const result = await executeJs(ch._deferredResult, ch._deferredJs, {
      source,
      baseUrl: source.bookSourceUrl || '',
      book: props.book || {},
      result: ch._deferredResult,
    })
    return typeof result === 'string' ? result : ''
  } catch { return ch.url || '' }
}

async function loadContent() {
  if (!currentChapter.value) return
  loadingContent.value = true
  try {
    if (props.book?.bookUrl?.startsWith('local://')) {
      content.value = String(await readerApi.getLocalChapterContent(props.book.bookUrl.replace('local://', ''), currentChapter.value.id) || '')
      isComic.value = false
    } else {
      const allSources: any[] = (await store.get('bookSource')) || []
      const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
      if (!source) { content.value = '<p>书源未找到</p>'; return }
      isComic.value = source.bookSourceType === 2
      const { getContent } = await import('../../engine/business/content.js')
      const resolvedUrl = await resolveChapterUrl(currentChapter.value, source)
      const rawContent = await getContent(source, resolvedUrl, { bookKind: props.book?.kind, book: props.book })
      if (isComic.value && rawContent.includes('<img')) {
        const sourceJson = JSON.stringify(source)
        const imgRegex = /<img\s+src=["']([^"']+)["']/gi
        const matches = [...rawContent.matchAll(imgRegex)]
        const urls = [...new Set(matches.map(m => m[1]))]
        const proxyMap = new Map<string, string>()
        await Promise.all(urls.map(async (url) => {
          try { const dataUri: string = await invoke('proxy_image', { url, sourceJson }); proxyMap.set(url, dataUri) } catch { proxyMap.set(url, url) }
        }))
        content.value = rawContent.replace(imgRegex, (match, url) => { const proxy = proxyMap.get(url); return proxy ? match.replace(url, proxy) : match })
      } else {
        content.value = rawContent
      }
    }
    await nextTick(); if (contentRef.value) contentRef.value.scrollTop = 0
    resetHideTimer()
    await saveProgress()
  } catch (err: any) { content.value = '<p>加载失败: ' + (err?.message || String(err)) + '</p>' }
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
  await readingStore.saveProgress(String(props.book.bookUrl), props.book.name || '', props.book.author || '', currentChapter.value.id, Math.round(scrollPercent.value * 10000), currentChapter.value.title || '')
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
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); saveProgress(); if (hideTimer) clearTimeout(hideTimer) })
</script>

<style scoped>
.reader-fullscreen { position: fixed; inset: 0; z-index: 1000; background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.reader-header { display: flex; align-items: center; justify-content: center; padding: 6px 12px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); height: 48px; flex-shrink: 0; position: absolute; top: 0; left: 0; right: 0; z-index: 10; -webkit-app-region: drag; }
.reader-title { font-size: 14px; font-weight: 500; color: var(--text-secondary); text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; pointer-events: none; }
.header-spacer { width: 46px; flex-shrink: 0; pointer-events: none; }

.reader-title-drag {
  flex: 1; height: 100%; display: flex; align-items: center; justify-content: center;
}

.btn-back {
  background: transparent; border: 1px solid transparent;
  color: var(--text-secondary); cursor: pointer;
  padding: 0; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  min-width: 38px; min-height: 38px;
  transition: border-color 0.2s;
  flex-shrink: 0;
  position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
  pointer-events: none;
  -webkit-app-region: no-drag;
}
.btn-back:hover { border-color: var(--border-color); }
.btn-click-area {
  pointer-events: auto;
  -webkit-app-region: no-drag;
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  padding: 8px; border-radius: var(--radius-sm);
  transition: background 0.2s;
}
.btn-click-area:hover { background: var(--bg-hover); }
.btn-click-area svg { display: block; pointer-events: none; }

.reader-content { flex: 1; overflow-y: auto; overflow-x: hidden; }
.content-inner { max-width: 720px; margin: 0 auto; padding: 28px 36px; }
.content-inner.content-comic { max-width: 100%; padding: 0; }

.reader-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; background: var(--bg-card); border-top: 1px solid var(--border-color); min-height: 44px; flex-shrink: 0; position: absolute; bottom: 0; left: 0; right: 0; z-index: 10; -webkit-app-region: no-drag; }
.footer-left { font-size: 12px; color: var(--text-muted); min-width: 40px; }
.footer-right { min-width: 40px; }
.footer-center { display: flex; align-items: center; gap: 6px; }
.chapter-info { font-size: 11px; color: var(--text-muted); min-width: 50px; text-align: center; }
.btn-chapter { padding: 4px 10px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-height: 28px; transition: color 0.18s, border-color 0.18s; }
.btn-chapter:hover:not(:disabled) { color: var(--text-primary); border-color: var(--brand); }
.btn-chapter:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-theme { padding: 4px 10px; font-size: 11px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-height: 28px; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.btn-theme.active { color: var(--brand); border-color: var(--brand); }
.btn-size { padding: 4px 8px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-width: 30px; min-height: 28px; display: flex; align-items: center; justify-content: center; transition: border-color 0.18s, color 0.18s; }
.btn-size:hover { border-color: var(--brand); color: var(--text-primary); }
.size-value { font-size: 12px; color: var(--text-secondary); min-width: 20px; text-align: center; }
.reader-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 20; }

.controls-slide-enter-active, .controls-slide-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.controls-slide-enter-from, .controls-slide-leave-to { opacity: 0; }
.reader-header.controls-slide-enter-from, .reader-header.controls-slide-leave-to { transform: translateY(-100%); }
.reader-footer.controls-slide-enter-from, .reader-footer.controls-slide-leave-to { transform: translateY(100%); }
</style>

