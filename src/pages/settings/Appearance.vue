<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>外观</h2>
    </header>
    <div class="theme-grid">
      <button
        v-for="theme in themeOptions"
        :key="theme.value"
        class="theme-card"
        :class="{ active: currentTheme === theme.value }"
        @click="setTheme(theme.value)"
      >
        <div class="theme-preview" :class="theme.value">
          <template v-if="theme.value === 'system'">
            <div class="sys-left">
              <div class="sys-dot-row"><span class="sys-dot"></span><span class="sys-dot"></span><span class="sys-dot"></span></div>
              <div class="sys-nav"></div>
              <div class="sys-content">
                <div class="sys-line"></div>
                <div class="sys-line short"></div>
                <div class="sys-line"></div>
              </div>
            </div>
            <div class="sys-divider"></div>
            <div class="sys-right">
              <div class="sys-dot-row"><span class="sys-dot light"></span><span class="sys-dot light"></span><span class="sys-dot light"></span></div>
              <div class="sys-nav light-bg"></div>
              <div class="sys-content">
                <div class="sys-line dark"></div>
                <div class="sys-line dark short"></div>
                <div class="sys-line dark"></div>
              </div>
            </div>
          </template>
          <template v-else-if="theme.value === 'dark'">
            <div class="preview-window">
              <div class="preview-titlebar"><span class="preview-dot"></span><span class="preview-dot"></span><span class="preview-dot"></span></div>
              <div class="preview-sidebar"></div>
              <div class="preview-body">
                <div class="preview-line"></div>
                <div class="preview-line short"></div>
                <div class="preview-line shorter"></div>
                <div class="preview-line"></div>
                <div class="preview-line short"></div>
              </div>
            </div>
          </template>
          <template v-else-if="theme.value === 'light'">
            <div class="preview-window light-window">
              <div class="preview-titlebar"><span class="preview-dot light-d"></span><span class="preview-dot light-d"></span><span class="preview-dot light-d"></span></div>
              <div class="preview-sidebar light-sidebar"></div>
              <div class="preview-body">
                <div class="preview-line light-l"></div>
                <div class="preview-line light-l short"></div>
                <div class="preview-line light-l shorter"></div>
                <div class="preview-line light-l"></div>
                <div class="preview-line light-l short"></div>
              </div>
            </div>
          </template>
          <template v-else-if="theme.value === 'sepia'">
            <div class="preview-window sepia-window">
              <div class="preview-titlebar"><span class="preview-dot sepia-d"></span><span class="preview-dot sepia-d"></span><span class="preview-dot sepia-d"></span></div>
              <div class="preview-sidebar sepia-sidebar"></div>
              <div class="preview-body">
                <div class="preview-line sepia-l"></div>
                <div class="preview-line sepia-l short"></div>
                <div class="preview-line sepia-l shorter"></div>
                <div class="preview-line sepia-l"></div>
                <div class="preview-line sepia-l short"></div>
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
import { useReadingStore } from '@/store'
import { THEME_OPTIONS } from '@shared/constants'
import BackButton from '@/components/BackButton.vue'

const readingStore = useReadingStore()
const currentTheme = computed({ get: () => readingStore.theme, set: (val: string) => readingStore.setTheme(val) })
const themeOptions = THEME_OPTIONS

function setTheme(value: string) {
  readingStore.setTheme(value)
  const root = document.documentElement
  if (value === 'system') {
    root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', value)
  }
}
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

.theme-preview {
  height: 120px; border-radius: var(--radius-lg); border: 2px solid var(--border-color);
  transition: transform 0.25s, border-color 0.25s; overflow: hidden;
}

/* 深色 / 浅色 / 护眼 通用窗口样式 */
.preview-window {
  width: 100%; height: 100%; background: #1a1a1a; padding: 8px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box;
}
.preview-window.light-window { background: #f5f5f5; }
.preview-window.sepia-window { background: #f4ecd8; }

.preview-titlebar { display: flex; gap: 4px; padding: 4px 0; }
.preview-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
.preview-dot.light-d { background: #ccc; }
.preview-dot.sepia-d { background: #b8a088; }

.preview-sidebar { width: 30%; height: 4px; border-radius: 2px; background: #333; margin-bottom: 4px; }
.preview-sidebar.light-sidebar { background: #ddd; }
.preview-sidebar.sepia-sidebar { background: #d9cdb3; }

.preview-body { flex: 1; display: flex; flex-direction: column; gap: 5px; padding-left: 35%; }
.preview-line { height: 6px; border-radius: 3px; background: #444; width: 100%; }
.preview-line.short { width: 75%; }
.preview-line.shorter { width: 55%; }

.preview-line.light-l { background: #ccc; }
.preview-line.sepia-l { background: #c4b592; }

/* 跟随系统 */
.theme-preview.system {
  display: flex; flex-direction: row; padding: 0; position: relative;
}
.sys-left, .sys-right { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 8px; }
.sys-left { background: #1a1a1a; border-radius: var(--radius-lg) 0 0 var(--radius-lg); }
.sys-right { background: #f5f5f5; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }
.sys-divider { width: 2px; background: var(--border-color); flex-shrink: 0; }

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
