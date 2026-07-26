<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-notification-provider>
        <n-dialog-provider>
          <div class="app-shell" :data-theme="effectiveTheme">
            <div class="titlebar" :data-theme="effectiveTheme" @dblclick="toggleMaximize">
              <div class="titlebar-drag"></div>
              <div class="titlebar-controls">
                <button class="titlebar-btn" @click="minimizeWindow" title="最小化">
                  <svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                </button>
                <button class="titlebar-btn" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
                  <svg v-if="!isMaximized" width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 14 14"><rect x="4.5" y="2" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="2" y="4.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="var(--bg-card)"/></svg>
                </button>
                <button class="titlebar-btn titlebar-btn-close" @click="closeWindow" title="关闭">
                  <svg width="14" height="14" viewBox="0 0 14 14"><line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="10.5" y1="3.5" x2="3.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>

            <div class="app-body">
              <nav class="app-sidebar" aria-label="主导航">
                <div class="sidebar-logo">
                  <img src="/icons/icon.svg" alt="墨阅" class="logo-icon" />
                  <span class="logo-text">墨阅</span>
                </div>
                <div class="sidebar-menu" role="navigation">
                  <div v-for="item in navItems" :key="item.route" class="nav-item" :class="{ active: currentRoute === item.route }" role="button" @click="navigate(item.route)">
                    <n-icon :size="20" class="nav-icon"><component :is="item.icon" /></n-icon>
                    <span class="nav-label">{{ item.label }}</span>
                  </div>
                </div>
                <div class="sidebar-footer">
                  <div class="footer-version">v{{ appVersion }}</div>
                </div>
              </nav>

              <main class="app-main">
                <router-view v-slot="{ Component }">
                  <transition name="page" mode="out-in">
                    <component :is="Component" />
                  </transition>
                </router-view>

                <BookDetail v-if="bookshelfStore.showDetail" :book="bookshelfStore.detailBook ? JSON.parse(JSON.stringify(bookshelfStore.detailBook)) : null" :source="bookshelfStore.detailSource ? JSON.parse(JSON.stringify(bookshelfStore.detailSource)) : null" @close="bookshelfStore.closeDetail()" />
                <Reader v-if="bookshelfStore.showReader" :book="bookshelfStore.readerBook ? JSON.parse(JSON.stringify(bookshelfStore.readerBook)) : null" :source="bookshelfStore.readerSource ? JSON.parse(JSON.stringify(bookshelfStore.readerSource)) : null" :initial-chapters="bookshelfStore.readerChapters" @close="bookshelfStore.closeReader()" />
                <PhotoViewer ref="photoViewer" />
              </main>
            </div>
          </div>
        </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onLog, initLogBridge } from '../engine/event/index.js'
import PhotoViewer from './components/PhotoViewer.vue'
import { darkTheme, lightTheme, zhCN, dateZhCN, NIcon } from 'naive-ui'
import { BookOutline, SearchOutline, CompassOutline, CloudOutline, SettingsOutline, AppsOutline } from '@vicons/ionicons5'
import { useBookshelfStore, useReadingStore } from '@/store'
import { ROUTES, APP_VERSION } from '@shared/constants'
import BookDetail from '@/components/BookDetail.vue'
import Reader from '@/components/Reader.vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

const route = useRoute()
const router = useRouter()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()
const currentRoute = computed(() => route.name)

const currentTheme = computed({ get: () => readingStore.theme, set: (val: string) => readingStore.setTheme(val) })

const appVersion = APP_VERSION
const effectiveTheme = ref('dark')
const photoViewer = ref<InstanceType<typeof PhotoViewer> | null>(null)
const isMaximized = ref(false)

function resolveEffectiveTheme(theme: string): string {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return theme
}

function applyThemeToDOM(theme: string) {
  const resolved = resolveEffectiveTheme(theme)
  document.documentElement.setAttribute('data-theme', resolved)
  effectiveTheme.value = resolved
}

function setTheme(theme: string) {
  readingStore.setTheme(theme)
  applyThemeToDOM(theme)
}

const theme = computed(() => currentTheme.value === 'dark' || currentTheme.value === 'system' ? darkTheme : lightTheme)

const themeOverrides = { common: { primaryColor: '#d4a017', primaryColorHover: '#e8c547', primaryColorPressed: '#b8860b', primaryColorSuppl: '#d4a017' } }

const navItems = [
  { route: ROUTES.BOOKSHELF, icon: BookOutline, label: '书架' },
  { route: ROUTES.SEARCH, icon: SearchOutline, label: '搜索' },
  { route: ROUTES.EXPLORE, icon: CompassOutline, label: '发现' },
  { route: ROUTES.MARKET, icon: CloudOutline, label: '书源市场' },
  { route: ROUTES.SOURCES, icon: AppsOutline, label: '书源管理' },
  { route: ROUTES.SETTINGS, icon: SettingsOutline, label: '设置' },
]

function navigate(routeName: string) { if (routeName !== currentRoute.value) router.push({ name: routeName }).catch(() => {}) }
function minimizeWindow() { getCurrentWindow().minimize() }

async function toggleMaximize() {
  const win = getCurrentWindow()
  if (await win.isMaximized()) {
    await win.unmaximize()
  } else {
    await win.maximize()
  }
}

async function updateMaximizedState() {
  const win = getCurrentWindow()
  isMaximized.value = await win.isMaximized()
}

function closeWindow() { getCurrentWindow().close() }
function handleSystemThemeChange() { if (currentTheme.value === 'system') applyThemeToDOM('system') }

let mediaQuery: MediaQueryList | null = null

onMounted(async () => {
  await initLogBridge()
  await readingStore.loadSettings()
  applyThemeToDOM(currentTheme.value)
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleSystemThemeChange)
  await updateMaximizedState()
  window.addEventListener('resize', updateMaximizedState)
})

onUnmounted(() => {
  if (mediaQuery) mediaQuery.removeEventListener('change', handleSystemThemeChange)
  window.removeEventListener('resize', updateMaximizedState)
})

watch(currentTheme, val => applyThemeToDOM(val))
</script>

<style scoped>
.app-shell { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--bg-card); color: var(--text-primary); transition: background 0.3s ease, color 0.3s ease; }
.titlebar { display: flex; align-items: stretch; height: 40px; min-height: 40px; background: var(--bg-card); flex-shrink: 0; z-index: 20; }
.titlebar-drag { flex: 1; height: 100%; user-select: none; -webkit-app-region: drag; }
.titlebar-controls { display: flex; gap: 0; flex-shrink: 0; height: 100%; -webkit-app-region: no-drag; }
.titlebar-btn { width: 46px; height: 100%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.titlebar-btn svg { opacity: 0.7; }
.titlebar-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.titlebar-btn:hover svg { opacity: 1; }
.titlebar-btn-close:hover { background: #c0392b; color: #fff; }
.app-body { display: flex; flex: 1; height: calc(100vh - 40px); overflow: hidden; }
.app-sidebar { display: flex; flex-direction: column; width: 200px; min-width: 200px; padding: 20px 16px; background: var(--bg-card); border-right: 1px solid var(--border-color); flex-shrink: 0; height: 100%; box-sizing: border-box; }
.sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 0 8px 28px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.logo-icon { width: 28px; height: 28px; flex-shrink: 0; }
.logo-text { font-size: 16px; font-weight: 600; color: var(--text-primary); letter-spacing: 0.04em; }
.sidebar-menu { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer; min-height: 44px; transition: background 0.2s, color 0.2s; color: var(--text-muted); }
.nav-item:hover { background: var(--bg-hover); color: var(--text-secondary); }
.nav-item.active { background: var(--bg-active); color: var(--brand); font-weight: 500; }
.nav-item.active .nav-icon { color: var(--brand); }
.nav-icon { flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: 500; }
.sidebar-footer { padding-top: 16px; border-top: 1px solid var(--border-color); margin-top: auto; text-align: center; }
.footer-version { font-size: 12px; color: var(--text-muted); opacity: 0.45; }
.app-main { flex: 1; position: relative; overflow-y: auto; padding: 32px 40px 40px; background: var(--bg); min-width: 0; height: 100%; box-sizing: border-box; }
.page-enter-active, .page-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
