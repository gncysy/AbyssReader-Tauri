<template>
  <div class="source-manager-page">
    <header class="page-header"><div><h1 class="page-title">书源管理</h1><p class="page-subtitle">{{ selectedCount > 0 ? `已选 ${selectedCount} / ${safeSources.length}` : `${filteredList.length} / ${safeSources.length}` }} 个书源</p></div>
      <div class="header-actions">
        <SearchInput v-model="searchText" placeholder="搜索书源..." name="source-search" />
        <CustomDropdown v-model="selectedGroup" :options="groupOptions" placeholder="全部分组" @update:modelValue="onGroupChange" style="min-width:120px" />
        <button class="btn-secondary" @click="triggerFileInput">上传文件</button>
        <button class="btn-secondary" @click="showUrlModal = true">从 URL</button>
        <button class="btn-primary" @click="showJsonModal = true">粘贴 JSON</button>
        <button class="btn-secondary" :disabled="testingAll" @click="testAll">{{ testingAll ? `测试中 ${testProgress}/${safeSources.length}` : '测试全部' }}</button>
        <button class="btn-danger" :disabled="deletingFailed" @click="deleteFailed">{{ deletingFailed ? '删除中...' : '删除失效' }}</button>
      </div>
    </header>
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />
    <div v-if="importing" class="import-bar"><ProgressBar :percent="importProgress" /><span class="import-text">{{ importProgress }}%</span><span class="import-label">{{ importLabel }}</span></div>
    <div class="batch-actions" v-if="selectedIndices.size > 0">
      <span style="font-size:13px;color:var(--text-secondary)">已选 {{ selectedIndices.size }} 个</span>
      <button class="btn-secondary btn-sm" @click="batchEnable">批量启用</button>
      <button class="btn-secondary btn-sm" @click="batchDisable">批量禁用</button>
      <button class="btn-secondary btn-sm" @click="invertSelection">反选</button>
      <button class="btn-danger btn-sm" @click="batchDelete">批量删除</button>
    </div>
    <div v-if="Object.keys(groupedSources).length > 0" class="source-table">
      <div class="table-header"><label class="checkbox-all" @click.stop><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" /></label><span>名称</span><span>分组</span><span>状态</span><span>测试结果</span><span>操作</span></div>
      <div v-for="(group, groupName) in groupedSources" :key="groupName">
        <div class="group-header" @click="toggleGroupCollapse(groupName)"><svg class="group-toggle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline v-if="!collapsedGroups.has(groupName)" points="6 9 12 15 18 9" /><polyline v-else points="9 18 15 12 9 6" /></svg><span class="group-name">{{ groupName || '未分组' }}</span><span class="group-count">{{ group.length }} 个书源</span></div>
        <div v-show="!collapsedGroups.has(groupName)">
          <div v-for="item in group" :key="item.originalIndex" class="table-row" :class="{ selected: selectedIndices.has(item.originalIndex) }">
            <label class="checkbox-cell" @click.stop><input type="checkbox" :checked="selectedIndices.has(item.originalIndex)" @change="toggleSelect(item.originalIndex)" /></label>
            <span class="source-name" @click="showSourceDetail(item.originalIndex)">{{ item.source.bookSourceName || item.source.name }}</span>
            <span class="source-group">{{ item.source.bookSourceGroup || '-' }}</span>
            <span><span class="status-dot" :class="item.source.enabled !== false ? 'enabled' : 'disabled'"></span></span>
            <span class="test-result">{{ testResults[item.originalIndex] || '-' }}</span>
            <div class="row-actions" @click.stop>
              <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="openDebug(item.originalIndex)">调试</button>
              <button class="btn-secondary" style="padding:4px 10px;font-size:12px" :disabled="testingIdx === item.originalIndex" @click="testSource(item.originalIndex)">{{ testingIdx === item.originalIndex ? '...' : '测试' }}</button>
              <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="toggleSource(item.originalIndex)">{{ item.source.enabled !== false ? '禁用' : '启用' }}</button>
              <button class="btn-danger" style="padding:4px 10px;font-size:12px" :disabled="deletingIdx >= 0" @click="deleteSource(item.originalIndex)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-else :title="searchText ? '未找到匹配的书源' : '暂无书源'" />
    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="handleImportJson"><n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" /></n-modal>
    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="handleImportFromUrl"><n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." /></n-modal>
    <DebugPanel v-if="showDebugPanel" :visible="showDebugPanel" :sources="safeSources" :source-index="debugSourceIndex" @update:visible="showDebugPanel = $event" />
  </div></template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NModal, NInput, useMessage, useDialog } from 'naive-ui'
import { store, source as sourceApi } from '@/services'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import DebugPanel from '@/components/debug/DebugPanel.vue'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { BookSource } from '@/types'
import type { UnlistenFn } from '@tauri-apps/api/event'

const msg = useMessage()
const dialog = useDialog()
const { naiveTheme, themeOverrides } = useNaiveTheme()
const { handleAndNotify, handleSilent } = useErrorHandler()
const sources = ref<BookSource[]>([])
const searchText = ref('')
const selectedGroup = ref('')
const collapsedGroups = ref<Set<string>>(new Set())
const testResults = ref<Record<number, string>>({})
const testingIdx = ref(-1)
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
const deletingIdx = ref(-1)
const showJsonModal = ref(false)
const showUrlModal = ref(false)
const jsonInput = ref('')
const urlInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importProgress = ref(0)
const importLabel = ref('')
const showDebugPanel = ref(false)
const debugSourceIndex = ref(-1)
const selectedIndices = ref(new Set<number>())
let unlistenTest: UnlistenFn | null = null

const safeSources = computed(() => Array.isArray(sources.value) ? sources.value : [])
const allGroups = computed(() => {
  const groups = new Set<string>()
  for (const s of safeSources.value) {
    const g = s.bookSourceGroup || ''
    if (g) groups.add(g)
  }
  return Array.from(groups).sort()
})
const groupOptions = computed(() => {
  const opts: { label: string; value: string }[] = [{ label: '全部分组', value: '' }]
  for (const g of allGroups.value) opts.push({ label: g, value: g })
  return opts
})
const filteredList = computed(() => {
  const arr = safeSources.value
  const kw = searchText.value.trim().toLowerCase()
  const group = selectedGroup.value
  const result: { source: BookSource; originalIndex: number }[] = []
  arr.forEach((s, i) => {
    if (group && (s.bookSourceGroup || '') !== group) return
    if (kw) {
      const name = (s.bookSourceName || s.name || '').toLowerCase()
      const url = (s.bookSourceUrl || '').toLowerCase()
      if (!name.includes(kw) && !url.includes(kw)) return
    }
    result.push({ source: s, originalIndex: i })
  })
  return result
})
const groupedSources = computed(() => {
  const groups: Record<string, { source: BookSource; originalIndex: number }[]> = {}
  for (const item of filteredList.value) {
    const groupName = item.source.bookSourceGroup || ''
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName].push(item)
  }
  const sorted: Record<string, { source: BookSource; originalIndex: number }[]> = {}
  const keys = Object.keys(groups).sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))
  for (const k of keys) sorted[k] = groups[k]
  return sorted
})
const selectedCount = computed(() => selectedIndices.value.size)
const isAllSelected = computed(() => filteredList.value.length > 0 && filteredList.value.every((item) => selectedIndices.value.has(item.originalIndex)))

function toggleGroupCollapse(groupName: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(groupName)) next.delete(groupName)
  else next.add(groupName)
  collapsedGroups.value = next
}

function onGroupChange(val: string | number): void { selectedGroup.value = String(val) }

function toggleSelectAll(): void {
  if (isAllSelected.value) selectedIndices.value = new Set()
  else selectedIndices.value = new Set(filteredList.value.map((item) => item.originalIndex))
}

function toggleSelect(index: number): void {
  const next = new Set(selectedIndices.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  selectedIndices.value = next
}

function invertSelection(): void {
  const all = new Set(filteredList.value.map((item) => item.originalIndex))
  const inv = new Set<number>()
  all.forEach((i) => { if (!selectedIndices.value.has(i)) inv.add(i) })
  selectedIndices.value = inv
}

async function batchEnable(): Promise<void> {
  const arr = [...safeSources.value]
  const indices = [...selectedIndices.value].sort((a, b) => a - b)
  for (const i of indices) {
    if (i < arr.length) arr[i].enabled = true
  }
  await store.set('bookSource', arr)
  sources.value = arr
  selectedIndices.value = new Set()
  msg.success(`已启用 ${indices.length} 个书源`)
}

async function batchDisable(): Promise<void> {
  const arr = [...safeSources.value]
  const indices = [...selectedIndices.value].sort((a, b) => a - b)
  for (const i of indices) {
    if (i < arr.length) arr[i].enabled = false
  }
  await store.set('bookSource', arr)
  sources.value = arr
  selectedIndices.value = new Set()
  msg.success(`已禁用 ${indices.length} 个书源`)
}

async function batchDelete(): Promise<void> {
  dialog.warning({
    title: '批量删除',
    content: `确定删除选中的 ${selectedIndices.value.size} 个书源？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const arr = [...safeSources.value]
      const toRemove = [...selectedIndices.value].sort((a, b) => a - b)
      const removeSet = new Set(toRemove)
      const filtered = arr.filter((_, i) => !removeSet.has(i))
      await store.set('bookSource', filtered)
      sources.value = filtered
      selectedIndices.value = new Set()
      msg.success('已删除')
    },
  })
}

async function loadSources(): Promise<void> {
  try {
    sources.value = (await store.get('bookSource')) || []
  } catch (err) {
    handleSilent(err, { module: 'source', operation: 'loadSources' })
  }
}

function setTestResult(idx: number, value: string): void {
  testResults.value = { ...testResults.value, [idx]: value }
}

function openDebug(idx: number): void { debugSourceIndex.value = idx; showDebugPanel.value = true }

function showSourceDetail(idx: number): void {
  const arr = safeSources.value
  if (idx >= 0 && idx < arr.length) {
    msg.info(`${arr[idx].bookSourceName || arr[idx].name}\nURL: ${arr[idx].bookSourceUrl}`)
  }
}

async function testSource(idx: number): Promise<void> {
  testingIdx.value = idx
  try {
    setTestResult(idx, await sourceApi.test(idx))
  } catch (err: any) {
    setTestResult(idx, '失败: ' + err.message)
  } finally {
    testingIdx.value = -1
  }
}

async function testAll(): Promise<void> {
  if (!safeSources.value.length) { msg.warning('没有书源可测试'); return }
  if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null }

  testingAll.value = true
  testProgress.value = 0
  testResults.value = {}

  unlistenTest = await sourceApi.listenTestResult((result: any) => {
    if (result.status === 'ok') {
      setTestResult(result.index, `连接成功 / ${result.time_ms}ms / ${result.size_kb}KB`)
    } else {
      setTestResult(result.index, `失败: ${result.error || '未知错误'}`)
    }
    testProgress.value++
  })

  try {
    await sourceApi.testAll()
    msg.success('测试完成')
  } catch (err: any) {
    msg.error('测试失败: ' + err.message)
  } finally {
    testingAll.value = false
    if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null }
  }
}

async function toggleSource(idx: number, force?: boolean): Promise<void> {
  try {
    const arr = [...safeSources.value]
    if (idx < arr.length) {
      arr[idx].enabled = force !== undefined ? force : arr[idx].enabled !== false
      sources.value = arr
      await store.set('bookSource', arr)
    }
  } catch (err: any) {
    msg.error('操作失败: ' + err.message)
  }
}

async function deleteSource(idx: number): Promise<void> {
  if (deletingIdx.value >= 0) return
  const arr = safeSources.value
  if (idx >= arr.length) return
  dialog.warning({
    title: '确认删除',
    content: `删除「${arr[idx].bookSourceName || arr[idx].name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingIdx.value = idx
      try {
        const newArr = [...safeSources.value]
        newArr.splice(idx, 1)
        await store.set('bookSource', newArr)
        sources.value = newArr
        msg.success('已删除')
      } catch (err: any) {
        msg.error('删除失败: ' + err.message)
      } finally {
        deletingIdx.value = -1
      }
    },
  })
}

async function deleteFailed(): Promise<void> {
  if (!safeSources.value.length) { msg.warning('没有书源可操作'); return }
  dialog.warning({
    title: '删除失效书源',
    content: `将测试所有 ${safeSources.value.length} 个书源`,
    positiveText: '开始检测',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingFailed.value = true
      try {
        const r: any = await sourceApi.deleteFailed()
        await loadSources()
        msg.success(`已删除 ${r} 个失效书源`)
      } catch (err: any) {
        msg.error('操作失败: ' + err.message)
      } finally {
        deletingFailed.value = false
      }
    },
  })
}

function triggerFileInput(): void { fileInput.value?.click() }

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  importProgress.value = 10
  importLabel.value = '读取文件...'
  try {
    const t = await file.text()
    importProgress.value = 30
    await sourceApi.add(t)
    await loadSources()
    importProgress.value = 100
    msg.success('导入成功')
  } catch (err: any) {
    msg.error('导入失败: ' + err.message)
  } finally {
    input.value = ''
    setTimeout(() => { importing.value = false }, 800)
  }
}

async function handleImportJson(): Promise<void> {
  if (!jsonInput.value.trim()) { msg.warning('请粘贴书源 JSON'); return }
  importing.value = true
  try {
    await sourceApi.add(jsonInput.value)
    jsonInput.value = ''
    showJsonModal.value = false
    await loadSources()
    msg.success('导入成功')
  } catch (err: any) {
    msg.error('导入失败: ' + err.message)
  } finally {
    setTimeout(() => { importing.value = false }, 800)
  }
}

async function handleImportFromUrl(): Promise<void> {
  if (!urlInput.value.trim()) { msg.warning('请输入 URL'); return }
  importing.value = true
  try {
    await sourceApi.importFromUrl(urlInput.value)
    urlInput.value = ''
    showUrlModal.value = false
    await loadSources()
    msg.success('导入成功')
  } catch (err: any) {
    msg.error('导入失败: ' + err.message)
  } finally {
    setTimeout(() => { importing.value = false }, 800)
  }
}

onMounted(() => { loadSources() })
onUnmounted(() => { if (unlistenTest) { try { unlistenTest() } catch {} } })
</script>

<style scoped>
.source-manager-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.import-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-card); border-radius: var(--radius-md); margin-bottom: 16px; border: 1px solid var(--border-color); }
.import-text { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.import-label { font-size: 12px; color: var(--text-muted); }
.batch-actions { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: var(--bg-active); border: 1px solid var(--brand); border-radius: var(--radius-md); margin-bottom: 12px; }
.btn-sm { padding: 4px 12px; font-size: 12px; height: 28px; }
.source-table { margin-bottom: 24px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.table-header { display: grid; grid-template-columns: 36px 1.5fr 1fr 60px 2fr 200px; gap: 4px; padding: 10px 18px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); font-weight: 500; align-items: center; }
.group-header { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: var(--bg); border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: background 0.15s; }
.group-header:hover { background: var(--bg-hover); }
.group-toggle { flex-shrink: 0; color: var(--text-muted); transition: transform 0.25s ease; }
.group-name { font-weight: 600; color: var(--text-primary); }
.group-count { font-size: 11px; color: var(--text-muted); margin-left: auto; }
.table-row { display: grid; grid-template-columns: 36px 1.5fr 1fr 60px 2fr 200px; gap: 4px; padding: 10px 18px; border-bottom: 1px solid var(--border-color); align-items: center; font-size: 13px; cursor: pointer; transition: background 0.18s; }
.table-row:hover { background: var(--bg-hover); }
.table-row.selected { background: var(--bg-active); }
.checkbox-all, .checkbox-cell { display: flex; align-items: center; justify-content: center; cursor: pointer; }
.checkbox-all input, .checkbox-cell input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
.source-name { color: var(--text-primary); font-weight: 500; }
.source-group { color: var(--text-muted); font-size: 12px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.enabled { background: #4caf50; box-shadow: 0 0 6px rgba(76,175,80,0.4); }
.status-dot.disabled { background: rgba(128,128,128,0.4); }
.test-result { color: var(--text-secondary); font-size: 12px; }
.row-actions { display: flex; gap: 4px; align-items: center; }
</style>
