<template>
  <Transition name="toc-popup">
    <div v-if="visible" class="toc-popup-overlay" @click.self="close">
      <div class="toc-popup-container">
        <div class="toc-popup-header">
          <span>目录 ({{ totalChapters }} 章)</span>
          <button class="toc-popup-close" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="toc-popup-list">
          <ChapterItem v-for="ch in pageChapters" :key="ch.id" :chapter="ch" :active="ch.id === currentChapterId" @click="select(ch)" />
        </div>
        <Pagination :current-page="currentPage - 1" :total-pages="totalPages" @go-page="goPage($event + 1)" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Chapter } from '@/types'
import ChapterItem from '@/components/chapter/ChapterItem.vue'
import Pagination from '@/components/common/Pagination.vue'

const props = defineProps<{ chapters: Chapter[]; currentChapterId: number | null }>()
const emit = defineEmits<{ select: [chapter: Chapter]; close: [] }>()

const visible = ref(false)
const currentPage = ref(1)
const pageSize = 10

const totalChapters = computed(() => props.chapters.length)
const totalPages = computed(() => Math.ceil(totalChapters.value / pageSize))

const pageChapters = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return props.chapters.slice(start, start + pageSize)
})

function open(chapterId: number | null): void {
  visible.value = true
  if (chapterId !== null && chapterId !== undefined) {
    const idx = props.chapters.findIndex((ch) => ch.id === chapterId)
    if (idx !== -1) currentPage.value = Math.floor(idx / pageSize) + 1
  }
}

function close(): void { visible.value = false; emit('close') }
function select(ch: Chapter): void { emit('select', ch) }
function goPage(p: number): void { if (p >= 1 && p <= totalPages.value) currentPage.value = p }

defineExpose({ open, close })
</script>

<style scoped>
.toc-popup-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); }
.toc-popup-container { width: 480px; max-height: 70vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); display: flex; flex-direction: column; overflow: hidden; }
.toc-popup-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-color); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.toc-popup-close { width: 32px; height: 32px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.toc-popup-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.toc-popup-list { flex: 1; overflow-y: auto; padding: 8px 0; }
.toc-popup-enter-active, .toc-popup-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toc-popup-enter-from, .toc-popup-leave-to { opacity: 0; transform: scale(0.95); }
</style>
