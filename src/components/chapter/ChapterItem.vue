<template>
  <div class="chapter-item" :class="{ active }" @click="$emit('click')">
    <span class="chapter-title">{{ chapter.title }}</span>
    <span v-if="chapter.isVip" class="badge badge-vip">VIP</span>
  </div>
</template>

<script setup lang="ts">
import type { Chapter } from '@/types'
defineProps<{ chapter: Chapter; active?: boolean }>()
defineEmits<{ click: [] }>()
</script>

<style scoped>
.chapter-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.18s; min-height: 42px;
}
.chapter-item:hover { background: var(--bg-hover); }
.chapter-item.active { background: var(--bg-active); }
.chapter-item.active .chapter-title { color: var(--brand); }
.chapter-title { font-size: 14px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
