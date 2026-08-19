// ============================================
// useBookInfo — 书籍详情加载 & 缓存（带 TTL）
// ============================================

import { reactive, ref } from 'vue'
import { getString } from '@engine/parser/index.js'
import { fetchWithWebviewFallback } from '@/services/fetch.js'
import { logError } from '@engine/log/index.js'
import type { Book, BookSource } from '@/types'

const CACHE_TTL = 30 * 60 * 1000 // 30 分钟

interface BookInfoCache {
  intro: string | null
  kind: string | null
  lastChapter: string | null
  wordCount: string | null
  tocUrl: string | null
  coverUrl: string | null
  timestamp: number
}

const globalBookInfoCache = reactive(new Map<string, BookInfoCache>())

function isHtmlContent(str: string): boolean {
  return str.startsWith('<') && str.includes('>') && str.length > 100
}

function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string' && val.length > 0 && !isHtmlContent(val)) return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object' && val !== null) {
    const obj = val as any
    if (obj.src && typeof obj.src === 'string') return obj.src
    if (obj.href && typeof obj.href === 'string') return obj.href
    if (obj.getAttribute && typeof obj.getAttribute === 'function') {
      const src = obj.getAttribute('src')
      if (src) return src
      const href = obj.getAttribute('href')
      if (href) return href
    }
  }
  return null
}

export function useBookInfo() {
  const loadedIntro = ref<string | null>(null)
  const loadedKind = ref<string | null>(null)
  const loadedLastChapter = ref<string | null>(null)
  const loadedWordCount = ref<string | null>(null)
  const loadedTocUrl = ref<string | null>(null)
  const loadedCover = ref<string | null>(null)

  async function loadBookInfo(book: Book, source: BookSource): Promise<void> {
    if (!book || !source) return
    const cacheKey = book.bookUrl
    const cached = globalBookInfoCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      loadedIntro.value = cached.intro
      loadedKind.value = cached.kind
      loadedLastChapter.value = cached.lastChapter
      loadedWordCount.value = cached.wordCount
      loadedTocUrl.value = cached.tocUrl
      loadedCover.value = cached.coverUrl
      if (cached.coverUrl && !book.coverUrl) {
        ;(book as any).coverUrl = cached.coverUrl
      }
      return
    }

    try {
      const html = await fetchWithWebviewFallback(book.bookUrl, {
        source,
        timeout: 30000,
      })

      if (!html) return

      const rule = source.ruleBookInfo
      if (!rule) return

      const ctx = { source, baseUrl: book.bookUrl, result: html }

      if (rule.intro) {
        loadedIntro.value = safeString(await getString(html, rule.intro, ctx))
      }
      if (rule.kind) {
        loadedKind.value = safeString(await getString(html, rule.kind, ctx))
      }
      if (rule.lastChapter) {
        loadedLastChapter.value = safeString(await getString(html, rule.lastChapter, ctx))
      }
      if ((rule as any).wordCount) {
        loadedWordCount.value = safeString(await getString(html, (rule as any).wordCount, ctx))
      }
      if (rule.coverUrl) {
        const rawCover = await getString(html, rule.coverUrl, ctx)
        const coverStr = safeString(rawCover)
        if (coverStr) {
          try {
            const resolved = coverStr.startsWith('http') ? coverStr : new URL(coverStr, book.bookUrl).href
            loadedCover.value = resolved
            ;(book as any).coverUrl = resolved
          } catch {
            loadedCover.value = coverStr
            ;(book as any).coverUrl = coverStr
          }
        }
      }
      if (rule.tocUrl && rule.tocUrl !== '{{baseUrl}}') {
        const raw = await getString(html, rule.tocUrl, { ...ctx, isUrl: true })
        loadedTocUrl.value = safeString(raw)
      } else {
        loadedTocUrl.value = book.bookUrl
      }

      globalBookInfoCache.set(cacheKey, {
        intro: loadedIntro.value,
        kind: loadedKind.value,
        lastChapter: loadedLastChapter.value,
        wordCount: loadedWordCount.value,
        tocUrl: loadedTocUrl.value,
        coverUrl: loadedCover.value,
        timestamp: Date.now(),
      })
    } catch (err: any) {
      logError('bookshelf', 'frontend', `[详情] 加载失败: ${err?.message || String(err)}`)
    }
  }

  return { loadedIntro, loadedKind, loadedLastChapter, loadedWordCount, loadedTocUrl, loadedCover, loadBookInfo }
}
