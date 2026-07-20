<template>
  <div class="market-page">
    <header class="page-header">
      <h1 class="page-title">书源市场</h1>
      <p class="page-subtitle">导入书源 JSON</p>
    </header>

    <div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap">
      <div style="flex:1;display:flex;gap:10px;min-width:300px">
        <input v-model="importUrl" type="text" placeholder="输入 JSON 链接..." class="input-search" style="flex:1" name="market-url" id="market-url" @keyup.enter="importFromUrl" />
        <button class="btn-primary" :disabled="loading" @click="importFromUrl">{{ loading ? '加载中...' : '导入' }}</button>
      </div>
      <button class="btn-secondary" @click="triggerFileInput">选择文件</button>
      <button class="btn-secondary" @click="showJsonModal = true">粘贴 JSON</button>
    </div>

    <input ref="fileInput" type="file" accept=".json" class="hidden" name="market-file" id="market-file" @change="onFileSelected" />

    <div v-if="loadedSources.length > 0" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      <div
        v-for="(source, idx) in loadedSources"
        :key="idx"
        style="padding:18px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md)"
      >
        <h4 style="font-size:15px;font-weight:500;color:var(--text-primary);margin:0 0 6px">
          {{ source.name || source.bookSourceName || '未命名' }}
        </h4>
        <p style="font-size:13px;color:var(--text-muted);flex:1;margin-bottom:10px">
          {{ source.comment || source.bookSourceComment || '暂无描述' }}
        </p>
        <button class="btn-primary" :disabled="installing" @click="installSource(source)">
          {{ installing ? '安装中...' : '安装' }}
        </button>
      </div>
    </div>

    <div v-else class="empty-state"><h3>导入书源开始</h3></div>

    <n-modal v-model:show="showJsonModal" preset="dialog" title="粘贴 JSON" positive-text="导入" @positive-click="importJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { source as sourceApi, network } from '@/api'

const message = useMessage()
const importUrl = ref('')
const jsonInput = ref('')
const loadedSources = ref<any[]>([])
const loading = ref(false)
const showJsonModal = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const installing = ref(false)

async function importFromUrl() {
  if (!importUrl.value.trim()) { message.warning('请输入 URL'); return }
  loading.value = true
  try {
    const response = await network.fetch(importUrl.value, { method: 'GET' })
    const data = JSON.parse(typeof response === 'string' ? response : JSON.stringify(response))
    loadedSources.value = Array.isArray(data) ? data : [data]
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { loading.value = false }
}

function triggerFileInput() { fileInput.value?.click() }

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loading.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    loadedSources.value = Array.isArray(data) ? data : [data]
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { loading.value = false; input.value = '' }
}

async function importJson() {
  if (!jsonInput.value.trim()) { message.warning('请粘贴书源 JSON'); return }
  try {
    const data = JSON.parse(jsonInput.value)
    loadedSources.value = Array.isArray(data) ? data : [data]
    jsonInput.value = ''
    showJsonModal.value = false
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) { message.error('解析失败: ' + err.message) }
}

async function installSource(source: any) {
  installing.value = true
  try {
    await sourceApi.add(JSON.stringify(source))
    message.success(`已安装《${source.name || source.bookSourceName || '未命名'}》`)
  } catch (err: any) { message.error('安装失败: ' + err.message) }
  finally { installing.value = false }
}
</script>

<style scoped>
.market-page { position: relative; z-index: 1; }
</style>
