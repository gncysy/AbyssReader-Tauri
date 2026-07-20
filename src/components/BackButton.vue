<template>
  <button class="btn-back" @click="handleBack">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
    <span>返回</span>
  </button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  to?: string
}>(), {
  to: '',
})

const emit = defineEmits<{
  click: []
}>()

const router = useRouter()

function handleBack() {
  if (props.to) {
    router.push(props.to).catch(() => {})
  } else {
    router.back()
  }
  emit('click')
}
</script>

<style scoped>
.btn-back {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
}
.btn-back:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--border-color);
}
</style>
