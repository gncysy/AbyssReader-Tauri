// ============================================
// usePagination — 通用分页逻辑（省略号去重）
// ============================================

import { ref, computed, type Ref } from 'vue'

export function usePagination<T>(items: Ref<T[]>, pageSize: number) {
  const currentPage = ref(0)

  const totalPages = computed(() => Math.ceil(items.value.length / pageSize))

  const pagedItems = computed(() => {
    const start = currentPage.value * pageSize
    return items.value.slice(start, start + pageSize)
  })

  function goPage(page: number): void {
    if (page >= 0 && page < totalPages.value) {
      currentPage.value = page
    }
  }

  function nextPage(): void {
    if (currentPage.value < totalPages.value - 1) {
      currentPage.value++
    }
  }

  function prevPage(): void {
    if (currentPage.value > 0) {
      currentPage.value--
    }
  }

  function resetPage(): void {
    currentPage.value = 0
  }

  const displayPages = computed(() => {
    const total = totalPages.value
    const cur = currentPage.value
    if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)

    const pages: (number | string)[] = [1]
    const start = Math.max(2, cur - 1)
    const end = Math.min(total - 1, cur + 1)

    if (start > 2) pages.push('...')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < total - 1) pages.push('...')
    pages.push(total)

    // 去重连续省略号
    const deduped: (number | string)[] = []
    for (let i = 0; i < pages.length; i++) {
      if (pages[i] === '...' && deduped[deduped.length - 1] === '...') continue
      deduped.push(pages[i])
    }
    return deduped
  })

  return { currentPage, totalPages, pagedItems, goPage, nextPage, prevPage, resetPage, displayPages }
}
