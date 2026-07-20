<template>
  <div class="source-manager-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书源管理</h1>
        <p class="page-subtitle">{{ filteredSources.length }} / {{ safeSources.length }} 个书源</p>
      </div>
      <div class="header-actions">
        <input v-model="searchText" type="text" placeholder="搜索书源..." class="input-search" style="margin-right:8px" name="source-search" id="source-search" />
        <button class="btn-secondary" @click="triggerFileInput">上传文件</button>
        <button class="btn-secondary" @click="showUrlModal = true">从 URL</button>
        <button class="btn-primary" @click="showJsonModal = true">粘贴 JSON</button>
        <button class="btn-secondary" :disabled="testingAll" @click="testAll">{{ testingAll ? `测试中 ${testProgress}/${safeSources.length}` : '测试全部' }}</button>
        <button class="btn-danger" :disabled="deletingFailed" @click="deleteFailed">{{ deletingFailed ? '删除中...' : '删除失效' }}</button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".json" class="hidden" name="source-file" id="source-file" @change="onFileSelected" />

    <div v-if="importing" class="import-bar">
      <div class="progress-bar" style="flex:1"><div class="progress-fill" :style="{ width: importProgress + '%' }"></div></div>
      <span class="import-text">{{ importProgress }}%</span>
      <span class="import-label">{{ importLabel }}</span>
    </div>

    <div v-if="filteredSources.length > 0" class="source-table">
      <div class="table-header">
        <span>名称</span>
        <span>状态</span>
        <span>测试结果</span>
        <span>操作</span>
      </div>
      <div v-for="(item, idx) in filteredSources" :key="item.originalIndex" class="table-row" @click="showSourceDetail(item.originalIndex)">
        <span class="source-name">{{ item.source.bookSourceName || item.source.name }}</span>
        <span><span class="status-dot" :class="item.source.enabled ? 'enabled' : 'disabled'"></span></span>
        <span class="test-result">{{ testResults[item.originalIndex] || '—' }}</span>
        <div class="row-actions" @click.stop>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="openDebug(item.originalIndex)">调试</button>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px" :disabled="testingIdx === item.originalIndex" @click="testSource(item.originalIndex)">{{ testingIdx === item.originalIndex ? '...' : '测试' }}</button>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="toggleSource(item.originalIndex)">{{ item.source.enabled ? '禁用' : '启用' }}</button>
          <button class="btn-danger" style="padding:4px 10px;font-size:12px" @click="deleteSource(item.originalIndex)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state"><h3>{{ searchText ? '未找到匹配的书源' : '暂无书源' }}</h3></div>

    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="handleImportJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>
    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="handleImportFromUrl">
      <n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." />
    </n-modal>

    <DebugPanel v-if="showDebugPanel" :visible="showDebugPanel" :sources="safeSources" :source-index="debugSourceIndex" @update:visible="showDebugPanel = $event" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog, NModal, NInput } from 'naive-ui'
import { store, source as sourceApi } from '@/api'
import { listen } from '@tauri-apps/api/event'
import DebugPanel from '@/components/DebugPanel.vue'
import type { BookSource } from '@shared/types'

const message = useMessage()
const dialog = useDialog()
const sources = ref<BookSource[]>([])
const searchText = ref('')
const testResults = ref<Record<number, string>>({})
const testingIdx = ref(-1)
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
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

let unlistenTest: (() => void) | null = null

const safeSources = computed(() => Array.isArray(sources.value) ? sources.value : [])

const filteredSources = computed(() => {
  const arr = safeSources.value
  if (!searchText.value.trim()) return arr.map((s, i) => ({ source: s, originalIndex: i }))
  const kw = searchText.value.trim().toLowerCase()
  const result: { source: BookSource; originalIndex: number }[] = []
  arr.forEach((s, i) => {
    if ((s.bookSourceName || s.name || '').toLowerCase().includes(kw) || (s.bookSourceUrl || '').toLowerCase().includes(kw)) {
      result.push({ source: s, originalIndex: i })
    }
  })
  return result
})

async function loadSources() {
  try {
    const raw = await store.get('bookSource')
    sources.value = Array.isArray(raw) ? raw : []
  } catch { sources.value = [] }
}

function setTestResult(idx: number, value: string) { testResults.value = { ...testResults.value, [idx]: value } }

function openDebug(idx: number) { debugSourceIndex.value = idx; showDebugPanel.value = true }

function showSourceDetail(idx: number) {
  const arr = safeSources.value
  if (idx >= 0 && idx < arr.length) {
    const s = arr[idx]
    message.info(`${s.bookSourceName || s.name}\nURL: ${s.bookSourceUrl}\n分组: ${s.bookSourceGroup || '未分组'}`)
  }
}

async function testSource(idx: number) {
  testingIdx.value = idx
  try { setTestResult(idx, await sourceApi.test(idx)) }
  catch (err: any) { setTestResult(idx, '失败: ' + err.message) }
  finally { testingIdx.value = -1 }
}

async function testAll() {
  if (!safeSources.value.length) { message.warning('没有书源可测试'); return }
  if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null }
  testingAll.value = true; testProgress.value = 0; testResults.value = {}
  unlistenTest = await listen('source-test-result', (event: any) => {
    const result = event.payload
    if (result.status === 'ok') setTestResult(result.index, `连接成功 / ${result.time_ms}ms / ${result.size_kb}KB`)
    else setTestResult(result.index, `失败: ${result.error || '未知错误'}`)
    testProgress.value++
  })
  try { await sourceApi.testAll(); await new Promise(r => setTimeout(r, 2000)); message.success('测试完成') }
  catch (err: any) { message.error('测试失败: ' + err.message) }
  finally { testingAll.value = false; if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null } }
}

async function toggleSource(idx: number) {
  try {
    const arr = safeSources.value
    if (idx < arr.length) {
      arr[idx].enabled = !arr[idx].enabled
      sources.value = [...arr]
      await store.set('bookSource', arr)
    }
  } catch (err: any) { message.error('操作失败: ' + err.message) }
}

async function deleteSource(idx: number) {
  const arr = safeSources.value
  if (idx >= arr.length) return
  dialog.warning({
    title: '确认删除', content: `删除「${arr[idx].bookSourceName || arr[idx].name}」？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        arr.splice(idx, 1)
        sources.value = [...arr]
        await store.set('bookSource', arr)
        await loadSources()
        message.success('已删除')
      } catch (err: any) { message.error('删除失败: ' + err.message) }
    },
  })
}

async function deleteFailed() {
  if (!safeSources.value.length) { message.warning('没有书源可操作'); return }
  dialog.warning({
    title: '删除失效书源', content: `将测试所有 ${safeSources.value.length} 个书源`, positiveText: '开始检测', negativeText: '取消',
    onPositiveClick: async () => {
      deletingFailed.value = true
      try { const r: any = await sourceApi.deleteFailed(); await loadSources(); message.success(`已删除 ${r} 个失效书源`) }
      catch (err: any) { message.error('操作失败: ' + err.message) }
      finally { deletingFailed.value = false }
    },
  })
}

function triggerFileInput() { fileInput.value?.click() }

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  importing.value = true; importProgress.value = 10; importLabel.value = '读取文件...'
  try { const t = await file.text(); importProgress.value = 30; await sourceApi.add(t); await loadSources(); importProgress.value = 100; message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = ''; setTimeout(() => { importing.value = false }, 800) }
}

async function handleImportJson() {
  if (!jsonInput.value.trim()) { message.warning('请粘贴书源 JSON'); return }
  importing.value = true
  try { await sourceApi.add(jsonInput.value); jsonInput.value = ''; showJsonModal.value = false; await loadSources(); message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { setTimeout(() => { importing.value = false }, 800) }
}

async function handleImportFromUrl() {
  if (!urlInput.value.trim()) { message.warning('请输入 URL'); return }
  importing.value = true
  try { await sourceApi.importFromUrl(urlInput.value); urlInput.value = ''; showUrlModal.value = false; await loadSources(); message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { setTimeout(() => { importing.value = false }, 800) }
}

onMounted(() => { loadSources() })
onUnmounted(() => { if (unlistenTest) { try { unlistenTest() } catch {} } })
</script>

<style scoped>
.source-manager-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input-search { width: 180px; }
.import-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-card); border-radius: var(--radius-md); margin-bottom: 16px; border: 1px solid var(--border-color); }
.import-text { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.import-label { font-size: 12px; color: var(--text-muted); }
.source-table { margin-bottom: 24px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.table-header { display: grid; grid-template-columns: 1.5fr 60px 2fr 200px; gap: 4px; padding: 10px 18px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); font-weight: 500; align-items: center; }
.table-row { display: grid; grid-template-columns: 1.5fr 60px 2fr 200px; gap: 4px; padding: 12px 18px; border-bottom: 1px solid var(--border-color); align-items: center; font-size: 14px; cursor: pointer; transition: background 0.18s; }
.table-row:hover { background: var(--bg-hover); }
.table-row:last-child { border-bottom: none; }
.source-name { color: var(--text-primary); font-weight: 500; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.enabled { background: #4caf50; box-shadow: 0 0 6px rgba(76,175,80,0.4); }
.status-dot.disabled { background: rgba(128,128,128,0.4); }
.test-result { color: var(--text-secondary); font-size: 13px; }
.row-actions { display: flex; gap: 4px; align-items: center; }
</style>
