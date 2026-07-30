<template>
  <Teleport to="body">
    <div v-if="visible" ref="panelRef" class="debug-panel" :style="panelStyle">
      <div class="debug-panel-header" @mousedown.prevent="startDrag">
        <div class="header-left">
          <svg class="header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span class="header-title">书源调试助手</span>
        </div>
        <div class="header-actions">
          <button class="header-btn header-btn-close" @mousedown.stop @click="closePanel" aria-label="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
          </button>
        </div>
      </div>

      <template v-if="editMode">
        <div class="debug-editor-header">
          <button class="btn-back-inline" @click="editMode = false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            返回
          </button>
          <span style="font-size:13px;color:var(--text-secondary);font-weight:500">编辑书源规则</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span v-if="saving" style="font-size:12px;color:var(--brand)">保存中...</span>
            <button class="btn-primary" style="padding:5px 16px;font-size:12px" :disabled="saving" @click="saveEdit">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
        <!-- 快捷输入工具栏 -->
        <div class="keyboard-assists">
          <button v-for="item in keyboardAssists" :key="item.key" class="btn-secondary" style="padding:3px 10px;font-size:11px" @click="insertAssist(item)">{{ item.key }}</button>
        </div>
        <div class="debug-editor-body">
          <textarea ref="editorRef" v-model="editJson" class="debug-editor-textarea" spellcheck="false"></textarea>
        </div>
        <div v-if="editError" class="debug-editor-error">{{ editError }}</div>
      </template>

      <template v-else>
        <div class="debug-body">
          <div class="debug-toolbar">
            <CustomDropdown v-model="selectedIndex" :options="sourceOptions" placeholder="选择书源..." @update:modelValue="(v: string | number) => onSourceChange(Number(v))" style="min-width:150px" />
            <div class="debug-tabs">
              <button v-for="tab in tabs" :key="tab.key" class="debug-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
            </div>
            <button class="btn-secondary" @click="openEditor" style="padding:5px 14px;font-size:11px">编辑书源</button>
            <button class="btn-secondary" @click="clearAll" style="padding:5px 14px;font-size:11px;margin-left:auto">清空</button>
          </div>

          <div v-if="activeTab === 'search'" class="debug-content">
            <div class="input-row">
              <input v-model="searchKeyword" type="text" placeholder="输入关键词..." class="debug-input" @keyup.enter="runSearch" />
              <button class="btn-primary" :disabled="running" @click="runSearch" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '搜索' }}</button>
            </div>
            <div v-if="searchResult.length" class="debug-result">
              <span style="font-size:12px;color:var(--text-secondary);font-weight:500">找到 {{ searchResult.length }} 本书</span>
              <div v-for="(book, idx) in searchResult.slice(0, 20)" :key="idx" class="book-item">
                <span class="item-index">{{ idx + 1 }}</span>
                <span class="item-name">{{ book.name || '未命名' }}</span>
                <span class="item-author">{{ book.author || '佚名' }}</span>
                <span class="item-url" :title="book.bookUrl">{{ book.bookUrl || '' }}</span>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'toc'" class="debug-content">
            <div class="input-row">
              <input v-model="tocUrl" type="text" placeholder="输入目录URL..." class="debug-input" @keyup.enter="runToc" />
              <button class="btn-primary" :disabled="running" @click="runToc" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '获取目录' }}</button>
            </div>
            <div v-if="tocResult.length" class="debug-result">
              <div v-for="(ch, idx) in tocResult.slice(0, 20)" :key="idx" class="book-item">
                <span class="item-index">{{ idx + 1 }}</span>
                <span class="item-name">{{ ch.title }}</span>
                <span class="item-url" :title="ch.url">{{ ch.url || '' }}</span>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'content'" class="debug-content">
            <div class="input-row">
              <input v-model="contentUrl" type="text" placeholder="输入章节URL..." class="debug-input" @keyup.enter="runContent" />
              <button class="btn-primary" :disabled="running" @click="runContent" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '获取正文' }}</button>
            </div>
            <div v-if="contentResult" class="debug-result" style="white-space:pre-wrap;max-height:300px">{{ contentResult.substring(0, 2000) }}</div>
          </div>

          <div v-if="activeTab === 'js'" class="debug-content">
            <div style="display:flex;flex-direction:column;gap:8px;flex:1">
              <div class="input-row" style="align-items:flex-start"><textarea v-model="jsCode" class="debug-textarea" placeholder="输入 JS 代码..." spellcheck="false"></textarea></div>
              <div class="input-row" style="flex-wrap:wrap">
                <button class="btn-primary" :disabled="running" @click="runJs" style="padding:7px 22px;font-size:13px">{{ running ? '执行中...' : '执行 JS' }}</button>
                <button class="btn-secondary" @click="runPreset('base')" style="padding:5px 12px;font-size:11px">测试 base</button>
                <button class="btn-secondary" @click="runPreset('ajax')" style="padding:5px 12px;font-size:11px">测试 ajax</button>
                <button class="btn-secondary" @click="runPreset('b64')" style="padding:5px 12px;font-size:11px">测试 base64</button>
                <button class="btn-secondary" @click="runPreset('all')" style="padding:5px 12px;font-size:11px">全部测试</button>
                <button class="btn-secondary" @click="resetJsContext" style="padding:5px 12px;font-size:11px">重置上下文</button>
              </div>
              <div v-if="jsResult" class="debug-result" style="white-space:pre-wrap;word-break:break-all;max-height:400px">{{ jsResult }}</div>
            </div>
          </div>

          <div v-if="activeTab === 'webview'" class="debug-content">
            <div class="input-row"><input v-model="webviewUrl" type="text" placeholder="输入 URL..." class="debug-input" /></div>
            <div class="input-row" style="align-items:flex-start"><textarea v-model="webviewJs" class="debug-textarea" placeholder="自定义 JS（可选）" style="min-height:80px" spellcheck="false"></textarea></div>
            <div class="input-row">
              <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted)"><span>超时(秒):</span><input v-model.number="webviewTimeout" type="number" min="5" max="120" style="width:50px;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-card);color:var(--text-primary);font-size:12px" /></label>
              <button class="btn-primary" :disabled="running" @click="runWebView" style="padding:7px 22px;font-size:13px">{{ running ? '加载中...' : 'WebView 加载' }}</button>
            </div>
            <div v-if="webviewResult !== null" class="debug-result" style="white-space:pre-wrap;word-break:break-all;max-height:350px;font-family:var(--font-mono);font-size:11px">
              <div style="margin-bottom:6px;color:var(--text-secondary);font-size:11px">{{ webviewDuration }}ms · {{ webviewResult.length }} 字符</div>
              <div>{{ webviewResult.substring(0, 10000) }}</div>
            </div>
          </div>

          <div v-if="activeTab === 'network'" class="debug-content">
            <div class="input-row">
              <input v-model="netUrl" type="text" placeholder="输入 URL..." class="debug-input" @keyup.enter="runNet" />
              <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);white-space:nowrap"><input type="checkbox" v-model="netUseWebView" /> WebView</label>
              <button class="btn-primary" :disabled="running" @click="runNet" style="padding:7px 22px;font-size:13px">{{ running ? '请求中...' : '发送请求' }}</button>
            </div>
            <div v-if="netStatus" style="font-size:12px;color:var(--text-secondary)">状态: {{ netStatus }} · {{ netDuration }}ms</div>
            <div v-if="netHeaders" class="debug-result" style="max-height:150px;font-size:11px;white-space:pre-wrap;word-break:break-all">{{ netHeaders }}</div>
            <div v-if="netBody" class="debug-result" style="max-height:400px;white-space:pre-wrap;word-break:break-all;font-family:var(--font-mono);font-size:12px">{{ netBody.substring(0, 5000) }}</div>
          </div>

          <div class="debug-log">
            <div class="log-header">
              <span>日志 ({{ allLogs.length }})</span>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                <select v-model="logFilterModule" style="font-size:10px;padding:2px 4px;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border-color);border-radius:4px">
                  <option value="all">全部模块</option>
                  <option value="explore">发现页</option>
                  <option value="search">搜索</option>
                  <option value="bookshelf">书架</option>
                  <option value="reader">阅读器</option>
                  <option value="source">书源管理</option>
                  <option value="network">网络</option>
                  <option value="engine">引擎</option>
                  <option value="system">系统</option>
                  <option value="ui">UI</option>
                  <option value="storage">存储</option>
                  <option value="login">登录</option>
                  <option value="sync">同步</option>
                  <option value="sandbox">沙箱</option>
                </select>
                <select v-model="logFilterSource" style="font-size:10px;padding:2px 4px;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border-color);border-radius:4px">
                  <option value="all">全部来源</option>
                  <option value="rust">Rust</option>
                  <option value="deno">Deno</option>
                  <option value="frontend">前端</option>
                </select>
                <button class="btn-secondary" @click="clearLogs" style="padding:2px 8px;font-size:10px">清空</button>
              </div>
            </div>
            <div class="log-list" ref="logListRef">
              <div v-for="(log, idx) in filteredLogs" :key="idx" class="log-entry" :class="'log-' + log.level">
                <span class="log-time">{{ log.time }}</span>
                <span class="log-module">{{ log.module }}</span>
                <span class="log-source">{{ log.source }}</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import CustomDropdown from './CustomDropdown.vue'
import { store, engine, network } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import { onLog, logHistory, type LogEntry } from '../../engine/event/index.js'
import type { BookSource } from '@shared/types'

const props = defineProps<{ visible: boolean; sources: BookSource[]; sourceIndex?: number }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'select-source', v: number): void }>()

const message = useMessage()
const panelRef = ref<HTMLElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const logListRef = ref<HTMLElement | null>(null)
const running = ref(false)
const editMode = ref(false)
const saving = ref(false)

const panelStyle = ref<Record<string, string>>({ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '900px', height: '680px', zIndex: '9999' })
const dragState = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 }

function startDrag(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.header-actions')) return
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
const tabs = [
  { key: 'search', label: '搜索' }, { key: 'toc', label: '目录' }, { key: 'content', label: '正文' },
  { key: 'js', label: 'JS' }, { key: 'webview', label: 'WebView' }, { key: 'network', label: '网络' }
]
const searchKeyword = ref(''); const tocUrl = ref(''); const contentUrl = ref('')
const searchResult = ref<any[]>([]); const tocResult = ref<any[]>([]); const contentResult = ref('')
const jsCode = ref(''); const jsResult = ref(''); const jsContextResult = ref('')
const webviewUrl = ref(''); const webviewJs = ref(''); const webviewTimeout = ref(30)
const webviewResult = ref<string | null>(null); const webviewDuration = ref(0)
const netUrl = ref(''); const netStatus = ref(''); const netHeaders = ref(''); const netBody = ref('')
const netUseWebView = ref(false); const netDuration = ref(0)
const editJson = ref('')
const editError = ref('')

// 快捷输入
const keyboardAssists = ref<any[]>([])

const allLogs = ref<LogEntry[]>([])
const logFilterModule = ref<string>('all')
const logFilterSource = ref<string>('all')

const filteredLogs = computed(() => {
  let result = allLogs.value
  if (logFilterModule.value !== 'all') result = result.filter(log => log.module === logFilterModule.value)
  if (logFilterSource.value !== 'all') result = result.filter(log => log.source === logFilterSource.value)
  return result
})

const sourceOptions = computed(() => {
  const opts: { label: string; value: number }[] = [{ label: '选择书源...', value: -1 }]
  const arr = Array.isArray(props.sources) ? props.sources : []
  for (let i = 0; i < arr.length; i++) { opts.push({ label: arr[i].bookSourceName || arr[i].name || '未命名', value: i }) }
  return opts
})

async function loadKeyboardAssists() {
  try { keyboardAssists.value = (await store.get('keyboardAssists')) || [] } catch { keyboardAssists.value = [] }
}

function insertAssist(item: any) {
  const textarea = editorRef.value; if (!textarea) return
  const start = textarea.selectionStart; const end = textarea.selectionEnd
  const text = editJson.value
  editJson.value = text.substring(0, start) + item.value + text.substring(end)
  nextTick(() => { textarea.focus(); textarea.setSelectionRange(start + item.value.length, start + item.value.length) })
}

function clearLogs() { allLogs.value = [] }
function onSourceChange(val: number) { selectedIndex.value = val; emit('select-source', val); clearAll() }
function closePanel() { emit('update:visible', false) }

function clearAll() { searchResult.value = []; tocResult.value = []; contentResult.value = ''; jsResult.value = ''; jsContextResult.value = ''; webviewResult.value = null; netBody.value = ''; netHeaders.value = ''; netStatus.value = '' }

function openEditor() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  const arr = Array.isArray(props.sources) ? props.sources : []
  editJson.value = JSON.stringify(arr[selectedIndex.value] || {}, null, 2)
  editError.value = ''
  editMode.value = true
  loadKeyboardAssists()
}

async function saveEdit() {
  try { JSON.parse(editJson.value); editError.value = '' } catch (err: any) { editError.value = 'JSON 格式错误: ' + err.message; return }
  saving.value = true
  try {
    const sources: any[] = (await store.get('bookSource')) || []
    const arr = Array.isArray(sources) ? sources : []
    if (selectedIndex.value >= 0 && selectedIndex.value < arr.length) { arr[selectedIndex.value] = JSON.parse(editJson.value); await store.set('bookSource', arr) }
    editMode.value = false; message.success('已保存')
  } catch (err: any) { editError.value = '保存失败: ' + err.message }
  finally { saving.value = false }
}

async function runSearch() { if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }; if (!searchKeyword.value.trim()) { message.warning('请输入关键词'); return }; running.value = true; searchResult.value = []; try { const arr = Array.isArray(props.sources) ? props.sources : []; const source = JSON.parse(JSON.stringify(arr[selectedIndex.value])); const { search: engineSearch } = await import('../../engine/business/search.js'); const books = await engineSearch(source, searchKeyword.value, { page: 1 }); if (Array.isArray(books) && books.length > 0) searchResult.value = books } catch (err: any) { message.error('搜索失败: ' + err.message) } finally { running.value = false } }
async function runToc() { if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }; if (!tocUrl.value.trim()) { message.warning('请输入URL'); return }; running.value = true; tocResult.value = []; try { const arr = Array.isArray(props.sources) ? props.sources : []; const source = JSON.parse(JSON.stringify(arr[selectedIndex.value])); const { getToc } = await import('../../engine/business/toc.js'); const chapters = await getToc(source, tocUrl.value, {}); if (Array.isArray(chapters) && chapters.length > 0) { for (let i = 0; i < Math.min(chapters.length, 20); i++) { const ch = chapters[i]; tocResult.value.push({ title: ch.title || '无标题', url: ch.url || '' }) } } } catch (err: any) { message.error('获取目录失败: ' + err.message) } finally { running.value = false } }
async function runContent() { if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }; if (!contentUrl.value.trim()) { message.warning('请输入URL'); return }; running.value = true; contentResult.value = ''; try { const arr = Array.isArray(props.sources) ? props.sources : []; const source = JSON.parse(JSON.stringify(arr[selectedIndex.value])); const { getContent } = await import('../../engine/business/content.js'); contentResult.value = await getContent(source, contentUrl.value, { bookKind: (source as any)?.kind, book: {} as any }) } catch (err: any) { message.error('获取正文失败: ' + err.message) } finally { running.value = false } }
async function runWebView() { if (!webviewUrl.value.trim()) { message.warning('请输入URL'); return }; running.value = true; webviewResult.value = null; const startTime = Date.now(); try { const sourceType = selectedIndex.value >= 0 ? (Array.isArray(props.sources) ? props.sources[selectedIndex.value]?.bookSourceType ?? 0 : 0) : 0; const html: string = await network.fetchWebView(webviewUrl.value.trim(), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, webJs: webviewJs.value.trim() || undefined, timeout: (webviewTimeout.value || 30) * 1000, sourceType }); webviewDuration.value = Date.now() - startTime; webviewResult.value = typeof html === 'string' ? html : JSON.stringify(html) } catch (err: any) { webviewDuration.value = Date.now() - startTime; webviewResult.value = '错误: ' + (err?.message || String(err)) } finally { running.value = false } }
async function runNet() { if (!netUrl.value.trim()) { message.warning('请输入URL'); return }; running.value = true; netStatus.value = ''; netHeaders.value = ''; netBody.value = ''; const startTime = Date.now(); try { if (netUseWebView.value) { const sourceType = selectedIndex.value >= 0 ? (Array.isArray(props.sources) ? props.sources[selectedIndex.value]?.bookSourceType ?? 0 : 0) : 0; const html: string = await network.fetchWebView(netUrl.value.trim(), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 30000, sourceType }); netDuration.value = Date.now() - startTime; netStatus.value = '200'; netBody.value = typeof html === 'string' ? html : JSON.stringify(html) } else { const { getGlobalHttpClient } = await import('../../engine/network/client.js'); const httpClient = getGlobalHttpClient(); let headers: Record<string, string> = {}; if (selectedIndex.value >= 0) { const arr = Array.isArray(props.sources) ? props.sources : []; const source = JSON.parse(JSON.stringify(arr[selectedIndex.value])); const { parseHeader } = await import('../../engine/business/toc.js'); headers = await parseHeader(source, {}) }; const response = await httpClient.request({ url: netUrl.value, method: 'GET', headers, timeout: 30000 }); netDuration.value = Date.now() - startTime; netStatus.value = String(response.status); netHeaders.value = JSON.stringify(response.headers, null, 2); netBody.value = response.data as string } } catch (err: any) { netDuration.value = Date.now() - startTime; netStatus.value = '错误'; netBody.value = err.message || String(err) } finally { running.value = false } }

const presets: Record<string, string> = {
  base: `java.toast("hello"); java.log("hello");`,
  ajax: `java.ajax("https://httpbin.org/get")`,
  b64: `var e = java.base64Encode("hello"); JSON.stringify({ e, d: java.base64Decode(e) });`,
  all: `var r = {}; r.b64 = java.base64Encode("h"); r.md5 = java.md5Encode("h"); r.time = java.timeFormat(1700000000000); r.uuid = java.randomUUID(); try { var a = java.ajax("https://httpbin.org/get"); r.ajaxOk = a.includes("httpbin"); } catch(e) { r.ajaxErr = e.message } java.put("k","v"); r.kv = java.get("k"); JSON.stringify(r, null, 2);`
}
function runPreset(name: string) { jsCode.value = presets[name] || '' }
function resetJsContext() { jsContextResult.value = ''; jsResult.value = '' }
async function runJs() { if (!jsCode.value.trim()) { message.warning('请输入代码'); return }; running.value = true; jsResult.value = ''; try { const arr = Array.isArray(props.sources) ? props.sources : []; const source = arr[selectedIndex.value] || {}; const prevResult = jsContextResult.value || ''; const res = await engine.executeJs(jsCode.value, { result: prevResult, src: prevResult, source: source || {}, baseUrl: (source || {}).bookSourceUrl || '', book: { kind: '123' }, key: '', page: 1 }); jsResult.value = typeof res === 'string' ? res : JSON.stringify(res, null, 2); if (jsResult.value.length === 0) jsResult.value = '返回空/undefined'; else jsContextResult.value = jsResult.value } catch (err: any) { jsResult.value = '' + (err?.message || String(err)) } finally { running.value = false } }

function handleKeydown(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
  if (e.key === 'Escape' && props.visible) closePanel()
}

const logHandler = (entry: LogEntry) => { allLogs.value = [...allLogs.value, entry].slice(-1000) }
let unsubscribe: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  unsubscribe = onLog(logHandler)
  for (const entry of logHistory) { allLogs.value = [...allLogs.value, entry].slice(-1000) }
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
})
watch(() => props.sourceIndex, (val) => { if (val !== undefined && val >= 0) selectedIndex.value = val }, { immediate: true })
</script>

<style scoped>
.debug-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); display: flex; flex-direction: column; overflow: hidden; min-width: 600px; min-height: 400px; resize: both; z-index: 9999; }
.debug-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); cursor: grab; flex-shrink: 0; user-select: none; }
.debug-panel-header:active { cursor: grabbing; }
.header-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); pointer-events: none; }
.header-icon { color: var(--brand); flex-shrink: 0; }
.header-title { font-weight: 600; }
.header-actions { display: flex; gap: 6px; pointer-events: auto; }
.header-btn { width: 30px; height: 30px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: background 0.18s, color 0.18s; }
.header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.header-btn-close:hover { background: #e74c3c; color: #fff; }
.debug-editor-header { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.btn-back-inline { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: var(--radius-sm); transition: color 0.2s, background 0.2s; }
.btn-back-inline:hover { color: var(--text-primary); background: var(--bg-hover); }
.keyboard-assists { display: flex; gap: 4px; padding: 6px 14px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; flex-wrap: wrap; background: var(--bg); }
.debug-editor-body { flex: 1; overflow: hidden; padding: 0; }
.debug-editor-textarea { width: 100%; height: 100%; background: var(--bg); color: var(--text-primary); border: none; outline: none; resize: none; padding: 14px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; box-sizing: border-box; }
.debug-editor-error { padding: 8px 14px; font-size: 12px; color: #e74c3c; background: rgba(231,76,60,0.08); border-top: 1px solid rgba(231,76,60,0.2); flex-shrink: 0; }
.debug-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 14px; gap: 10px; }
.debug-toolbar { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
.debug-tabs { display: flex; gap: 2px; background: var(--bg); border-radius: var(--radius-sm); padding: 2px; }
.debug-tab { padding: 5px 14px; font-size: 11px; color: var(--text-muted); background: transparent; border: none; border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, background 0.2s; }
.debug-tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.debug-tab.active { color: var(--brand); background: var(--bg-active); }
.debug-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.input-row { display: flex; gap: 8px; align-items: center; }
.debug-input { flex: 1; padding: 8px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; }
.debug-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.debug-textarea { flex: 1; min-height: 180px; padding: 10px 14px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; font-family: var(--font-mono); line-height: 1.5; resize: vertical; box-sizing: border-box; }
.debug-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.debug-result { padding: 12px 14px; background: var(--bg); border-radius: var(--radius-sm); border: 1px solid var(--border-color); max-height: 200px; overflow-y: auto; }
.book-item { display: flex; gap: 8px; padding: 5px 8px; font-size: 12px; color: var(--text-secondary); border-radius: var(--radius-sm); }
.book-item:hover { background: var(--bg-hover); }
.item-index { color: var(--text-muted); min-width: 28px; font-size: 11px; }
.item-name { flex: 1; color: var(--text-primary); font-weight: 500; }
.item-author { color: var(--text-muted); }
.item-url { color: var(--text-muted); font-size: 10px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
.debug-log { flex-shrink: 0; height: 260px; border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; }
.log-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; flex-shrink: 0; }
.log-list { flex: 1; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; }
.log-entry { display: flex; gap: 6px; padding: 1px 4px; flex-shrink: 0; }
.log-time { color: var(--text-muted); min-width: 70px; font-size: 10px; flex-shrink: 0; }
.log-module { color: var(--brand); min-width: 50px; font-size: 9px; flex-shrink: 0; text-align: center; font-weight: 600; }
.log-source { color: var(--text-muted); min-width: 32px; font-size: 9px; flex-shrink: 0; text-align: center; }
.log-message { word-break: break-all; }
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-warn .log-message { color: #d4a017; }
.log-info .log-message { color: var(--text-secondary); }
</style>
