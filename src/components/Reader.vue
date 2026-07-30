<template>
  <div v-if="book" class="reader-fullscreen">
    <Transition name="controls-slide">
      <header v-if="showControls" class="reader-header" @mouseenter="clearHideTimer" @mouseleave="resetHideTimer">
        <button class="btn-back" @click.stop="handleClose" aria-label="返回书架">
          <span class="btn-click-area">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </span>
        </button>
        <div class="reader-title-drag"><h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2></div>
        <div class="header-spacer"></div>
      </header>
    </Transition>

    <div ref="contentRef" class="reader-content" @scroll="handleScroll" @click="handleContentClick" @mouseup="handleTextSelect">
      <div v-if="isComic" class="content-comic">
        <div v-for="(img, i) in comicImages" :key="i" class="comic-page">
          <div v-if="img.status === 'loading'" class="comic-placeholder"><div class="loading-spinner"></div><span>第 {{ i + 1 }} 页加载中...</span></div>
          <div v-else-if="img.status === 'error'" class="comic-placeholder comic-error" @click="retryComicImage(i)"><span>第 {{ i + 1 }} 页加载失败</span><span>点击重试</span></div>
          <img v-else :src="img.data" :alt="'第' + (i + 1) + '页'" style="display:block;width:100%;height:auto" />
        </div>
      </div>
      <div v-else class="content-inner" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }" v-html="sanitizedContent"></div>
    </div>

    <div v-if="selectMenu.visible" class="select-menu" :style="{ left: selectMenu.x + 'px', top: selectMenu.y + 'px' }">
      <div class="select-menu-item" @click="openDictPanel">字典</div>
      <div class="select-menu-item" @click="copySelection">复制</div>
    </div>

    <n-modal v-model:show="dictVisible" preset="card" title="字典" style="max-width:700px;max-height:85vh" :bordered="false">
      <div class="dict-tabs" v-if="dictRules.length > 1">
        <button v-for="(r, i) in dictRules" :key="i" class="dict-tab" :class="{ active: dictActiveTab === i }" @click="switchDictTab(i)">{{ r.name }}</button>
      </div>
      <div v-if="dictLoading" style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>
      <div v-else class="dict-content" v-html="dictActiveContent"></div>
    </n-modal>

    <Transition name="controls-slide">
      <footer v-if="showControls" class="reader-footer" @mouseenter="clearHideTimer" @mouseleave="resetHideTimer">
        <span class="footer-left">{{ Math.round(scrollPercent * 100) }}%</span>
        <div class="footer-center">
          <button class="btn-chapter" :disabled="chapterIndex <= 0" @click.stop="prevChapter">上一章</button>
          <span class="chapter-info">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
          <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click.stop="nextChapter">下一章</button>
          <button v-for="t in themes" :key="t.value" class="btn-theme" :class="{ active: currentTheme === t.value }" @click.stop="setTheme(t.value)">{{ t.label }}</button>
          <button class="btn-size" @click.stop="decreaseFontSize">A-</button>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage, NModal } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { store, reader as readerApi } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import { useReadingStore } from '@/store'
import { useReplaceRuleStore } from '@/store/replace-rules'
import { READER_THEMES } from '@shared/constants'
import { reSegment } from '../../engine/business/content-help.js'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{ book: Book | null; source?: BookSource | null; initialChapters?: Chapter[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const readingStore = useReadingStore()
const replaceRuleStore = useReplaceRuleStore()

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

const MAX_RETRIES = 3
interface ComicImage { url: string; data: string; status: 'loading' | 'loaded' | 'error'; retries: number }
const comicImages = ref<ComicImage[]>([])
const PRELOAD_COUNT = 5
const preloadedContents = new Map<number, string>()
let preloadQueue: number[] = []

const selectMenu = ref({ visible: false, x: 0, y: 0, text: '' })
const dictVisible = ref(false)
const dictRules = ref<{ name: string; urlRule: string; showRule: string }[]>([])
const dictActiveTab = ref(0)
const dictLoading = ref(false)
const dictContents = ref<Record<number, string>>({})
const dictActiveContent = computed(() => dictContents.value[dictActiveTab.value] || '<p>点击标签查询</p>')

async function chineseConvert(text: string): Promise<string> {
  const converterType = readingStore.chineseConverterType
  if (converterType === 0 || !text) return text
  try {
    const fnName = converterType === 1 ? 'java.t2s' : 'java.s2t'
    const response: any = await invoke('execute_js_rule', {
      code: fnName + '(result)',
      context: { result: text, baseUrl: '', book: {}, source: {} },
      timeoutMs: 10000
    })
    if (response.success && response.result) return response.result
    return text
  } catch { return text }
}

const formatJsExecutor = async (js: string, context: Record<string, any>) => {
  try {
    const safeContext: Record<string, any> = {}
    for (const [k, v] of Object.entries(context)) {
      if (v === null || v === undefined) { safeContext[k] = v; continue }
      if (typeof v === 'function') continue
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const plain: Record<string, any> = {}
        for (const [pk, pv] of Object.entries(v)) {
          if (typeof pv !== 'function' && typeof pv !== 'object') plain[pk] = pv
        }
        safeContext[k] = plain
      } else { safeContext[k] = v }
    }
    const response: any = await invoke('execute_js_rule', {
      code: js,
      context: safeContext,
      timeoutMs: 10000
    })
    return response?.success ? (response.result || '') : ''
  } catch { return '' }
}

function removeSameTitle(text: string, chapterTitle: string, bookName: string): string {
  if (!chapterTitle || !text) return text
  try {
    const escapedTitle = chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\\\s*')
    const escapedName = bookName ? bookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
    let prefixPattern: RegExp
    if (escapedName) {
      prefixPattern = new RegExp('^(\\s|[\\p{P}])*(' + escapedName + ')*(\\s)*' + escapedTitle + '(\\s)*', 'u')
    } else {
      prefixPattern = new RegExp('^(\\s|[\\p{P}])*' + escapedTitle + '(\\s)*', 'u')
    }
    const match = text.match(prefixPattern)
    if (match && match[0]) return text.substring(match[0].length)
  } catch {}
  return text
}

function execJsReplacement(jsCode: string, matched: string): string {
  try {
    const code = jsCode.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '')
    const fn = new Function('result', code)
    const r = fn(matched)
    return (r === null || r === undefined) ? matched : String(r)
  } catch { return matched }
}

function applyReplaceRuleSync(text: string, rule: { pattern: string; replacement: string; isRegex: boolean; timeoutMs: number }): string {
  const start = Date.now()
  const timeout = rule.timeoutMs > 0 ? rule.timeoutMs : 5000
  try {
    const replacement = rule.replacement || ''
    const isJsReplace = replacement.startsWith('@js:') || replacement.startsWith('<js>')
    if (rule.isRegex) {
      const re = new RegExp(rule.pattern, 'g')
      return text.replace(re, (match) => {
        if (Date.now() - start > timeout) throw new Error('timeout')
        return isJsReplace ? execJsReplacement(replacement, match) : replacement
      })
    } else {
      return text.split(rule.pattern).join(replacement)
    }
  } catch { return text }
}

const sanitizedContent = computed(() => {
  if (!content.value || isComic.value) return ''
  let text = content.value
  try {
    text = removeSameTitle(text, currentChapter.value?.title || '', props.book?.name || '')
    if (readingStore.reSegment) text = reSegment(text, currentChapter.value?.title || '')
    for (const rule of replaceRuleStore.rules) {
      if (!rule.isEnabled || !rule.pattern) continue
      text = applyReplaceRuleSync(text, {
        pattern: rule.pattern, replacement: rule.replacement || '',
        isRegex: rule.isRegex, timeoutMs: rule.timeoutMs || 5000
      })
    }
  } catch {}
  text = '<p>' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','img','a','blockquote','pre','code','ul','ol','li'],
    ALLOWED_ATTR: ['href','src','alt','title','style']
  })
})

function increaseFontSize() { fontSize.value = Math.min(32, fontSize.value + 1) }
function decreaseFontSize() { fontSize.value = Math.max(12, fontSize.value - 1) }
function setTheme(value: string) { currentTheme.value = value }

function handleContentClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button, a, .reader-header, .reader-footer')) return
  selectMenu.value.visible = false
  showControls.value = !showControls.value
  if (showControls.value) resetHideTimer()
}

function handleTextSelect() {
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || !sel.toString().trim()) { selectMenu.value.visible = false; return }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    selectMenu.value = { visible: true, x: rect.left + rect.width / 2 - 40, y: rect.bottom + 6, text: sel.toString().trim() }
  }, 10)
}

function copySelection() { navigator.clipboard.writeText(selectMenu.value.text); selectMenu.value.visible = false }

function openDictPanel() {
  selectMenu.value.visible = false
  loadDictRules()
  dictActiveTab.value = 0; dictContents.value = {}; dictVisible.value = true
  switchDictTab(0)
}

async function loadDictRules() {
  try { const rules = await store.get('dictRule'); dictRules.value = (Array.isArray(rules) ? rules : []).filter((r: any) => r.enabled) } catch { dictRules.value = [] }
}

function switchDictTab(i: number) { dictActiveTab.value = i; if (dictContents.value[i]) return; queryDictRule(i) }

function createJsoupFromHTML(html: string) { const doc = new DOMParser().parseFromString(html, 'text/html'); return { select: (css: string) => createElementsList(Array.from(doc.querySelectorAll(css)), doc), body: () => ({ text: () => doc.body?.textContent || '', html: () => doc.body?.innerHTML || '' }) } }
function createElementsList(els: Element[], doc: Document) {
  const arr: any = els.map(e => ({ text: () => e.textContent || '', html: () => e.innerHTML || '', outerHtml: () => e.outerHTML || '', attr: (n: string) => e.getAttribute(n) || '', select: (css: string) => createElementsList(Array.from(e.querySelectorAll(css)), doc), remove: () => { e.remove(); return arr }, forEach: (fn: Function) => els.forEach((el, i) => fn({ text: () => el.textContent||'', html: () => el.innerHTML||'', attr: (n: string) => el.getAttribute(n)||'', remove: () => el.remove() }, i)) }))
  arr.size = () => els.length; arr.first = () => arr[0]; arr.get = (i: number) => arr[i]; arr.add = (other: any) => { const n = [...els]; if (other) n.push(other); return createElementsList(n, doc) }; arr.addAll = arr.add; arr.filter = (fn: Function) => createElementsList(els.filter((el, i) => fn(arr[i], i)), doc); arr.html = () => els.map(e => e.innerHTML).join(''); arr.text = () => els.map(e => e.textContent).join(' '); arr.attr = (n: string) => els[0]?.getAttribute(n) || ''; return arr
}

async function queryDictRule(i: number) {
  const rule = dictRules.value[i]; if (!rule) return
  dictLoading.value = true
  try {
    let url = rule.urlRule.replace(/\{\{key\}\}/g, encodeURIComponent(selectMenu.value.text))
    if (rule.urlRule.match(/^@js:|^<js>/)) { try { url = String(new Function('key', rule.urlRule.replace(/^@js:/,'').replace(/^<js>/,'').replace(/<\/js>$/,''))(selectMenu.value.text)) } catch(e) {} }
    const result = await invoke('fetch_url', { url, method: 'GET', headers: null, body: null, charset: null, useWebview: false, timeoutSecs: 15, sourceType: 0 })
    const html = typeof result === 'string' ? result : ''
    if (rule.showRule) {
      const showRule = rule.showRule
      if (showRule.startsWith('<js>') || showRule.startsWith('@js:')) {
        const fn = new Function('result', 'key', 'java', 'org', 'jsoup', (showRule.startsWith('@js:') ? showRule.slice(4) : showRule.replace(/^<js>/,'').replace(/<\/js>$/,'')))
        const mockJsoup = { Jsoup: { parse: createJsoupFromHTML } }; const parsed = fn(html, selectMenu.value.text, { ajax: () => '', log: console.log }, { jsoup: mockJsoup }, mockJsoup)
        dictContents.value[i] = parsed ? ((typeof parsed.html === 'function') ? parsed.html() : String(parsed)) : '<p>无结果</p>'
      } else if (showRule.includes('@')) {
        const parts = showRule.split('@'); const css = parts[0].replace(/^tag\./,'').replace(/\./g,' ').trim() || 'body'; const attr = parts[1] || 'html'; const doc = new DOMParser().parseFromString(html, 'text/html'); const els = Array.from(doc.querySelectorAll(css))
        if (attr === 'html' || attr === 'all') dictContents.value[i] = els.map(e => e.outerHTML).join(''); else if (attr === 'text') dictContents.value[i] = els.map(e => e.textContent).join('<br>'); else dictContents.value[i] = els.map(e => e.getAttribute(attr) || '').join('<br>')
      } else { dictContents.value[i] = html }
    } else { dictContents.value[i] = html }
  } catch(e) { dictContents.value[i] = '<p>查询失败</p>' }
  finally { dictLoading.value = false }
}

function clearHideTimer() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }
function resetHideTimer() { clearHideTimer(); hideTimer = setTimeout(() => { showControls.value = false }, 3000) }

async function loadChapters() {
  if (!props.book) return
  if (props.initialChapters?.length) { chapters.value = props.initialChapters; if ((props.book as any)?._forceChapterIndex !== undefined) { chapterIndex.value = (props.book as any)._forceChapterIndex; await loadContent(); return }; const progress = await readingStore.loadProgress(String(props.book.bookUrl || ''), props.book.name || '', props.book.author || ''); if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id) === Number(progress.chapterId)); if (idx !== -1) chapterIndex.value = idx }; await loadContent(); return }
  try {
    if (props.book.bookUrl?.startsWith('local://')) { chapters.value = (await readerApi.getLocalBookChapters(props.book.bookUrl.replace('local://', ''))) || [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0 }]; await loadContent(); return }
    const allSources: any[] = (await store.get('bookSource')) || []; const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
    if (!source) { message.warning('书源未找到'); return }
    chapters.value = (await (await import('../../engine/business/toc.js')).getToc(source, props.book.tocUrl || props.book.bookUrl, { book: props.book, formatJsExecutor })) || []; await loadContent()
  } catch (err: any) { message.error('加载目录失败: ' + err.message) }
}

async function resolveChapterUrl(ch: any, source: any): Promise<string> { if (ch.url && !ch._deferredJs) return ch.url; if (!ch._deferredJs) return ch.url || ''; try { return (await (await import('../../engine/core/rule-parser/js.js')).executeJs(ch._deferredResult, ch._deferredJs, { source, baseUrl: source.bookSourceUrl || '', book: props.book || {}, result: ch._deferredResult })) || ch.url || '' } catch { return ch.url || '' } }

async function loadContent() {
  if (!currentChapter.value) return
  loadingContent.value = true; comicImages.value = []
  if (preloadedContents.has(chapterIndex.value)) { content.value = preloadedContents.get(chapterIndex.value)!; loadingContent.value = false; if (!isComic.value && contentRef.value) contentRef.value.scrollTop = 0; resetHideTimer(); await saveProgress(); startPreload(); return }
  const cacheKey = (props.book?.bookUrl || '') + '/' + (currentChapter.value.id); const cached = await getCachedContent(cacheKey)
  if (cached) { content.value = cached; loadingContent.value = false; if (!isComic.value && contentRef.value) contentRef.value.scrollTop = 0; resetHideTimer(); await saveProgress(); startPreload(); return }
  try {
    if (props.book?.bookUrl?.startsWith('local://')) { content.value = String(await readerApi.getLocalChapterContent(props.book.bookUrl.replace('local://', ''), currentChapter.value.id) || ''); isComic.value = false }
    else {
      const allSources: any[] = (await store.get('bookSource')) || []; const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
      if (!source) { content.value = '<p>书源未找到</p>'; return }
      isComic.value = source.bookSourceType === 2
      const { getContent } = await import('../../engine/business/content.js')
      let rawContent = await getContent(source, await resolveChapterUrl(currentChapter.value, source), {
        bookKind: props.book?.kind, book: props.book, nextChapterUrl: chapters.value[chapterIndex.value + 1]?.url || ''
      })
      rawContent = await chineseConvert(rawContent)
      if (isComic.value) {
        const imgRegex = /<img\s+src=["']([^"']+)["']/gi
        comicImages.value = [...new Set([...rawContent.matchAll(imgRegex)].map(m => m[1]))].map(url => ({ url, data: '', status: 'loading' as const, retries: MAX_RETRIES }))
        loadComicImages(source)
      } else { content.value = rawContent }
    }
    if (content.value && !content.value.startsWith('<p>书源未找到</p>')) { await setCachedContent(cacheKey, content.value); preloadedContents.set(chapterIndex.value, content.value) }
    if (!isComic.value && contentRef.value) contentRef.value.scrollTop = 0; resetHideTimer(); await saveProgress(); startPreload()
  } catch (err: any) { content.value = '<p>加载失败: ' + (err?.message || String(err)) + '</p>' }
  finally { loadingContent.value = false }
}

function startPreload() { if (isComic.value) return; preloadQueue = []; for (let i = chapterIndex.value + 1; i < Math.min(chapterIndex.value + 1 + PRELOAD_COUNT, chapters.value.length); i++) { if (!preloadedContents.has(i)) preloadQueue.push(i) }; processPreloadQueue() }
async function processPreloadQueue() { const allSources: any[] = (await store.get('bookSource')) || []; const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName); if (!source) return; async function preloadOne() { while (preloadQueue.length > 0) { const idx = preloadQueue.shift()!; const ch = chapters.value[idx]; if (!ch) continue; const key = (props.book?.bookUrl || '') + '/' + ch.id; if (await getCachedContent(key)) { preloadedContents.set(idx, (await getCachedContent(key))!); continue }; try { const raw = await (await import('../../engine/business/content.js')).getContent(source, await resolveChapterUrl(ch, source), { bookKind: props.book?.kind, book: props.book, nextChapterUrl: chapters.value[idx + 1]?.url || '' }); if (raw) { preloadedContents.set(idx, raw); await setCachedContent(key, raw) } } catch {} } }; preloadOne(); preloadOne() }
async function loadComicImages(source: any) { const sourceJson = JSON.stringify(source); const comicId = (props.book?.bookUrl || 'default') + '/' + (currentChapter.value?.id || 0); invoke('comic_prefetch_images', { urls: comicImages.value.map(i => i.url), sourceJson, comicId }).catch(() => {}); const queue = [...comicImages.value]; const workers: Promise<void>[] = []; async function worker() { while (queue.length > 0) { const item = queue.shift(); if (!item) break; await loadSingleImage(item, sourceJson, comicId) } }; for (let i = 0; i < Math.min(2, comicImages.value.length); i++) workers.push(worker()); await Promise.all(workers) }
async function loadSingleImage(item: ComicImage, sourceJson: string, comicId: string) { while (item.retries > 0 && item.status !== 'loaded') { try { const result: any = await invoke('comic_fetch_image', { url: item.url, sourceJson, comicId }); if (result?.data) { item.data = result.data; item.status = 'loaded'; return } } catch (e) { item.retries--; if (item.retries <= 0) { item.status = 'error'; return }; await new Promise(r => setTimeout(r, 500)) } } }
async function retryComicImage(index: number) { const item = comicImages.value[index]; if (!item || item.status !== 'error') return; item.retries = MAX_RETRIES; item.status = 'loading'; const allSources: any[] = (await store.get('bookSource')) || []; const source = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName); if (!source) return; await loadSingleImage(item, JSON.stringify(source), (props.book?.bookUrl || 'default') + '/' + (currentChapter.value?.id || 0)) }

// ─── 正文缓存（CacheCategory::Content） ───
async function getCachedContent(key: string): Promise<string | null> {
  try { const raw = await invoke('cache_get_content', { bookUrl: key }); if (raw) return raw as string } catch {}; return null
}
async function setCachedContent(key: string, data: string) {
  try { await invoke('cache_put_content', { bookUrl: key, dataJson: data }) } catch {}
}

function handleScroll() { if (!contentRef.value) return; const max = contentRef.value.scrollHeight - contentRef.value.clientHeight; if (max <= 0) return; scrollPercent.value = Math.min(1, Math.max(0, contentRef.value.scrollTop / max)) }
async function saveProgress() { if (!props.book || !currentChapter.value) return; await readingStore.saveProgress(String(props.book.bookUrl), props.book.name || '', props.book.author || '', currentChapter.value.id, Math.round(scrollPercent.value * 10000), currentChapter.value.title || '') }
async function prevChapter() { if (chapterIndex.value > 0) { await saveProgress(); chapterIndex.value--; await loadContent() } }
async function nextChapter() { if (chapterIndex.value < chapters.value.length - 1) { await saveProgress(); chapterIndex.value++; await loadContent() } }
function handleClose() { saveProgress(); emit('close') }
function handleKeydown(e: KeyboardEvent) { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return; if (e.key === 'ArrowLeft') { e.preventDefault(); prevChapter() } if (e.key === 'ArrowRight') { e.preventDefault(); nextChapter() } if (e.key === 'Escape') { e.preventDefault(); handleClose() } }

onMounted(() => { readingStore.loadSettings(); replaceRuleStore.loadRules(); loadChapters(); window.addEventListener('keydown', handleKeydown) })
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); saveProgress(); if (hideTimer) clearTimeout(hideTimer) })
</script>

<style scoped>
.reader-fullscreen { position: fixed; inset: 0; z-index: 1000; background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.reader-header { display: flex; align-items: center; justify-content: center; padding: 6px 12px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); height: 48px; flex-shrink: 0; position: absolute; top: 0; left: 0; right: 0; z-index: 10; -webkit-app-region: drag; }
.reader-title { font-size: 14px; font-weight: 500; color: var(--text-secondary); text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; pointer-events: none; }
.header-spacer { width: 46px; flex-shrink: 0; pointer-events: none; }
.reader-title-drag { flex: 1; height: 100%; display: flex; align-items: center; justify-content: center; }
.btn-back { background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 0; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; min-width: 38px; min-height: 38px; transition: border-color 0.2s; flex-shrink: 0; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; -webkit-app-region: no-drag; }
.btn-back:hover { border-color: var(--border-color); }
.btn-click-area { pointer-events: auto; -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 8px; border-radius: var(--radius-sm); transition: background 0.2s; }
.btn-click-area:hover { background: var(--bg-hover); }
.btn-click-area svg { display: block; pointer-events: none; }
.reader-content { flex: 1; overflow-y: auto; overflow-x: hidden; user-select: text; }
.content-inner { max-width: 720px; margin: 0 auto; padding: 28px 36px; }
.content-comic { width: 100%; }
.comic-page { width: 100%; min-height: 100px; }
.comic-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; min-height: 200px; }
.comic-error { cursor: pointer; }
.comic-error:hover { background: var(--bg-hover); }
.select-menu { position: fixed; z-index: 3000; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 4px 0; min-width: 80px; }
.select-menu-item { padding: 8px 16px; font-size: 13px; color: var(--text-secondary); cursor: pointer; transition: background 0.15s; }
.select-menu-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.dict-tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
.dict-tab { padding: 4px 12px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, border-color 0.2s; }
.dict-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.dict-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.dict-content { max-height: 60vh; overflow-y: auto; padding: 8px; }
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
