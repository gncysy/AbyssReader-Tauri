// ============================================
// useChangeSource — 换源逻辑（修复索引错位）
// ============================================

import { ref } from 'vue'
import type { Book, BookSource } from '@/types'
import { store } from '@/services/store.js'

export function useChangeSource() {
  const showChangeSource = ref(false)
  const changeSourceResults = ref<any[]>([])
  const changingSource = ref(false)
  const searchDone = ref(0)
  const searchTotal = ref(0)
  const allSourceList = ref<BookSource[]>([])

  async function openChangeSource(): Promise<void> {
    allSourceList.value = (await store.get('bookSource')) || []
    changeSourceResults.value = []
    searchDone.value = 0
    searchTotal.value = 0
    showChangeSource.value = true
  }

  async function searchForChange(bookName: string): Promise<void> {
    changingSource.value = true
    changeSourceResults.value = []
    searchDone.value = 0

    try {
      const queue = allSourceList.value.filter((s) => s.enabled && s.bookSourceType === 0)
      searchTotal.value = queue.length

      const { useSearch } = await import('./useSearch.js')
      const { doSearch } = useSearch()

      const allBooks = await doSearch(queue, bookName, { page: 1 })

      // 用 Map 记录书源信息，避免 filter 后索引错位
      // BUG-4 修复：key 格式与 useSearch.ts 完全一致
      const sourceMap = new Map<string, { name: string; url: string }>()
      for (const s of queue) {
        const key = `${s.bookSourceName || s.bookSourceUrl || 'unknown'}::${s.bookSourceUrl || ''}`
        sourceMap.set(key, {
          name: s.bookSourceName || s.name || '未知书源',
          url: s.bookSourceUrl || '',
        })
      }

      const matched = allBooks
        .filter((b: any) => b.name === bookName)
        .map((b: any) => {
          const sourceKey = (b as any)._sourceKey || ''
          const info = sourceMap.get(sourceKey) || { name: '未知书源', url: '' }
          return {
            ...b,
            _sourceName: info.name,
            _sourceUrl: info.url,
          }
        })

      changeSourceResults.value = matched
      searchDone.value = queue.length
    } catch {
      changeSourceResults.value = []
    } finally {
      changingSource.value = false
    }
  }

  function closeChangeSource(): void {
    showChangeSource.value = false
    changeSourceResults.value = []
  }

  return {
    showChangeSource, changeSourceResults, changingSource,
    searchDone, searchTotal, allSourceList,
    openChangeSource, searchForChange, closeChangeSource,
  }
}
