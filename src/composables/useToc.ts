// ============================================
// useToc — 目录状态管理
// ============================================

import { ref, computed } from 'vue'
import { fetchToc, loadTocFromCache, saveTocToCache } from '@/services/toc.js'
import type { Book, BookSource, Chapter } from '@/types'

const TOC_PAGE_SIZE = 200

export function useToc() {
  const chapters = ref<Chapter[]>([])
  const loadingToc = ref(false)
  const tocFilter = ref('')
  const tocCurrentPage = ref(0)

  const safeChapters = computed(() => (Array.isArray(chapters.value) ? chapters.value : []))
  const filteredChapters = computed(() => {
    const kw = tocFilter.value.trim().toLowerCase()
    if (!kw) return safeChapters.value
    return safeChapters.value.filter((ch) => ch.title.toLowerCase().includes(kw))
  })
  const totalTocPages = computed(() => Math.ceil(filteredChapters.value.length / TOC_PAGE_SIZE))
  const pagedChapters = computed(() => {
    const start = tocCurrentPage.value * TOC_PAGE_SIZE
    return filteredChapters.value.slice(start, start + TOC_PAGE_SIZE)
  })

  async function loadToc(
    source: BookSource,
    tocUrl: string,
    book?: Book
  ): Promise<Chapter[]> {
    loadingToc.value = true
    try {
      const result = await fetchToc(source, tocUrl, book)
      chapters.value = result
      return result
    } finally {
      loadingToc.value = false
    }
  }

  async function loadTocSmart(
    source: BookSource,
    tocUrl: string,
    book?: Book
  ): Promise<Chapter[]> {
    // 第一步：查缓存
    const cached = await loadTocFromCache(source, book)

    if (cached && cached.length > 0) {
      chapters.value = cached
      loadingToc.value = false
    }

    // 第二步：后台刷新
    try {
      const fresh = await fetchToc(source, tocUrl, book)

      if (fresh && fresh.length > 0) {
        const cachedJson = JSON.stringify(cached || [])
        const freshJson = JSON.stringify(fresh)

        if (cachedJson !== freshJson) {
          chapters.value = fresh
          if (book) {
            await saveTocToCache(source, book, fresh)
          }
        }
      }
    } catch (err) {
      if (!cached || cached.length === 0) {
        console.warn('[useToc] 目录加载失败:', err)
      }
    } finally {
      loadingToc.value = false
    }

    return chapters.value
  }

  return {
    chapters,
    loadingToc,
    tocFilter,
    tocCurrentPage,
    safeChapters,
    filteredChapters,
    totalTocPages,
    pagedChapters,
    loadToc,
    loadTocSmart,
    loadTocFromCache,
    saveTocToCache,
  }
}
