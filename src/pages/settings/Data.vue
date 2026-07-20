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
         name="field-8992"
      </div>
    </div>
    <div class="setting-item">
      <div><span class="label-text">清空所有数据</span><span class="label-desc">删除所有书籍、书源和进度，不可恢复</span></div>
      <button class="btn-danger" @click="clearAllData">清空</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/api'
import { useReadingStore, useBookshelfStore } from '@/store'
import BackButton from '@/components/BackButton.vue'

const message = useMessage()
const dialog = useDialog()
const readingStore = useReadingStore()
const bookshelfStore = useBookshelfStore()
const importInput = ref<HTMLInputElement | null>(null)

async function exportData() {
  try {
    const data = await store.getAll()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `mo-yue-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err: any) { message.error('导出失败: ' + err.message) }
}

function triggerImportInput() { importInput.value?.click() }

async function onImportData(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try {
    const text = await file.text(); const data = JSON.parse(text)
    for (const [key, value] of Object.entries(data)) {
      if (key === 'replaceRules') {
        const existing = (await store.get('replaceRules')) || []
        const incoming = Array.isArray(value) ? value : []
        const merged = [...existing]
        for (const rule of incoming) {
          if (!merged.find((r: any) => r.name === rule.name && r.pattern === rule.pattern)) {
            merged.push(rule)
          }
        }
        await store.set(key, merged)
      } else {
        await store.set(key, value)
      }
    }
    await readingStore.loadSettings(); await bookshelfStore.loadBooks()
    message.success('导入成功')
  } catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = '' }
}

async function clearAllData() {
  dialog.warning({
    title: '危险操作', content: '确定清空所有数据？不可恢复！', positiveText: '确认清空', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.set('bookshelf', []); await store.set('bookSource', [])
        await store.set('readingProgress', {}); await store.set('replaceRules', [])
        localStorage.removeItem('app-settings'); localStorage.removeItem('reader-settings')
        await readingStore.loadSettings(); message.success('已清空')
      } catch (err: any) { message.error('清空失败: ' + err.message) }
    },
  })
}
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px; }
.hidden { display: none; }
</style>
