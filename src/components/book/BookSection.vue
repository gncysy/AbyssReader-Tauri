<template>
  <div class="book-section">
    <div class="section-header">
      <h3>{{ title }}</h3>
      <span class="section-count">{{ count }} 本</span>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; count: number }>()
</script>

<style scoped>
.book-section { margin-bottom: 36px; }
.section-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); margin-bottom: 14px; }
.section-header h3 { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.section-count { font-size: 13px; color: var(--text-muted); }
</style>
