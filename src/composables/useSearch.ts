// ============================================
// useSearch — 搜索状态管理（流式输出）
// ============================================

import { ref } from 'vue'
import { search, batchSearch } from '@/services/search.js'
import type { Book, BookSource } from '@/types'
import { NETWORK } from '@/constants/index.js'

export function useSearch() {
  const loading = ref(false)
  const completedCount = ref(0)
  const totalSources = ref(0)
  const searchResults = ref<Record<string, Book[]>>({})

  let abortController: AbortController = new AbortController()

  function cancelSearch(): void {
    abortController.abort()
    abortController = new AbortController()
    loading.value = false
  }

  async function doSearch(
    sources: BookSource[],
    keyword: string,
    options: {
      page?: number
      filter?: ((name: string, author: string, kind: string | null) => boolean) | null
      shouldBreak?: ((size: number) => boolean) | null
      concurrency?: number
    } = {},
  ): Promise<Book[]> {
    const concurrency = options.concurrency || NETWORK.CONCURRENCY
    const signal = abortController.signal

    const enabledSources = sources.filter((s) => s.enabled !== false)
    totalSources.value = enabledSources.length
    completedCount.value = 0
    loading.value = true
    searchResults.value = {}

    const queue = [...enabledSources]
    const allBooks: Book[] = []

    async function worker(): Promise<void> {
      while (queue.length > 0 && !signal.aborted) {
        const source = queue.shift()
        if (!source) break

        let books: Book[] = []
        const sourceKey = `${source.bookSourceName || source.bookSourceUrl || 'unknown'}::${source.bookSourceUrl || ''}`

        try {
          if (signal.aborted) break
          books = await search(source, keyword, {
            page: options.page,
            signal,
            filter: options.filter,
            shouldBreak: options.shouldBreak,
          })
        } catch {
          // 单个书源失败，静默跳过
        }

        if (!signal.aborted) {
          if (books.length > 0) {
            const displayName = source.bookSourceName || source.name || source.bookSourceUrl || '未知书源'

            if (searchResults.value[displayName]) {
              const existing = searchResults.value[displayName] || []
              const existingUrls = new Set(existing.map(b => b.bookUrl))
              const newBooks = books.filter(b => !existingUrls.has(b.bookUrl))
              searchResults.value = {
                ...searchResults.value,
                [displayName]: [...existing, ...newBooks],
              }
            } else {
              searchResults.value = {
                ...searchResults.value,
                [displayName]: books,
              }
            }

            // 附加 sourceKey 供换源使用
            for (const b of books) {
              ;(b as any)._sourceKey = sourceKey
            }

            allBooks.push(...books)
          }

          completedCount.value++
        }
      }
    }

    const workers: Promise<void>[] = []
    const workerCount = Math.min(concurrency, enabledSources.length)
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker())
    }
    await Promise.all(workers)

    if (!signal.aborted) {
      loading.value = false
    }

    return allBooks
  }

  function clearResults(): void {
    searchResults.value = {}
    completedCount.value = 0
    totalSources.value = 0
  }

  return {
    loading,
    completedCount,
    totalSources,
    searchResults,
    doSearch,
    cancelSearch,
    clearResults,
  }
}
