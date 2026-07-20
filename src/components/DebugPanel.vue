<template>
  <Teleport to="body">
    <div v-if="visible" ref="panelRef" class="debug-panel" :style="panelStyle" @mousedown="startDrag">
      <div class="debug-panel-header">
        <div class="header-left">
          <svg class="header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span class="header-title">书源调试助手</span>
        </div>
        <div class="header-actions">
          <button class="header-btn" @click="minimize = !minimize" aria-label="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="1" y1="6" x2="11" y2="6"/></svg>
          </button>
          <button class="header-btn header-btn-close" @click="closePanel" aria-label="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
          </button>
        </div>
      </div>

      <div v-show="!minimize" class="debug-body">
        <div class="debug-toolbar">
          <CustomDropdown v-model="selectedIndex" :options="sourceOptions" placeholder="选择书源..." @update:modelValue="onSourceChange" style="min-width:150px" />
          <div class="debug-tabs">
            <button v-for="tab in tabs" :key="tab.key" class="debug-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
          </div>
          <button class="btn-secondary" @click="openEditor" style="padding:5px 14px;font-size:11px">编辑书源</button>
          <button class="btn-secondary" @click="clearAll" style="padding:5px 14px;font-size:11px;margin-left:auto">清空</button>
        </div>

        <div v-if="activeTab === 'search'" class="debug-content">
          <div class="input-row">
            <input v-model="searchKeyword" type="text" placeholder="输入关键词..." class="debug-input" name="debug-search" id="debug-search" @keyup.enter="runSearch" />
            <button class="btn-primary" :disabled="running" @click="runSearch" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '搜索' }}</button>
          </div>
          <div v-if="searchResult.length" class="debug-result">
            <span style="font-size:12px;color:var(--text-secondary);font-weight:500">找到 {{ searchResult.length }} 本书</span>
            <div v-for="(book, idx) in searchResult.slice(0, 20)" :key="idx" class="book-item">
              <span class="item-index">{{ idx + 1 }}</span>
              <span class="item-name">{{ book.name || '未命名' }}</span>
              <span class="item-author">{{ book.author || '佚名' }}</span>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'toc'" class="debug-content">
          <div class="input-row">
            <input v-model="tocUrl" type="text" placeholder="输入书籍URL..." class="debug-input" name="debug-toc" id="debug-toc" @keyup.enter="runToc" />
            <button class="btn-primary" :disabled="running" @click="runToc" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '获取目录' }}</button>
          </div>
        </div>

        <div v-if="activeTab === 'content'" class="debug-content">
          <div class="input-row">
            <input v-model="contentUrl" type="text" placeholder="输入章节URL..." class="debug-input" name="debug-content" id="debug-content" @keyup.enter="runContent" />
            <button class="btn-primary" :disabled="running" @click="runContent" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '获取正文' }}</button>
          </div>
        </div>

        <div class="debug-log">
          <div class="log-header"><span>日志</span><button class="btn-secondary" @click="logs = []" style="padding:2px 8px;font-size:10px">清空</button></div>
          <div class="log-list" ref="logListRef">
            <div v-for="(log, idx) in logs" :key="idx" class="log-entry" :class="'log-' + log.level">
              <span class="log-time">{{ log.time }}</span><span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <n-modal v-model:show="showEditor" preset="dialog" title="编辑书源规则" positive-text="保存" negative-text="取消" @positive-click="saveEdit" @negative-click="showEditor = false">
      <n-input v-model:value="editJson" type="textarea" :autosize="{ minRows: 20, maxRows: 35 }" style="font-family:var(--font-mono);font-size:13px" />
    </n-modal>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import CustomDropdown from './CustomDropdown.vue'
import { store, engine, network } from '@/api'
import type { BookSource } from '@shared/types'

const props = defineProps<{ visible: boolean; sources: BookSource[]; sourceIndex?: number }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'select-source', v: number): void }>()

const message = useMessage()
const panelRef = ref<HTMLElement | null>(null)
const logListRef = ref<HTMLElement | null>(null)
const minimize = ref(false)
const running = ref(false)

const panelStyle = ref({ position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '900px', height: '680px', zIndex: '9999' })
const dragState = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 }

function startDrag(event: MouseEvent) {
  if (!(event.target as HTMLElement).closest('.debug-panel-header')) return
  const panel = panelRef.value; if (!panel) return
  const rect = panel.getBoundingClientRect()
  dragState.isDragging = true; dragState.startX = event.clientX; dragState.startY = event.clientY
  dragState.startLeft = rect.left; dragState.startTop = rect.top
  document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', endDrag)
}
function onDrag(event: MouseEvent) {
  if (!dragState.isDragging) return
  panelStyle.value = { ...panelStyle.value, top: (dragState.startTop + event.clientY - dragState.startY) + 'px', left: (dragState.startLeft + event.clientX - dragState.startX) + 'px', transform: 'none' }
}
function endDrag() { dragState.isDragging = false; document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', endDrag) }

const activeTab = ref('search')
const selectedIndex = ref(-1)
const tabs = [{ key: 'search', label: '搜索' }, { key: 'toc', label: '目录' }, { key: 'content', label: '正文' }]
const searchKeyword = ref(''); const tocUrl = ref(''); const contentUrl = ref('')
const searchResult = ref<any[]>([]); const tocResult = ref<any[]>([]); const contentResult = ref('')
const logs = ref<{ time: string; level: string; message: string }[]>([])
const showEditor = ref(false)
const editJson = ref('')

const sourceOptions = computed(() => {
  const opts = [{ label: '选择书源...', value: -1 }]
  for (let i = 0; i < (Array.isArray(props.sources) ? props.sources.length : 0); i++) {
    opts.push({ label: (props.sources as any)[i].bookSourceName || (props.sources as any)[i].name, value: i })
  }
  return opts
})

function addLog(msg: string, level = 'info') {
  logs.value.unshift({ time: new Date().toLocaleTimeString(), level, message: msg })
  if (logs.value.length > 500) logs.value = logs.value.slice(0, 500)
  nextTick(() => { if (logListRef.value) logListRef.value.scrollTop = 0 })
}
function clearAll() { searchResult.value = []; tocResult.value = []; contentResult.value = ''; logs.value = [] }
function onSourceChange(val: string | number) { selectedIndex.value = val; emit('select-source', selectedIndex.value); clearAll() }
function closePanel() { emit('update:visible', false) }

function openEditor() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  editJson.value = JSON.stringify((props.sources as any)[selectedIndex.value], null, 2)
  showEditor.value = true
}
async function saveEdit() {
  try {
    const parsed = JSON.parse(editJson.value)
    const sources = (await store.get('bookSource')) || []
    sources[selectedIndex.value] = parsed
    await store.set('bookSource', sources)
    showEditor.value = false
    message.success('已保存')
  } catch (err: any) { message.error('JSON 格式错误: ' + err.message) }
}

async function runSearch() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!searchKeyword.value.trim()) { message.warning('请输入关键词'); return }
  running.value = true; searchResult.value = []
  try {
    const source = JSON.parse(JSON.stringify((props.sources as any)[selectedIndex.value]))
    addLog(`开始搜索: "${searchKeyword.value}"，书源: ${source.bookSourceName || source.name}`, 'info')

    const res: any = await engine.search(source, searchKeyword.value, 1)
    if (res.success) {
      searchResult.value = res.data || []
      addLog(`搜索成功: ${searchResult.value.length} 本书`, 'success')
    } else {
      addLog(`搜索失败: ${res.error}`, 'error')
    }
  } catch (err: any) { addLog(`异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

async function runToc() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!tocUrl.value.trim()) { message.warning('请输入书籍URL'); return }
  running.value = true; tocResult.value = []
  try {
    const source = JSON.parse(JSON.stringify((props.sources as any)[selectedIndex.value]))
    addLog(`获取目录: ${tocUrl.value}`, 'info')

    const res = await network.fetch(tocUrl.value, { method: 'GET', timeout: 30000 })
    const data = typeof res === 'string' ? res : JSON.stringify(res)
    addLog(`HTTP响应: ${data?.length || 0} 字节`, 'success')

    const rule = source.ruleToc
    if (rule?.chapterList) {
      addLog(`chapterList规则: ${rule.chapterList}`, 'info')
      const parsed: any = await engine.parseRule(source, rule.chapterList, data)
      if (parsed.success && Array.isArray(parsed.data)) {
        addLog(`chapterList匹配: ${parsed.data.length} 条`, 'success')
        for (let i = 0; i < Math.min(parsed.data.length, 10); i++) {
          const item = parsed.data[i]
          const title = rule.chapterName ? (await engine.parseRule(source, rule.chapterName, item)).data : (item.title || item)
          const url = rule.chapterUrl ? (await engine.parseRule(source, rule.chapterUrl, item)).data : ''
          tocResult.value.push({ title: String(title || '无标题'), url: String(url || '') })
          addLog(`  [${i + 1}] ${title}`, 'info')
        }
      }
    }
    addLog(`解析完成: ${tocResult.value.length} 章`, 'success')
  } catch (err: any) { addLog(`异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

async function runContent() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!contentUrl.value.trim()) { message.warning('请输入章节URL'); return }
  running.value = true; contentResult.value = ''
  try {
    const source = JSON.parse(JSON.stringify((props.sources as any)[selectedIndex.value]))
    addLog(`获取正文: ${contentUrl.value}`, 'info')

    const res: any = await engine.getContent(source, contentUrl.value)
    if (res.success) {
      contentResult.value = res.data || ''
      addLog(`正文提取: ${contentResult.value.length} 字符`, 'success')
    } else {
      addLog(`获取失败: ${res.error}`, 'error')
    }
  } catch (err: any) { addLog(`异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

watch(() => props.sourceIndex, (val) => { if (val !== undefined && val >= 0) selectedIndex.value = val }, { immediate: true })
onMounted(() => document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && props.visible) closePanel() }))
onUnmounted(() => { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', endDrag) })
</script>

<style scoped>
.debug-panel {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
  display: flex; flex-direction: column; overflow: hidden;
  min-width: 600px; min-height: 400px; resize: both;
}
.debug-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color); cursor: grab; flex-shrink: 0; user-select: none;
}
.debug-panel-header:active { cursor: grabbing; }
.header-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); }
.header-icon { color: var(--brand); flex-shrink: 0; }
.header-title { font-weight: 600; }
.header-actions { display: flex; gap: 6px; }
.header-btn {
  width: 30px; height: 30px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center; transition: background 0.18s, color 0.18s;
}
.header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.header-btn-close:hover { background: #e74c3c; color: #fff; }
.debug-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 14px; gap: 10px; }
.debug-toolbar { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
.debug-tabs { display: flex; gap: 2px; background: var(--bg); border-radius: var(--radius-sm); padding: 2px; }
.debug-tab { padding: 5px 14px; font-size: 11px; color: var(--text-muted); background: transparent; border: none; border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, background 0.2s; }
.debug-tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.debug-tab.active { color: var(--brand); background: var(--bg-active); }
.debug-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.input-row { display: flex; gap: 8px; }
.debug-input { flex: 1; padding: 8px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; }
.debug-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.debug-result { padding: 12px 14px; background: var(--bg); border-radius: var(--radius-sm); border: 1px solid var(--border-color); max-height: 200px; overflow-y: auto; }
.book-item { display: flex; gap: 8px; padding: 5px 8px; font-size: 12px; color: var(--text-secondary); border-radius: var(--radius-sm); }
.book-item:hover { background: var(--bg-hover); }
.item-index { color: var(--text-muted); min-width: 28px; font-size: 11px; }
.item-name { flex: 1; color: var(--text-primary); font-weight: 500; }
.item-author { color: var(--text-muted); }
.debug-log { flex-shrink: 0; height: 260px; border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; }
.log-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; flex-shrink: 0; }
.log-list { flex: 1; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; }
.log-entry { display: flex; gap: 8px; padding: 2px 6px; flex-shrink: 0; }
.log-time { color: var(--text-muted); min-width: 70px; font-size: 10px; flex-shrink: 0; }
.log-message { word-break: break-all; }
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-info .log-message { color: var(--text-secondary); }
</style>
