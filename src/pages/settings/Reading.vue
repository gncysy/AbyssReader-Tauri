<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>阅读</h2>
    </header>
    <div class="setting-item">
      <div><span class="label-text">字体大小</span><span class="label-desc">{{ fontSize }}px</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="size-btn" @click="decreaseFontSize">A−</button>
        <span style="font-size:15px;color:var(--text-secondary);min-width:36px;text-align:center">{{ fontSize }}</span>
        <button class="size-btn" @click="increaseFontSize">A+</button>
      </div>
    </div>
    <div class="setting-item">
      <div><span class="label-text">行间距</span><span class="label-desc">{{ lineHeight.toFixed(1) }}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="size-btn" @click="decreaseLineHeight">−</button>
        <span style="font-size:15px;color:var(--text-secondary);min-width:36px;text-align:center">{{ lineHeight.toFixed(1) }}</span>
        <button class="size-btn" @click="increaseLineHeight">+</button>
      </div>
    </div>
    <div class="setting-item">
      <div>
        <span class="label-text">简繁转换</span>
        <span class="label-desc">{{ chineseConverterLabel }}</span>
      </div>
      <div class="option-group">
        <button
          v-for="opt in chineseConverterOptions"
          :key="opt.value"
          class="option-btn"
          :class="{ active: chineseConverterType === opt.value }"
          @click="setChineseConverterType(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>
    <div class="setting-item">
      <div>
        <span class="label-text">段落重排</span>
        <span class="label-desc">智能重排段落，修复错误分段</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" :checked="reSegment" @change="setReSegment(($event.target as HTMLInputElement).checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReadingStore } from '@/store'
import BackButton from '@/components/BackButton.vue'

const readingStore = useReadingStore()
const fontSize = computed({
  get: () => readingStore.fontSize,
  set: (val: number) => readingStore.setFontSize(val)
})
const lineHeight = computed({
  get: () => readingStore.lineHeight,
  set: (val: number) => readingStore.setLineHeight(val)
})
const chineseConverterType = computed(() => readingStore.chineseConverterType)
const reSegment = computed(() => readingStore.reSegment)

const chineseConverterOptions = [
  { label: '不转换', value: 0 },
  { label: '繁 → 简', value: 1 },
  { label: '简 → 繁', value: 2 },
]
const chineseConverterLabel = computed(() => {
  const opt = chineseConverterOptions.find(o => o.value === chineseConverterType.value)
  return opt ? opt.label : '不转换'
})

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function increaseLineHeight() { readingStore.increaseLineHeight() }
function decreaseLineHeight() { readingStore.decreaseLineHeight() }
function setChineseConverterType(val: number) { readingStore.setChineseConverterType(val) }
function setReSegment(val: boolean) { readingStore.setReSegment(val) }
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px; }
.size-btn { padding: 6px 14px; font-size: 15px; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; min-width: 42px; }
.size-btn:hover { border-color: var(--brand); color: var(--text-primary); background: var(--bg-hover); }
.option-group { display: flex; gap: 4px; }
.option-btn { padding: 6px 12px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.option-btn:hover { color: var(--text-primary); border-color: var(--brand); }
.option-btn.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
</style>
