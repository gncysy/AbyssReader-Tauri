<template>
  <div class="empty-state">
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<style scoped>
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 68px 0; text-align: center;
}
.empty-state h3 { font-size: 20px; color: var(--text-secondary); font-weight: 500; margin-bottom: 8px; }
.empty-state p { font-size: 14px; color: var(--text-muted); margin: 0; }
</style>
