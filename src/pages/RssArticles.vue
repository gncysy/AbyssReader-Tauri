<template>
  <div class="rss-articles-page">
    <header class="subpage-header">
      <BackButton />
      <h2>{{ source?.sourceName || '文章列表' }}</h2>
    </header>

    <div v-if="sortTabs.length > 1" class="sort-tabs">
      <button
        v-for="tab in sortTabs"
        :key="tab.name"
        class="sort-tab"
        :class="{ active: activeSortName === tab.name }"
        @click="switchSort(tab)"
      >{{ tab.name }}</button>
    </div>

    <div v-if="isComplexType" class="complex-section">
      <div class="search-row">
        <input v-model="complexSearchKey" type="text" placeholder="输入搜索关键词..." class="input-search" style="flex:1" @keyup.enter="runComplexSearch" />
        <button class="btn-primary" :disabled="complexLoading" @click="runComplexSearch">{{ complexLoading ? '解密中...' : '搜索' }}</button>
        <button class="btn-secondary" @click="openComplexInWebView">在 WebView 中打开</button>
      </div>
      <div v-if="complexResult" style="margin-top:12px">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">解密结果：</p>
        <div style="padding:10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-sm);word-break:break-all;font-size:13px;max-height:120px;overflow-y:auto">{{ complexResult }}</div>
        <button class="btn-primary" style="margin-top:8px;padding:6px 14px;font-size:13px" @click="fetchWithComplexResult">使用此结果加载</button>
      </div>
      <iframe v-if="complexIframeSrc" ref="complexIframe" :src="complexIframeSrc" style="display:none" @load="onComplexIframeLoad"></iframe>
    </div>

    <div v-if="!loading && articles.length > 0" :class="articleListClass">
      <div
        v-for="item in articles"
        :key="item.link"
        class="article-item"
        :class="articleItemClass"
        @click="openArticle(item)"
      >
        <img v-if="item.image && articleStyle !== 0" :src="item.image" class="article-image" @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
        <div class="article-content">
          <h4 class="article-title">{{ item.title }}</h4>
          <p v-if="item.description && articleStyle !== 2 && articleStyle !== 4" class="article-desc">{{ item.description }}</p>
          <p v-if="item.pubDate" class="article-date">{{ item.pubDate }}</p>
        </div>
      </div>
    </div>

    <div v-if="hasNextPage && !loading" style="text-align:center;padding:16px">
      <button class="btn-secondary" :disabled="loadingMore" @click="loadNextPage">{{ loadingMore ? '加载中...' : '加载更多' }}</button>
    </div>

    <div v-if="loading" style="display:flex;justify-content:center;padding:60px">
      <div class="loading-spinner"></div>
    </div>

    <div v-if="!loading && articles.length === 0 && !isComplexType" class="empty-state">
      <p>暂无文章</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { network, store } from '@/api'
import { getElements, getString } from '../../engine/core/rule-parser/index.js'
import BackButton from '@/components/BackButton.vue'
import type { RssSource, RssArticle } from '@shared/types'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const source = ref<RssSource | null>(null)
const articles = ref<RssArticle[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const activeSortName = ref('')
const currentPageUrl = ref('')
const hasNextPage = ref(false)
const nextPageUrl = ref('')

const complexSearchKey = ref('')
const complexLoading = ref(false)
const complexResult = ref('')
const complexIframeSrc = ref('')
const complexIframe = ref<HTMLIFrameElement | null>(null)
let complexResolve: ((value: string) => void) | null = null

const isComplexType = computed(() => !!(source.value?.startHtml))
const articleStyle = computed(() => source.value?.articleStyle || 0)

const sortTabs = computed(() => {
  if (!source.value?.sortUrl) return []
  return source.value.sortUrl.split('\n').filter(l => l.includes('::')).map(line => {
    const idx = line.indexOf('::')
    return { name: line.substring(0, idx), url: line.substring(idx + 2) }
  })
})

const articleListClass = computed(() => {
  switch (articleStyle.value) {
    case 2: return 'article-grid'
    case 1: return 'article-cards'
    case 4: return 'article-grid-col3'
    default: return 'article-list'
  }
})

const articleItemClass = computed(() => {
  if (articleStyle.value === 1) return 'card-item'
  if (articleStyle.value === 2 || articleStyle.value === 4) return 'grid-item'
  return ''
})

async function loadSource() {
  try {
    const data = await store.get('rssSources')
    const sources: RssSource[] = Array.isArray(data) ? data : []
    const sourceUrl = route.query.sourceUrl as string
    source.value = sources.find(s => s.sourceUrl === sourceUrl) || null
    if (source.value) {
      const tabs = sortTabs.value
      if (tabs.length > 0) {
        activeSortName.value = tabs[0].name
        currentPageUrl.value = tabs[0].url
      } else {
        currentPageUrl.value = source.value.sourceUrl
      }
    }
  } catch { source.value = null }
}

function switchSort(tab: { name: string; url: string }) {
  activeSortName.value = tab.name
  currentPageUrl.value = tab.url
  articles.value = []
  hasNextPage.value = false
  fetchArticles()
}

async function parseArticles(html: string): Promise<{ articles: RssArticle[]; nextUrl: string }> {
  if (!source.value) return { articles: [], nextUrl: '' }
  const baseCtx = { source: source.value, baseUrl: currentPageUrl.value || source.value.sourceUrl, book: {}, result: html }

  let listRule = source.value.ruleArticles || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const elements = await getElements(html, listRule, baseCtx)
  if (!Array.isArray(elements) || elements.length === 0) return { articles: [], nextUrl: '' }

  const titleRule = source.value.ruleTitle || ''
  const linkRule = source.value.ruleLink || ''
  const descRule = source.value.ruleDescription || ''
  const imageRule = source.value.ruleImage || ''
  const dateRule = source.value.rulePubDate || ''

  const result: RssArticle[] = []
  for (const item of elements) {
    if (item === null || item === undefined) continue
    let safeItem: any = item
    try { safeItem = JSON.parse(JSON.stringify(item)) } catch {}
    const itemCtx = { ...baseCtx, result: safeItem }

    const title = await getString(safeItem, titleRule, itemCtx) || ''
    if (!title) continue
    const link = await getString(safeItem, linkRule, { ...itemCtx, isUrl: true }) || ''
    const description = descRule ? await getString(safeItem, descRule, itemCtx) || null : null
    const image = imageRule ? await getString(safeItem, imageRule, itemCtx) || null : null
    const pubDate = dateRule ? await getString(safeItem, dateRule, itemCtx) || null : null
    result.push({ title: String(title), link, description, image, pubDate, sort: activeSortName.value, origin: source.value!.sourceUrl })
  }
  if (reverse) result.reverse()

  let nextUrl = ''
  if (source.value.ruleNextPage) {
    const nextRule = source.value.ruleNextPage
    if (nextRule.toUpperCase() === 'PAGE') {
      nextUrl = currentPageUrl.value
    } else {
      const raw = await getString(html, nextRule, { ...baseCtx, isUrl: true })
      if (raw) nextUrl = raw
    }
  }
  return { articles: result, nextUrl }
}

async function fetchArticles() {
  if (!source.value || !currentPageUrl.value) return
  loading.value = true
  try {
    const html = await network.fetch(currentPageUrl.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = result.articles
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== currentPageUrl.value
    nextPageUrl.value = result.nextUrl
  } catch (err: any) {
    message.error('获取文章失败: ' + (err?.message || String(err)))
  }
  finally { loading.value = false }
}

async function loadNextPage() {
  if (!nextPageUrl.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const html = await network.fetch(nextPageUrl.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = [...articles.value, ...result.articles]
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== nextPageUrl.value
    nextPageUrl.value = result.nextUrl
  } catch (err: any) {
    message.error('加载更多失败: ' + (err?.message || String(err)))
  }
  finally { loadingMore.value = false }
}

function openArticle(item: RssArticle) {
  if (!item.link) return
  if (source.value?.ruleContent) {
    router.push({ name: 'rss-read', query: { articleLink: item.link, sourceUrl: source.value.sourceUrl } })
  } else {
    invoke('show_browser', { html: '', script: "window.location.href='" + item.link.replace(/'/g, "\\'") + "'", options: null }).catch(() => {})
  }
}

// ─── 复杂类型 ───
const END_HEAD = '</' + 'head>'
const END_BODY = '</' + 'body>'
const END_HTML = '</' + 'html>'
const END_SCRIPT = '</' + 'script>'

function buildComplexHtml(): string {
  if (!source.value) return ''
  const html = source.value.startHtml || ''
  const style = source.value.startStyle ? '<style>' + source.value.startStyle + '</style>' : ''
  const injectJs = '<script>window.importContent=function(){var r=document.getElementById("resultText");var u=r?r.value:"";if(!u){var ts=document.querySelectorAll("textarea");for(var i=0;i<ts.length;i++){if(ts[i].value&&ts[i].value.startsWith("http")){u=ts[i].value;break}}}window.parent.postMessage({type:"rss-complex-result",url:u},"*");};' + END_SCRIPT

  if (html.includes('<head>')) return html.replace('<head>', '<head>' + style + injectJs)
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + style + injectJs + END_HEAD + '<body>' + html + '<script>' + (source.value.startJs || '') + END_SCRIPT + END_BODY + END_HTML
}

async function runComplexSearch() {
  if (!source.value) return
  complexLoading.value = true
  complexResult.value = ''
  const fullHtml = buildComplexHtml()
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  complexIframeSrc.value = url
  try {
    const result = await new Promise<string>((resolve) => {
      complexResolve = resolve
      setTimeout(() => resolve(''), 60000)
    })
    complexResult.value = result
  } finally {
    complexLoading.value = false
    URL.revokeObjectURL(url)
    complexIframeSrc.value = ''
  }
}

function onComplexIframeLoad() {
  if (!complexIframe.value) return
  try {
    const iframeWin = complexIframe.value.contentWindow
    if (!iframeWin) return
    const js = source.value?.startJs
    if (js) {
      const cleanedJs = js.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
      const script = iframeWin.document.createElement('script')
      script.textContent = cleanedJs
      iframeWin.document.body.appendChild(script)
    }
  } catch {}
}

function handleComplexMessage(e: MessageEvent) {
  if (e.data?.type === 'rss-complex-result' && complexResolve) {
    complexResolve(e.data.url || '')
    complexResolve = null
  }
}

async function openComplexInWebView() {
  const fullHtml = buildComplexHtml()
  try { await invoke('show_browser', { html: fullHtml, script: source.value?.startJs || null, options: null }) } catch {}
}

async function fetchWithComplexResult() {
  if (!complexResult.value || !source.value) return
  loading.value = true
  try {
    const html = await network.fetch(complexResult.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = result.articles
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== complexResult.value
    nextPageUrl.value = result.nextUrl
  } catch (err: any) { message.error('获取文章失败: ' + (err?.message || String(err))) }
  finally { loading.value = false }
}

onMounted(async () => {
  await loadSource()
  if (source.value && !isComplexType.value) await fetchArticles()
  window.addEventListener('message', handleComplexMessage)
})

onUnmounted(() => window.removeEventListener('message', handleComplexMessage))
</script>

<style scoped>
.rss-articles-page { position: relative; z-index: 1; }
.sort-tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
.sort-tab { padding: 6px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.sort-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.sort-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.complex-section { margin-bottom: 20px; }
.search-row { display: flex; gap: 10px; align-items: center; }
.article-list { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.article-cards { display: grid; grid-template-columns: 1fr; gap: 12px; }
.article-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.article-grid-col3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.article-item { display: flex; align-items: center; padding: 14px 18px; background: var(--bg-card); cursor: pointer; transition: background 0.18s; gap: 14px; min-height: 56px; }
.article-item:hover { background: var(--bg-hover); }
.card-item { flex-direction: column; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 16px; }
.grid-item { flex-direction: column; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 12px; }
.article-image { width: 60px; height: 60px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; }
.card-item .article-image, .grid-item .article-image { width: 100%; height: 140px; }
.article-content { flex: 1; min-width: 0; }
.article-title { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.article-desc { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.article-date { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }
</style>
