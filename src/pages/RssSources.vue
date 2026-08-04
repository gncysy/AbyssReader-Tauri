<template>
  <div class="rss-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">订阅</h1>
        <p class="page-subtitle">{{ filteredSources.length }} 个订阅源</p>
      </div>
    </header>

    <!-- 工具栏 -->
    <div class="rss-toolbar">
      <div class="toolbar-left">
        <input
          v-model="searchKey"
          type="text"
          placeholder="搜索订阅源..."
          class="input-search"
          style="width:220px"
          @input="filterSources"
        />
        <CustomDropdown
          v-model="selectedGroup"
          :options="groupOptions"
          placeholder="全部分组"
          @update:modelValue="onGroupChange"
          style="min-width:120px"
        />
      </div>
      <div class="toolbar-right">
        <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="showImportDialog">导入 JSON</button>
        <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="triggerFileInput">导入文件</button>
        <input ref="fileInput" type="file" accept=".json,.txt" class="hidden" @change="onFileSelected" />
        <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="importDefault">恢复默认</button>
        <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="exportSources">导出</button>
        <button class="btn-secondary" style="padding:6px 14px;font-size:13px" @click="openGroupManager">分组管理</button>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="selectedCount > 0" class="batch-actions">
      <span style="font-size:13px;color:var(--text-secondary)">已选 {{ selectedCount }} 个</span>
      <button class="btn-secondary btn-sm" @click="batchEnable">启用</button>
      <button class="btn-secondary btn-sm" @click="batchDisable">禁用</button>
      <button class="btn-secondary btn-sm" @click="batchTop">置顶</button>
      <button class="btn-secondary btn-sm" @click="batchBottom">置底</button>
      <button class="btn-danger btn-sm" @click="batchDelete">删除</button>
      <button class="btn-secondary btn-sm" @click="clearSelection">取消选择</button>
    </div>

    <!-- 列表 -->
    <div v-if="filteredSources.length > 0" class="rss-list">
      <div
        v-for="source in filteredSources"
        :key="source.sourceUrl"
        class="rss-card"
        :class="{ selected: isSelected(source.sourceUrl) }"
        @click="toggleSelect(source)"
      >
        <div class="rss-card-left">
          <label class="checkbox-cell" @click.stop>
            <input type="checkbox" :checked="isSelected(source.sourceUrl)" @change="toggleSelect(source)" />
          </label>
          <img v-if="source.sourceIcon" :src="source.sourceIcon" class="rss-icon" @error="(e) => (e.target as HTMLImageElement).style.display = 'none'" />
          <div v-else class="rss-icon-placeholder">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <div class="rss-info" @click.stop>
            <h4 class="rss-name">{{ source.sourceName }}</h4>
            <p class="rss-meta">
              <span v-if="source.sourceGroup" class="rss-group">{{ source.sourceGroup }}</span>
              <span v-if="source.sourceComment" class="rss-comment">{{ source.sourceComment }}</span>
              <span class="rss-status" :class="{ enabled: source.enabled !== false }">{{ source.enabled !== false ? '已启用' : '已禁用' }}</span>
            </p>
          </div>
        </div>
        <div class="rss-card-right" @click.stop>
          <button class="btn-icon" @click="openSource(source)" title="打开">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button class="btn-icon" @click="editSource(source)" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" @click="debugSource(source)" title="调试">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="btn-icon" @click="quickLogin(source)" title="登录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          </button>
          <button class="btn-icon" @click="toggleEnabled(source)" :title="source.enabled ? '禁用' : '启用'">
            <svg v-if="source.enabled" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button class="btn-icon btn-icon-danger" @click="deleteSource(source)" title="删除">
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
      <div style="display:flex;gap:12px;margin-top:8px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary)"><input type="checkbox" v-model="editEnabled" /> 启用</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary)"><input type="checkbox" v-model="editSingleUrl" /> 单页</label>
      </div>
      <div style="margin-top:8px">
        <label style="font-size:13px;color:var(--text-secondary)">样式</label>
        <select v-model="editArticleStyle" class="form-select" style="margin-left:8px;width:auto">
          <option :value="0">列表</option>
          <option :value="1">卡片</option>
          <option :value="2">网格2列</option>
          <option :value="3">瀑布流</option>
          <option :value="4">网格3列</option>
        </select>
      </div>
    </n-modal>

    <RssLogin ref="loginRef" :source="quickLoginSource" @success="onLoginSuccess" />
    <RssGroupManager ref="groupManagerRef" @change="onGroupChange" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, NModal, NInput } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { store } from '@/api'
import CustomDropdown from '@/components/CustomDropdown.vue'
import RssLogin from '@/components/RssLogin.vue'
import RssGroupManager from '@/components/RssGroupManager.vue'
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
const selectedGroup = ref('')
const selectedUrls = ref<Set<string>>(new Set())
const showImportModal = ref(false)
const importJsonText = ref('')
const showEditModal = ref(false)
const editingSource = ref<RssSource | null>(null)
const editSourceName = ref('')
const editSourceUrl = ref('')
const editSourceGroup = ref('')
const editEnabled = ref(true)
const editSingleUrl = ref(false)
const editArticleStyle = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const loginRef = ref<InstanceType<typeof RssLogin> | null>(null)
const groupManagerRef = ref<InstanceType<typeof RssGroupManager> | null>(null)
const quickLoginSource = ref<RssSource | null>(null)

const allGroups = computed(() => {
  const groups = new Set<string>()
  for (const s of sources.value) {
    if (s.sourceGroup) groups.add(s.sourceGroup)
  }
  return Array.from(groups).sort()
})

const groupOptions = computed(() => {
  const opts: { label: string; value: string }[] = [{ label: '全部分组', value: '' }]
  for (const g of allGroups.value) {
    opts.push({ label: g, value: g })
  }
  return opts
})

const filteredSources = computed(() => {
  let result = sources.value
  const kw = searchKey.value.trim().toLowerCase()
  if (kw) {
    result = result.filter(s =>
      s.sourceName.toLowerCase().includes(kw) ||
      (s.sourceGroup || '').toLowerCase().includes(kw) ||
      (s.sourceComment || '').toLowerCase().includes(kw)
    )
  }
  if (selectedGroup.value) {
    result = result.filter(s => s.sourceGroup === selectedGroup.value)
  }
  return result
})

const selectedCount = computed(() => selectedUrls.value.size)

function isSelected(url: string): boolean {
  return selectedUrls.value.has(url)
}

function toggleSelect(source: RssSource) {
  const url = source.sourceUrl
  if (selectedUrls.value.has(url)) {
    selectedUrls.value.delete(url)
  } else {
    selectedUrls.value.add(url)
  }
  selectedUrls.value = new Set(selectedUrls.value)
}

function clearSelection() {
  selectedUrls.value = new Set()
}

function getSelectedSources(): RssSource[] {
  return sources.value.filter(s => selectedUrls.value.has(s.sourceUrl))
}

async function batchEnable() {
  const selected = getSelectedSources()
  for (const s of selected) { s.enabled = true }
  await saveSources()
  clearSelection()
  message.success(`已启用 ${selected.length} 个订阅源`)
}

async function batchDisable() {
  const selected = getSelectedSources()
  for (const s of selected) { s.enabled = false }
  await saveSources()
  clearSelection()
  message.success(`已禁用 ${selected.length} 个订阅源`)
}

async function batchTop() {
  const selected = getSelectedSources()
  const maxOrder = sources.value.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
  for (let i = 0; i < selected.length; i++) {
    selected[i].customOrder = maxOrder + i + 1
  }
  await saveSources()
  clearSelection()
  await loadSources()
  message.success(`已置顶 ${selected.length} 个订阅源`)
}

async function batchBottom() {
  const selected = getSelectedSources()
  const minOrder = sources.value.reduce((min, s) => Math.min(min, s.customOrder || 999), 999)
  for (let i = 0; i < selected.length; i++) {
    selected[i].customOrder = minOrder - i - 1
  }
  await saveSources()
  clearSelection()
  await loadSources()
  message.success(`已置底 ${selected.length} 个订阅源`)
}

async function batchDelete() {
  const selected = getSelectedSources()
  if (selected.length === 0) return
  if (!confirm(`确定删除 ${selected.length} 个订阅源？`)) return
  const urls = new Set(selected.map(s => s.sourceUrl))
  sources.value = sources.value.filter(s => !urls.has(s.sourceUrl))
  await saveSources()
  clearSelection()
  message.success(`已删除 ${selected.length} 个订阅源`)
}

async function loadSources() {
  try {
    const data = await store.get('rssSources')
    sources.value = Array.isArray(data) ? data : []
  } catch {
    sources.value = []
  }
}

async function saveSources() {
  await store.set('rssSources', sources.value)
}

function filterSources() {}

function onGroupChange() {
  loadSources()
}

function openSource(source: RssSource) {
  // 跳转到浏览模式，直接渲染完整网页
  router.push({
    name: 'rss-articles',
    query: {
      sourceUrl: source.sourceUrl,
      mode: 'browse'
    }
  })
}

function toggleEnabled(source: RssSource) {
  source.enabled = !source.enabled
  saveSources()
}

function editSource(source: RssSource) {
  router.push({ name: 'rss-edit', query: { sourceUrl: source.sourceUrl } })
}

function debugSource(source: RssSource) {
  router.push({ name: 'rss-debug', query: { sourceUrl: source.sourceUrl } })
}

function quickLogin(source: RssSource) {
  if (!source.loginUrl && !source.loginUi) {
    message.info('该订阅源未配置登录')
    return
  }
  quickLoginSource.value = source
  loginRef.value?.open(source)
}

function onLoginSuccess() {
  message.success('登录成功')
}

function openGroupManager() {
  groupManagerRef.value?.open()
}

function showEditDialog(source: RssSource) {
  editingSource.value = source
  editSourceName.value = source.sourceName
  editSourceUrl.value = source.sourceUrl
  editSourceGroup.value = source.sourceGroup || ''
  editEnabled.value = source.enabled !== false
  editSingleUrl.value = source.singleUrl || false
  editArticleStyle.value = source.articleStyle || 0
  showEditModal.value = true
}

async function doEditSave() {
  if (!editingSource.value) return
  editingSource.value.sourceName = editSourceName.value.trim()
  editingSource.value.sourceUrl = editSourceUrl.value.trim()
  editingSource.value.sourceGroup = editSourceGroup.value.trim() || null
  editingSource.value.enabled = editEnabled.value
  editingSource.value.singleUrl = editSingleUrl.value
  editingSource.value.articleStyle = editArticleStyle.value
  await saveSources()
  showEditModal.value = false
  message.success('已保存')
}

async function deleteSource(source: RssSource) {
  if (!confirm(`确定删除「${source.sourceName}」？`)) return
  sources.value = sources.value.filter(s => s.sourceUrl !== source.sourceUrl)
  selectedUrls.value.delete(source.sourceUrl)
  await saveSources()
  message.success('已删除')
}

function showImportDialog() {
  importJsonText.value = ''
  showImportModal.value = true
}

async function doImport() {
  if (!importJsonText.value.trim()) {
    message.warning('请粘贴订阅源 JSON')
    return
  }
  try {
    const data = JSON.parse(importJsonText.value)
    const items: any[] = Array.isArray(data) ? data : [data]
    let count = 0
    const existing = new Set(sources.value.map(s => s.sourceUrl))
    for (const item of items) {
      if (item.sourceUrl && !existing.has(item.sourceUrl)) {
        sources.value.push(item)
        existing.add(item.sourceUrl)
        count++
      }
    }
    await saveSources()
    showImportModal.value = false
    message.success(`已导入 ${count} 个订阅源`)
  } catch {
    message.error('JSON 解析失败')
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const items: any[] = Array.isArray(data) ? data : [data]
    let count = 0
    const existing = new Set(sources.value.map(s => s.sourceUrl))
    for (const item of items) {
      if (item.sourceUrl && !existing.has(item.sourceUrl)) {
        sources.value.push(item)
        existing.add(item.sourceUrl)
        count++
      }
    }
    await saveSources()
    message.success(`已从文件导入 ${count} 个订阅源`)
  } catch (err: any) {
    message.error('导入失败: ' + (err.message || '文件格式错误'))
  } finally {
    input.value = ''
  }
}

async function exportSources() {
  if (sources.value.length === 0) {
    message.warning('没有订阅源可导出')
    return
  }
  const json = JSON.stringify(sources.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rss-sources-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  message.success('导出成功')
}

async function importDefault() {
  const existing = new Set(sources.value.map(s => s.sourceUrl))
  const toAdd = DEFAULT_RSS_SOURCES.filter(s => !existing.has(s.sourceUrl))
  if (toAdd.length === 0) {
    message.info('内置订阅源已存在')
    return
  }
  const maxOrder = sources.value.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
  for (let i = 0; i < toAdd.length; i++) {
    toAdd[i].customOrder = (toAdd[i].customOrder || 0) + maxOrder + 1
  }
  sources.value = [...sources.value, ...toAdd]
  await saveSources()
  message.success(`已导入 ${toAdd.length} 个内置订阅源`)
}

onMounted(() => {
  loadSources()
})
</script>

<style scoped>
.rss-page { position: relative; z-index: 1; }

.rss-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-active);
  border: 1px solid rgba(212, 160, 23, 0.25);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
  height: 28px;
}

.rss-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.rss-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  cursor: pointer;
  transition: background 0.18s;
  min-height: 56px;
  border-left: 3px solid transparent;
}
.rss-card:hover {
  background: var(--bg-hover);
}
.rss-card.selected {
  border-left-color: var(--brand);
  background: var(--bg-active);
}

.rss-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.checkbox-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.checkbox-cell input {
  accent-color: var(--brand);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rss-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}
.rss-icon-placeholder {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.rss-info {
  min-width: 0;
  flex: 1;
}
.rss-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rss-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.rss-group {
  color: var(--brand);
  background: var(--bg-active);
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
}
.rss-comment {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.rss-status {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 9999px;
  background: rgba(128,128,128,0.12);
  color: var(--text-muted);
}
.rss-status.enabled {
  background: rgba(76,175,80,0.12);
  color: #4caf50;
}

.rss-card-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.18s, background 0.18s;
}
.btn-icon:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.btn-icon-danger:hover {
  color: #e74c3c;
  background: rgba(231,76,60,0.08);
}
</style>
