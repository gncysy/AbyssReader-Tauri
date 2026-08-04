<template>
  <div class="rss-reader-page">
    <header class="reader-topbar">
      <BackButton />
      <h2 class="reader-title-text">{{ articleTitle }}</h2>
    </header>

    <div v-if="loading" style="display:flex;justify-content:center;padding:80px">
      <div class="loading-spinner"></div>
    </div>

    <div v-else-if="content" class="reader-body" v-html="sanitizedContent"></div>

    <div v-else class="empty-state" style="padding:80px">
      <p>无法加载文章内容</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { network, store } from '@/api'
import { getString } from '../../engine/core/rule-parser/index.js'
import BackButton from '@/components/BackButton.vue'
import type { RssSource } from '@shared/types'

const route = useRoute()
const message = useMessage()

const articleTitle = ref('加载中...')
const content = ref('')
const loading = ref(true)

const sanitizedContent = computed(() => {
  if (!content.value) return ''
  const paragraphs = content.value.split(/\n\n+/).filter(p => p.trim())
  const html = paragraphs.map(p => {
    const trimmed = p.trim()
    const withBreaks = trimmed.replace(/\n/g, '<br>')
    return '<p style="text-indent:2em;margin:0 0 8px;line-height:1.8">' + withBreaks + '</p>'
  }).join('')
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'a', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style']
  })
})

async function loadArticle() {
  const articleLink = route.query.articleLink as string
  const sourceUrl = route.query.sourceUrl as string
  const useWebView = route.query.useWebView === 'true'

  if (!articleLink) { loading.value = false; return }

  try {
    const data = await store.get('rssSources')
    const sources: RssSource[] = Array.isArray(data) ? data : []
    const source = sources.find(s => s.sourceUrl === sourceUrl)

    let rawHtml = ''
    if (useWebView) {
      try {
        const headers = source?.header ? JSON.parse(source.header) : {}
        rawHtml = await network.fetchWebView(articleLink, {
          headers,
          webJs: source?.injectJs || undefined,
          timeout: 30000,
          sourceType: source?.type || 0,
          preserveStyle: true,
        })
      } catch (e) {
        rawHtml = await network.fetch(articleLink, { method: 'GET' })
      }
    } else {
      rawHtml = await network.fetch(articleLink, { method: 'GET' })
    }

    const htmlStr = typeof rawHtml === 'string' ? rawHtml : JSON.stringify(rawHtml)

    if (source?.ruleTitle) {
      const ctx = { source, baseUrl: articleLink, book: {}, result: htmlStr }
      const title = await getString(htmlStr, source.ruleTitle, ctx)
      if (title) articleTitle.value = title
    } else {
      const titleMatch = htmlStr.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      articleTitle.value = titleMatch ? titleMatch[1].trim() : '文章'
    }

    if (source?.ruleContent) {
      const ctx = { source, baseUrl: articleLink, book: {}, result: htmlStr }
      const articleContent = await getString(htmlStr, source.ruleContent, ctx)
      content.value = articleContent || ''
    } else {
      const bodyMatch = htmlStr.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      content.value = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, '') : htmlStr.replace(/<[^>]+>/g, '')
    }
  } catch (err: any) {
    message.error('加载文章失败: ' + (err?.message || String(err)))
    articleTitle.value = '加载失败'
  }
  finally { loading.value = false }
}

onMounted(() => { loadArticle() })
</script>

<style scoped>
.rss-reader-page { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }
.reader-topbar { display: flex; align-items: center; gap: 16px; padding: 0 0 20px; border-bottom: 1px solid var(--border-color); margin-bottom: 24px; flex-shrink: 0; }
.reader-title-text { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reader-body { flex: 1; overflow-y: auto; padding: 0 4px; font-size: 15px; color: var(--text-primary); line-height: 1.8; }
</style>
