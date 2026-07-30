<template>
  <div class="rss-page">
    <header class="page-header">
      <h1 class="page-title">订阅</h1>
      <p class="page-subtitle">管理订阅源，获取更新</p>
    </header>

    <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center">
      <input v-model="searchKey" type="text" placeholder="搜索订阅源..." class="input-search" style="flex:1;max-width:320px" @input="filterSources" />
      <button class="btn-primary" style="padding:6px 14px;font-size:13px" @click="showImportDialog">导入</button>
      <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="importDefault">恢复默认</button>
    </div>

    <div v-if="filteredSources.length > 0" class="rss-list">
      <div
        v-for="source in filteredSources"
        :key="source.sourceUrl"
        class="rss-card"
        @click="openSource(source)"
      >
        <div class="rss-card-left">
          <img v-if="source.sourceIcon" :src="source.sourceIcon" class="rss-icon" @error="(e) => (e.target as HTMLImageElement).style.display = 'none'" />
          <div v-else class="rss-icon-placeholder">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <div class="rss-info">
            <h4 class="rss-name">{{ source.sourceName }}</h4>
            <p class="rss-meta">
              <span v-if="source.sourceGroup" class="rss-group">{{ source.sourceGroup }}</span>
              <span v-if="source.sourceComment" class="rss-comment">{{ source.sourceComment }}</span>
            </p>
          </div>
        </div>
        <div class="rss-card-right" @click.stop>
          <button class="btn-icon" @click="editSource(source)" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" @click="toggleEnabled(source)" :title="source.enabled ? '禁用' : '启用'">
            <svg v-if="source.enabled" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button class="btn-icon" @click="deleteSource(source)" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>暂无订阅源</p>
      <p style="font-size:13px;color:var(--text-muted)">点击"导入"添加订阅源，或"恢复默认"加载内置源</p>
    </div>

    <n-modal v-model:show="showImportModal" preset="dialog" title="导入订阅源" positive-text="导入" @positive-click="doImport">
      <n-input v-model:value="importJsonText" type="textarea" placeholder="粘贴订阅源 JSON..." :autosize="{ minRows: 8, maxRows: 16 }" />
    </n-modal>

    <n-modal v-model:show="showEditModal" preset="dialog" title="编辑订阅源" positive-text="保存" @positive-click="doEditSave">
      <n-input v-model:value="editSourceName" placeholder="名称" style="margin-bottom:8px" />
      <n-input v-model:value="editSourceUrl" placeholder="URL" style="margin-bottom:8px" />
      <n-input v-model:value="editSourceGroup" placeholder="分组" style="margin-bottom:8px" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, NModal, NInput } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { store } from '@/api'
import type { RssSource } from '@shared/types'

const router = useRouter()
const message = useMessage()

const DEFAULT_RSS_SOURCES: RssSource[] = [
  {
    sourceName: '规则订阅', sourceUrl: 'https://www.yckceo.com/',
    sourceIcon: 'https://www.yck2026.top/favicon.ico', sourceGroup: 'legado', sourceComment: '源仓库',
    enabled: true, singleUrl: true, articleStyle: 0, customOrder: 0,
    enableJs: true, loadWithBaseUrl: true, enabledCookieJar: true,
  },
  {
    sourceName: '乌云净化', sourceUrl: 'https://www.lanzoux.com/b0bw8jwoh',
    sourceIcon: 'https://cdn.jsdelivr.net/gh/gedoor/legado@master/app/src/main/res/mipmap-hdpi/ic_launcher.png',
    sourceGroup: 'legado', sourceComment: '阅读规则净化',
    enabled: true, singleUrl: true, articleStyle: 0, customOrder: 5,
    enableJs: true, loadWithBaseUrl: true, enabledCookieJar: true,
  },
]

const sources = ref<RssSource[]>([])
const searchKey = ref('')
const filteredSources = computed(() => {
  if (!searchKey.value.trim()) return sources.value
  const kw = searchKey.value.trim().toLowerCase()
  return sources.value.filter(s =>
    s.sourceName.toLowerCase().includes(kw) ||
    (s.sourceGroup || '').toLowerCase().includes(kw) ||
    (s.sourceComment || '').toLowerCase().includes(kw)
  )
})

const showImportModal = ref(false)
const importJsonText = ref('')
const showEditModal = ref(false)
const editingSource = ref<RssSource | null>(null)
const editSourceName = ref('')
const editSourceUrl = ref('')
const editSourceGroup = ref('')

async function loadSources() {
  try { const data = await store.get('rssSources'); sources.value = Array.isArray(data) ? data : [] } catch { sources.value = [] }
}
async function saveSources() { await store.set('rssSources', sources.value) }

async function importDefault() {
  const existing = new Set(sources.value.map(s => s.sourceUrl))
  const toAdd = DEFAULT_RSS_SOURCES.filter(s => !existing.has(s.sourceUrl))
  if (toAdd.length === 0) { message.info('内置订阅源已存在'); return }
  sources.value = [...sources.value, ...toAdd]; await saveSources()
  message.success(`已导入 ${toAdd.length} 个内置订阅源`)
}
function showImportDialog() { importJsonText.value = ''; showImportModal.value = true }
async function doImport() {
  if (!importJsonText.value.trim()) { message.warning('请粘贴订阅源 JSON'); return }
  try {
    const data = JSON.parse(importJsonText.value); const items: any[] = Array.isArray(data) ? data : [data]
    let count = 0; const existing = new Set(sources.value.map(s => s.sourceUrl))
    for (const item of items) { if (!existing.has(item.sourceUrl)) { sources.value.push(item); existing.add(item.sourceUrl); count++ } }
    await saveSources(); showImportModal.value = false; message.success(`已导入 ${count} 个订阅源`)
  } catch { message.error('JSON 解析失败') }
}
function openSource(source: RssSource) {
  if (source.startHtml) { router.push({ name: 'rss-articles', query: { sourceUrl: source.sourceUrl } }); return }
  if (source.ruleArticles) { router.push({ name: 'rss-articles', query: { sourceUrl: source.sourceUrl } }); return }
  invoke('rss_open_url', { url: source.sourceUrl, title: source.sourceName }).catch(() => {})
}
function toggleEnabled(source: RssSource) { source.enabled = !source.enabled; saveSources() }
function editSource(source: RssSource) {
  editingSource.value = source; editSourceName.value = source.sourceName
  editSourceUrl.value = source.sourceUrl; editSourceGroup.value = source.sourceGroup || ''; showEditModal.value = true
}
async function doEditSave() {
  if (!editingSource.value) return
  editingSource.value.sourceName = editSourceName.value.trim()
  editingSource.value.sourceUrl = editSourceUrl.value.trim()
  editingSource.value.sourceGroup = editSourceGroup.value.trim() || null
  await saveSources(); showEditModal.value = false; message.success('已保存')
}
async function deleteSource(source: RssSource) {
  sources.value = sources.value.filter(s => s.sourceUrl !== source.sourceUrl); await saveSources()
}

loadSources()
</script>

<style scoped>
.rss-page { position: relative; z-index: 1; }
.rss-list { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.rss-card { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-card); cursor: pointer; transition: background 0.18s; min-height: 56px; }
.rss-card:hover { background: var(--bg-hover); }
.rss-card-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.rss-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; }
.rss-icon-placeholder { width: 36px; height: 36px; border-radius: var(--radius-sm); background: var(--bg-hover); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; }
.rss-info { min-width: 0; }
.rss-name { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rss-meta { font-size: 12px; color: var(--text-muted); margin: 2px 0 0; display: flex; gap: 8px; }
.rss-group { color: var(--brand); background: var(--bg-active); padding: 1px 8px; border-radius: var(--radius-sm); font-size: 11px; }
.rss-comment { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.rss-card-right { display: flex; gap: 4px; flex-shrink: 0; }
.btn-icon { width: 32px; height: 32px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: color 0.18s, background 0.18s; }
.btn-icon:hover { color: var(--text-primary); background: var(--bg-hover); }
</style>
