<template>
  <div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>外观</h2></header>
    <div class="theme-grid">
      <button v-for="theme in themeOptions" :key="theme.value" class="theme-card" :class="{ active: currentTheme === theme.value }" @click="setTheme(theme.value)">
        <div class="theme-preview" :class="theme.value">
          <template v-if="theme.value === 'system'">
            <div class="sys-left"><div class="sys-dot-row"><span class="sys-dot"></span><span class="sys-dot"></span><span class="sys-dot"></span></div><div class="sys-nav"></div><div class="sys-content"><div class="sys-line"></div><div class="sys-line short"></div><div class="sys-line"></div></div></div>
            <div class="sys-divider"></div>
            <div class="sys-right"><div class="sys-dot-row"><span class="sys-dot light"></span><span class="sys-dot light"></span><span class="sys-dot light"></span></div><div class="sys-nav light-bg"></div><div class="sys-content"><div class="sys-line dark"></div><div class="sys-line dark short"></div><div class="sys-line dark"></div></div></div>
          </template>
          <template v-else-if="theme.value === 'dark'">
            <div class="preview-bg preview-bg-dark">
              <div class="preview-dots"><span class="preview-dot-d"></span><span class="preview-dot-d"></span><span class="preview-dot-d"></span></div>
              <div class="preview-sidebar preview-sidebar-dark"></div>
              <div class="preview-lines">
                <div class="preview-line preview-line-dark"></div><div class="preview-line preview-line-dark short"></div><div class="preview-line preview-line-dark shorter"></div><div class="preview-line preview-line-dark"></div><div class="preview-line preview-line-dark short"></div>
              </div>
            </div>
          </template>
          <template v-else-if="theme.value === 'light'">
            <div class="preview-bg preview-bg-light">
              <div class="preview-dots"><span class="preview-dot-l"></span><span class="preview-dot-l"></span><span class="preview-dot-l"></span></div>
              <div class="preview-sidebar preview-sidebar-light"></div>
              <div class="preview-lines">
                <div class="preview-line preview-line-light"></div><div class="preview-line preview-line-light short"></div><div class="preview-line preview-line-light shorter"></div><div class="preview-line preview-line-light"></div><div class="preview-line preview-line-light short"></div>
              </div>
            </div>
          </template>
          <template v-else-if="theme.value === 'sepia'">
            <div class="preview-bg preview-bg-sepia">
              <div class="preview-dots"><span class="preview-dot-s"></span><span class="preview-dot-s"></span><span class="preview-dot-s"></span></div>
              <div class="preview-sidebar preview-sidebar-sepia"></div>
              <div class="preview-lines">
                <div class="preview-line preview-line-sepia"></div><div class="preview-line preview-line-sepia short"></div><div class="preview-line preview-line-sepia shorter"></div><div class="preview-line preview-line-sepia"></div><div class="preview-line preview-line-sepia short"></div>
              </div>
            </div>
          </template>
        </div>
        <span>{{ theme.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReadingStore } from '@/stores/reading.js'
import { THEME_OPTIONS } from '@/constants/index.js'
import BackButton from '@/components/common/BackButton.vue'

const readingStore = useReadingStore()
const currentTheme = computed({ get: () => readingStore.theme, set: (val: string) => readingStore.setTheme(val) })
const themeOptions = THEME_OPTIONS
function setTheme(value: string): void { readingStore.setTheme(value) }
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.theme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.theme-card { cursor: pointer; text-align: center; background: transparent; border: none; padding: 0; color: var(--text-secondary); }
.theme-card.active .theme-preview { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.theme-card.active span { color: var(--brand); }
.theme-card span { font-size: 14px; display: block; margin-top: 12px; font-weight: 500; }
.theme-preview { height: 120px; border-radius: var(--radius-lg); border: 2px solid var(--border-color); overflow: hidden; }

.preview-bg { width: 100%; height: 100%; padding: 10px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
.preview-bg-dark { background: #1a1a1a; }
.preview-bg-light { background: #f5f5f5; }
.preview-bg-sepia { background: #f4ecd8; }
.preview-dots { display: flex; gap: 4px; }
.preview-dot-d { width: 8px; height: 8px; border-radius: 50%; background: #555; }
.preview-dot-l { width: 8px; height: 8px; border-radius: 50%; background: #ccc; }
.preview-dot-s { width: 8px; height: 8px; border-radius: 50%; background: #b8a088; }
.preview-sidebar { width: 30%; height: 6px; border-radius: 3px; margin-bottom: 4px; }
.preview-sidebar-dark { background: #333; }
.preview-sidebar-light { background: #ddd; }
.preview-sidebar-sepia { background: #d9cdb3; }
.preview-lines { flex: 1; display: flex; flex-direction: column; gap: 5px; padding-left: 35%; }
.preview-line { height: 6px; border-radius: 3px; width: 100%; }
.preview-line.short { width: 75%; }
.preview-line.shorter { width: 55%; }
.preview-line-dark { background: #444; }
.preview-line-light { background: #ccc; }
.preview-line-sepia { background: #c4b592; }

.theme-preview.system { display: flex; flex-direction: row; padding: 0; }
.sys-left, .sys-right { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 8px; }
.sys-left { background: #1a1a1a; border-radius: var(--radius-lg) 0 0 var(--radius-lg); }
.sys-right { background: #f5f5f5; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }
.sys-divider { width: 2px; background: rgba(255,255,255,0.08); flex-shrink: 0; }
.sys-dot-row { display: flex; gap: 5px; }
.sys-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
.sys-dot.light { background: #ccc; }
.sys-nav { height: 6px; border-radius: 3px; background: #333; width: 50%; }
.sys-nav.light-bg { background: #ddd; }
.sys-content { display: flex; flex-direction: column; gap: 5px; }
.sys-line { height: 5px; border-radius: 3px; background: #444; width: 100%; }
.sys-line.short { width: 65%; }
.sys-line.dark { background: #bbb; }
</style>
