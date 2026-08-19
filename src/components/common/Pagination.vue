<template>
  <div v-if="totalPages > 1" class="pagination">
    <button class="page-btn" :disabled="currentPage <= 0" @click="$emit('go-page', currentPage - 1)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>

    <template v-if="totalPages <= maxPagerCount">
      <button
        v-for="p in totalPages"
        :key="p"
        class="page-num"
        :class="{ active: p === currentPage + 1 }"
        @click="$emit('go-page', p - 1)"
      >{{ p }}</button>
    </template>

    <template v-else>
      <button
        class="page-num"
        :class="{ active: 1 === currentPage + 1 }"
        @click="$emit('go-page', 0)"
      >1</button>

      <span v-if="showPrevMore" class="page-ellipsis" @click="jumpBackward">...</span>

      <button
        v-for="p in visiblePages"
        :key="p"
        class="page-num"
        :class="{ active: p === currentPage + 1 }"
        @click="$emit('go-page', p - 1)"
      >{{ p }}</button>

      <span v-if="showNextMore" class="page-ellipsis" @click="jumpForward">...</span>

      <button
        class="page-num"
        :class="{ active: totalPages === currentPage + 1 }"
        @click="$emit('go-page', totalPages - 1)"
      >{{ totalPages }}</button>
    </template>

    <button class="page-btn" :disabled="currentPage >= totalPages - 1" @click="$emit('go-page', currentPage + 1)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  pagerCount?: number
}>(), {
  pagerCount: 7,
})

// LOW-2 修复：保存 emit 函数引用，避免 getCurrentInstance
const emit = defineEmits<{ 'go-page': [page: number] }>()

const maxPagerCount = computed(() => props.pagerCount || 7)

const visiblePagerCount = computed(() => {
  const count = maxPagerCount.value - 2
  return count > 0 ? count : 1
})

const offset = computed(() => {
  const current = props.currentPage + 1
  const pageCount = props.totalPages
  const pagerCount = maxPagerCount.value
  const visible = visiblePagerCount.value

  if (current <= Math.ceil(pagerCount / 2)) {
    return 1
  }
  if (current >= pageCount - Math.floor(pagerCount / 2)) {
    return pageCount - visible
  }
  return current - Math.floor(visible / 2)
})

const visiblePages = computed(() => {
  const count = visiblePagerCount.value
  const start = offset.value
  const pages: number[] = []
  for (let i = 0; i < count; i++) {
    const p = start + i
    if (p > 1 && p < props.totalPages) {
      pages.push(p)
    }
  }
  return pages
})

const showPrevMore = computed(() => {
  const current = props.currentPage + 1
  return props.totalPages > maxPagerCount.value &&
    current > Math.ceil(maxPagerCount.value / 2)
})

const showNextMore = computed(() => {
  const current = props.currentPage + 1
  return props.totalPages > maxPagerCount.value &&
    current < props.totalPages - Math.floor(maxPagerCount.value / 2)
})

function jumpBackward(): void {
  const target = props.currentPage - visiblePagerCount.value
  if (target >= 0) {
    emit('go-page', target)
  }
}

function jumpForward(): void {
  const target = props.currentPage + visiblePagerCount.value
  if (target < props.totalPages) {
    emit('go-page', target)
  }
}
</script>

<style scoped>
.pagination { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 12px 0; }
.page-btn {
  width: 32px; height: 32px; border: 1px solid var(--border-color);
  background: transparent; color: var(--text-muted); cursor: pointer;
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}
.page-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--text-primary); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-num {
  min-width: 32px; height: 32px; border: 1px solid var(--border-color);
  background: transparent; color: var(--text-muted); cursor: pointer;
  border-radius: var(--radius-sm); font-size: 13px; padding: 0 4px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.page-num:hover { border-color: var(--brand); color: var(--text-primary); }
.page-num.active { background: var(--bg-active); color: var(--brand); border-color: var(--brand); }
.page-ellipsis {
  color: var(--text-muted); font-size: 13px; padding: 0 4px;
  user-select: none; cursor: pointer; min-width: 20px;
  text-align: center; transition: color 0.15s;
}
.page-ellipsis:hover { color: var(--brand); }
</style>
