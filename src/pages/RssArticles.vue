<template>
  <div class="rss-articles-page">
    <header class="subpage-header">
      <BackButton />
      <h2>{{ source?.sourceName || '订阅源' }}</h2>
      <button 
        v-if="mode === 'browse'" 
        class="btn-secondary" 
        style="padding:2px 12px;font-size:12px;margin-left:auto"
        @click="toggleListMode"
      >
        {{ showList ? '查看网页' : '查看文章列表' }}
      </button>
    </header>

    <!-- 浏览模式：打开独立窗口 -->
    <div v-if="mode === 'browse' && !showList" class="webview-container" style="display:flex;align-items:center;justify-content:center;min-height:300px">
      <div v-if="webviewLoading" style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="loading-spinner"></div>
        <span style="color:var(--text-muted)">正在打开浏览窗口...</span>
      </div>
      <div v-else class="empty-state" style="padding:40px">
        <p style="color:var(--text-muted);margin-bottom:12px">浏览窗口已打开</p>
        <button class="btn-primary" @click="openInNewWindow">重新打开</button>
      </div>
    </div>

    <!-- 列表模式：原有文章列表 -->
    <template v-else>
      <div v-if="sortTabs.length > 1" class="sort-tabs">
        <button
          v-for="tab in sortTabs"
          :key="tab.name"
          class="sort-tab"
          :class="{ active: activeSortName === tab.name }"
          @click="switchSort(tab)"
        >{{ tab.name }}</button>
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

      <div v-if="!loading && articles.length === 0" class="empty-state">
        <p>暂无文章</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { network, store } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import { createAnalyzer } from '../../engine/core/rule-parser/index.js'
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

const mode = ref<'browse' | 'list'>('list')
const showList = ref(false)
const webviewLoading = ref(false)

const articleCache = new Map<string, { articles: RssArticle[]; nextUrl: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

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
    const modeParam = route.query.mode as string || 'list'
    
    source.value = sources.find(s => s.sourceUrl === sourceUrl) || null
    
    mode.value = modeParam === 'browse' ? 'browse' : 'list'
    
    if (!source.value) return

    if (mode.value === 'browse') {
      openInNewWindow()
      return
    }

    const tabs = sortTabs.value
    if (tabs.length > 0) {
      activeSortName.value = tabs[0].name
      currentPageUrl.value = tabs[0].url
    } else {
      currentPageUrl.value = source.value.sourceUrl
    }
    await fetchArticles()
  } catch { 
    source.value = null 
  }
}

function openInNewWindow() {
  if (!source.value) return
  webviewLoading.value = true
  invoke('rss_open_url', {
    url: source.value.sourceUrl,
    title: source.value.sourceName || '订阅源'
  }).then(() => {
    webviewLoading.value = false
  }).catch((err: any) => {
    webviewLoading.value = false
    message.error('打开失败: ' + (err?.message || String(err)))
  })
}

function toggleListMode() {
  showList.value = !showList.value
  if (showList.value && articles.value.length === 0) {
    const tabs = sortTabs.value
    if (tabs.length > 0) {
      activeSortName.value = tabs[0].name
      currentPageUrl.value = tabs[0].url
    } else {
      currentPageUrl.value = source.value?.sourceUrl || ''
    }
    fetchArticles()
  }
}

function switchSort(tab: { name: string; url: string }) {
  activeSortName.value = tab.name
  currentPageUrl.value = tab.url
  articles.value = []
  hasNextPage.value = false
  articleCache.clear()
  fetchArticles()
}

async function parseArticles(html: string): Promise<{ articles: RssArticle[]; nextUrl: string }> {
  if (!source.value) return { articles: [], nextUrl: '' }

  const analyzer = createAnalyzer(source.value)
  analyzer.setContent(html, currentPageUrl.value || source.value.sourceUrl)

  let listRule = source.value.ruleArticles || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const elements = await analyzer.getElements(listRule)
  if (!Array.isArray(elements) || elements.length === 0) {
    return { articles: [], nextUrl: '' }
  }

  const titleRule = source.value.ruleTitle || ''
  const linkRule = source.value.ruleLink || ''
  const descRule = source.value.ruleDescription || ''
  const imageRule = source.value.ruleImage || ''
  const dateRule = source.value.rulePubDate || ''

  const result: RssArticle[] = []
  for (const item of elements) {
    if (item === null || item === undefined) continue
    const itemAnalyzer = createAnalyzer(source.value)
    itemAnalyzer.setContent(item, currentPageUrl.value || source.value.sourceUrl)

    const title = (await itemAnalyzer.getString(titleRule)) || ''
    if (!title) continue

    const link = (await itemAnalyzer.getString(linkRule, { isUrl: true })) || ''
    const description = descRule ? (await itemAnalyzer.getString(descRule)) || null : null
    const image = imageRule ? (await itemAnalyzer.getString(imageRule)) || null : null
    const pubDate = dateRule ? (await itemAnalyzer.getString(dateRule)) || null : null

    result.push({
      title: String(title),
      link,
      description,
      image,
      pubDate,
      sort: activeSortName.value,
      origin: source.value!.sourceUrl,
    })
  }

  if (reverse) result.reverse()

  let nextUrl = ''
  if (source.value.ruleNextPage) {
    const nextRule = source.value.ruleNextPage
    if (nextRule.toUpperCase() === 'PAGE') {
      nextUrl = currentPageUrl.value
    } else {
      const nextAnalyzer = createAnalyzer(source.value)
      nextAnalyzer.setContent(html, currentPageUrl.value || source.value.sourceUrl)
      const raw = await nextAnalyzer.getString(nextRule, { isUrl: true })
      if (raw) nextUrl = raw
    }
  }

  return { articles: result, nextUrl }
}

async function fetchArticles(useCache = true) {
  if (!source.value || !currentPageUrl.value) return
  if (loading.value) return

  if (useCache && source.value.cacheFirst) {
    const cached = articleCache.get(currentPageUrl.value)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      articles.value = cached.articles
      hasNextPage.value = !!cached.nextUrl && cached.nextUrl !== currentPageUrl.value
      nextPageUrl.value = cached.nextUrl
      return
    }
  }

  loading.value = true
  try {
    const html = await network.fetch(currentPageUrl.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = result.articles
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== currentPageUrl.value
    nextPageUrl.value = result.nextUrl

    articleCache.set(currentPageUrl.value, {
      articles: result.articles,
      nextUrl: result.nextUrl,
      timestamp: Date.now(),
    })
  } catch (err: any) {
    message.error('获取文章失败: ' + (err?.message || String(err)))
    const cached = articleCache.get(currentPageUrl.value)
    if (cached) {
      articles.value = cached.articles
      hasNextPage.value = !!cached.nextUrl && cached.nextUrl !== currentPageUrl.value
      nextPageUrl.value = cached.nextUrl
      message.warning('使用缓存数据')
    }
  } finally {
    loading.value = false
  }
}

async function loadNextPage() {
  if (!nextPageUrl.value || loadingMore.value) return
  if (!source.value) return

  loadingMore.value = true
  try {
    const html = await network.fetch(nextPageUrl.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = [...articles.value, ...result.articles]
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== nextPageUrl.value
    nextPageUrl.value = result.nextUrl

    articleCache.set(nextPageUrl.value, {
      articles: result.articles,
      nextUrl: result.nextUrl,
      timestamp: Date.now(),
    })
  } catch (err: any) {
    message.error('加载更多失败: ' + (err?.message || String(err)))
  } finally {
    loadingMore.value = false
  }
}

function openArticle(item: RssArticle) {
  if (!item.link) return
  router.push({ 
    name: 'rss-read', 
    query: { 
      articleLink: item.link, 
      sourceUrl: source.value?.sourceUrl,
      useWebView: 'true'
    } 
  })
}

onMounted(async () => {
  await loadSource()
})

onUnmounted(() => {
  // clean up
})
</script>

<style scoped>
.rss-articles-page { position: relative; z-index: 1; }

.webview-container {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-card);
}

.sort-tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
.sort-tab { padding: 6px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.sort-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.sort-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }

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
