<template>
  <div class="filter-bar">
    <button
      v-for="group in groups"
      :key="group.value"
      class="filter-tab"
      :class="{ active: modelValue === group.value }"
      @click="$emit('update:modelValue', group.value)"
    >{{ group.label }}</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ groups: { label: string; value: string }[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<style scoped>
.filter-bar { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-tab {
  padding: 5px 14px; font-size: 13px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; font-weight: 500;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.filter-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.filter-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
</style>
