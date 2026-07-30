<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>数据</h2>
    </header>
    <div class="setting-item">
      <div><span class="label-text">本地备份</span><span class="label-desc">导出为 JSON 文件</span></div>
      <button class="btn-secondary" @click="exportData">导出</button>
    </div>
    <div class="setting-item">
      <div><span class="label-text">本地恢复</span><span class="label-desc">从 JSON 文件恢复</span></div>
      <div>
        <button class="btn-secondary" @click="triggerImportInput">选择文件</button>
        <input ref="importInput" type="file" accept=".json" class="hidden" name="data-import" id="data-import" @change="onImportData" />
      </div>
    </div>

    <div class="cache-section">
      <div class="setting-item"><div><span class="label-text">本地缓存</span><span class="label-desc">书籍封面、目录、正文、漫画图片及 JS 库缓存</span></div><button class="btn-secondary" :disabled="loadingCache" @click="loadCacheInfo">{{ loadingCache ? '加载中...' : '刷新' }}</button></div>
      <div v-if="cacheInfo" class="cache-info">
        <div class="cache-summary">
          <div class="cache-stat"><span class="cache-stat-label">缓存位置</span><span class="cache-stat-value cache-path">{{ cacheInfo.path }}</span></div>
          <div class="cache-stat"><span class="cache-stat-label">总大小</span><span class="cache-stat-value">{{ cacheInfo.totalSizeFormatted }} / {{ cacheInfo.maxTotalFormatted }}</span></div>
          <div class="cache-stat"><span class="cache-stat-label">缓存上限</span><div class="cache-limit-row"><input v-model.number="cacheLimitMB" type="number" min="10" max="10000" step="10" class="cache-limit-input" /><span class="cache-stat-value">MB</span><button class="btn-secondary" style="padding:2px 10px;font-size:11px" :disabled="savingLimit" @click="saveCacheLimit">{{ savingLimit ? '保存中' : '保存' }}</button></div></div>
          <div class="cache-stat"><span class="cache-stat-label">迁移目录</span><button class="btn-secondary" style="padding:4px 12px;font-size:12px" :disabled="migrating" @click="migrateCache">{{ migrating ? '迁移中...' : '选择新目录' }}</button></div>
        </div>
        <div class="cache-categories" v-if="cacheInfo.categories && cacheInfo.categories.length > 0"><div v-for="cat in cacheInfo.categories" :key="cat.key" class="cache-category-row"><div class="cache-cat-info"><span class="cache-cat-name">{{ cat.name }}</span><span class="cache-cat-detail">{{ cat.count }} 个文件 · {{ cat.sizeFormatted }}</span></div><button class="btn-secondary" style="padding:4px 12px;font-size:12px" :disabled="clearingCategory === cat.key" @click="clearCategory(cat.key)">{{ clearingCategory === cat.key ? '清理中...' : '清理' }}</button></div></div>
        <div class="cache-actions"><button class="btn-danger" :disabled="clearingAll" @click="clearAllCache">{{ clearingAll ? '清空中...' : '清空所有缓存' }}</button></div>
      </div>
    </div>

    <div class="setting-item"><div><span class="label-text">清空所有数据</span><span class="label-desc">删除所有书籍、书源和进度，不可恢复</span></div><button class="btn-danger" @click="clearAllData">清空</button></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import { useReadingStore, useBookshelfStore } from '@/store'
import BackButton from '@/components/BackButton.vue'

const message = useMessage()
const dialog = useDialog()
const readingStore = useReadingStore()
const bookshelfStore = useBookshelfStore()
const importInput = ref<HTMLInputElement | null>(null)
const cacheInfo = ref<any>(null)
const loadingCache = ref(false)
const clearingCategory = ref<string | null>(null)
const clearingAll = ref(false)
const cacheLimitMB = ref(200)
const savingLimit = ref(false)
const migrating = ref(false)

const ALL_STORE_KEYS = ['bookshelf', 'bookSource', 'readingProgress', 'replaceRule', 'bookGroup', 'txtTocRule', 'dictRule', 'keyboardAssists', 'cacheConfig']

onMounted(() => { loadCacheInfo() })

async function loadCacheInfo() { loadingCache.value = true; try { cacheInfo.value = await invoke('cache_get_info'); cacheLimitMB.value = Math.round((cacheInfo.value.maxTotalBytes || 200 * 1024 * 1024) / (1024 * 1024)) } catch (err: any) { message.error('加载缓存信息失败: ' + (err?.message || String(err))) } finally { loadingCache.value = false } }
async function saveCacheLimit() { savingLimit.value = true; try { await invoke('cache_set_max_size', { maxMb: cacheLimitMB.value }); await loadCacheInfo(); message.success('缓存上限已更新') } catch (err: any) { message.error('保存失败: ' + (err?.message || String(err))) } finally { savingLimit.value = false } }
async function migrateCache() { migrating.value = true; try { const newPath = prompt('请输入新的缓存目录路径'); if (!newPath) return; await invoke('cache_migrate', { newPath }); await loadCacheInfo(); message.success('缓存目录已迁移') } catch (err: any) { message.error('迁移失败: ' + (err?.message || String(err))) } finally { migrating.value = false } }
async function clearCategory(key: string) { clearingCategory.value = key; try { const result: any = await invoke('cache_clear_category', { category: key }); message.success(`已清理 ${result.removed} 个文件`); await loadCacheInfo() } catch (err: any) { message.error('清理失败: ' + (err?.message || String(err))) } finally { clearingCategory.value = null } }
async function clearAllCache() { clearingAll.value = true; try { const result: any = await invoke('cache_clear'); message.success(`已清空 ${result.removed} 个缓存文件`); await loadCacheInfo() } catch (err: any) { message.error('清空失败: ' + (err?.message || String(err))) } finally { clearingAll.value = false } }

async function exportData() { try { const data = await store.getAll(); const json = JSON.stringify(data, null, 2); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `abyssreader-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); message.success('导出成功') } catch (err: any) { message.error('导出失败: ' + err.message) } }
function triggerImportInput() { importInput.value?.click() }

async function onImportData(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try {
    const text = await file.text(); const data = JSON.parse(text)
    for (const [key, value] of Object.entries(data)) {
      if (key === 'replaceRule') { const existing = (await store.get('replaceRule')) || []; const incoming = Array.isArray(value) ? value : []; const merged = [...existing]; for (const rule of incoming) { if (!merged.find((r: any) => r.name === rule.name && r.pattern === rule.pattern)) merged.push(rule) }; await store.set(key, merged) }
      else if (ALL_STORE_KEYS.includes(key)) { await store.set(key, value) }
    }
    await readingStore.loadSettings(); await bookshelfStore.loadBooks(); message.success('导入成功')
  } catch (err: any) { message.error('导入失败: ' + err.message) } finally { input.value = '' }
}

async function clearAllData() {
  dialog.warning({ title: '危险操作', content: '确定清空所有数据？不可恢复！', positiveText: '确认清空', negativeText: '取消',
    onPositiveClick: async () => { try { for (const key of ALL_STORE_KEYS) { await store.set(key, key === 'cacheConfig' ? null : []) }; localStorage.clear(); await readingStore.loadSettings(); message.success('已清空') } catch (err: any) { message.error('清空失败: ' + err.message) } }
  })
}
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px; }
.hidden { display: none; }
.cache-section { margin-top: 8px; }
.cache-section > .setting-item { border-bottom: none; padding-bottom: 12px; }
.cache-info { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 16px; }
.cache-summary { display: flex; flex-direction: column; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
.cache-stat { display: flex; justify-content: space-between; align-items: center; }
.cache-stat-label { font-size: 13px; color: var(--text-muted); flex-shrink: 0; margin-right: 12px; }
.cache-stat-value { font-size: 13px; color: var(--text-primary); font-weight: 500; text-align: right; word-break: break-all; }
.cache-path { font-size: 11px; font-family: var(--font-mono); opacity: 0.7; }
.cache-limit-row { display: flex; align-items: center; gap: 8px; }
.cache-limit-input { width: 70px; padding: 3px 8px; font-size: 13px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; text-align: right; }
.cache-limit-input:focus { border-color: var(--brand); }
.cache-categories { display: flex; flex-direction: column; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
.cache-category-row { display: flex; align-items: center; justify-content: space-between; }
.cache-cat-info { display: flex; flex-direction: column; }
.cache-cat-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.cache-cat-detail { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cache-actions { display: flex; justify-content: flex-end; }
</style>
