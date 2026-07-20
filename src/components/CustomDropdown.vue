<template>
  <div class="custom-dropdown" :class="{ open: isOpen }" ref="dropdownRef">
    <div class="custom-dropdown-trigger" @click="toggle" tabindex="0" @keydown.enter="toggle" @keydown.space.prevent="toggle">
      <span>{{ selectedLabel || placeholder }}</span>
      <span class="custom-dropdown-arrow">▼</span>
    </div>
    <div v-if="isOpen" class="custom-dropdown-menu">
      <div
        v-for="opt in options"
        :key="opt.value"
        class="custom-dropdown-item"
        :class="{ active: modelValue === opt.value }"
        @click="select(opt.value)"
        @keydown.enter="select(opt.value)"
        tabindex="0"
      >{{ opt.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string | number
  options: { label: string; value: string | number }[]
  placeholder?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string | number): void }>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt ? opt.label : null
})

function toggle() { isOpen.value = !isOpen.value }
function select(value: string | number) { emit('update:modelValue', value); isOpen.value = false }

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as HTMLElement)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>
