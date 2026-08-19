<template>
  <div class="rss-edit-page">
    <header class="subpage-header">
      <BackButton /><h2>{{ isNew ? '新建订阅源' : '编辑订阅源' }}</h2>
      <div style="flex:1"></div>
      <button class="btn-secondary" style="padding:4px 14px;font-size:12px" @click="openLogin">登录</button>
      <button class="btn-primary" :disabled="saving" @click="saveSource">{{ saving ? '保存中...' : '保存' }}</button>
    </header>
    <div class="edit-tabs">
      <button v-for="tab in tabs" :key="tab.key" class="edit-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
    </div>
    <div class="edit-body">
      <div v-if="activeTab === 'base'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>名称 <span class="required">*</span></label><input v-model="form.sourceName" type="text" class="input-search" placeholder="订阅源名称" /></div>
          <div class="form-group full"><label>URL <span class="required">*</span></label><input v-model="form.sourceUrl" type="text" class="input-search" placeholder="https://example.com" /></div>
          <div class="form-group"><label>图标</label><input v-model="form.sourceIcon" type="text" class="input-search" placeholder="https://example.com/icon.png" /></div>
          <div class="form-group"><label>分组</label><div style="display:flex;gap:6px;align-items:center"><input v-model="form.sourceGroup" type="text" class="input-search" placeholder="legado" style="flex:1" list="group-suggest" /><button class="btn-secondary" style="padding:2px 10px;font-size:11px;white-space:nowrap" @click="openGroupManager">管理</button></div><datalist id="group-suggest"><option v-for="g in existingGroups" :key="g" :value="g" /></datalist></div>
          <div class="form-group full"><label>注释</label><input v-model="form.sourceComment" type="text" class="input-search" placeholder="订阅源说明" /></div>
          <div class="form-group full"><label>变量说明</label><input v-model="form.variableComment" type="text" class="input-search" placeholder="自定义变量说明" /></div>
          <div class="form-group"><label>分类 URL</label><input v-model="form.sortUrl" type="text" class="input-search" placeholder="分类1::url1\n分类2::url2" /></div>
          <div class="form-group"><label>搜索 URL</label><input v-model="form.searchUrl" type="text" class="input-search" placeholder="https://example.com/search?q={{key}}" /></div>
        </div>
        <div class="form-divider">开关</div>
        <div class="switch-grid">
          <label class="switch-item"><input type="checkbox" v-model="form.enabled" /> 启用</label>
          <label class="switch-item"><input type="checkbox" v-model="form.singleUrl" /> 单页源</label>
          <label class="switch-item"><input type="checkbox" v-model="form.enabledCookieJar" /> 保存 Cookie</label>
          <label class="switch-item"><input type="checkbox" v-model="form.preload" /> 预加载</label>
          <label class="switch-item"><input type="checkbox" v-model="form.cacheFirst" /> 优先缓存</label>
        </div>
        <div class="form-divider">类型 &amp; 样式</div>
        <div class="form-grid">
          <div class="form-group"><label>类型</label><select v-model="form.type" class="form-select"><option :value="0">网页</option><option :value="1">图片</option><option :value="2">视频</option></select></div>
          <div class="form-group"><label>文章样式</label><select v-model="form.articleStyle" class="form-select"><option :value="0">列表</option><option :value="1">卡片</option><option :value="2">网格2列</option><option :value="3">瀑布流</option><option :value="4">网格3列</option></select></div>
        </div>
        <div class="form-divider">网络 &amp; 登录</div>
        <div class="form-grid">
          <div class="form-group full"><label>请求头</label><textarea v-model="form.header" class="form-textarea" placeholder='{"User-Agent": "..."}' rows="2"></textarea></div>
          <div class="form-group"><label>并发率</label><input v-model="form.concurrentRate" type="text" class="input-search" placeholder="1" /></div>
          <div class="form-group full"><label>JS 库</label><textarea v-model="form.jsLib" class="form-textarea" placeholder="JS 库代码或 JSON 配置" rows="2"></textarea></div>
          <div class="form-group full"><label>登录 URL</label><input v-model="form.loginUrl" type="text" class="input-search" placeholder="https://example.com/login" /></div>
          <div class="form-group full"><label>登录 UI</label><textarea v-model="form.loginUi" class="form-textarea" placeholder="登录 UI 配置" rows="2"></textarea></div>
          <div class="form-group full"><label>登录检测 JS</label><textarea v-model="form.loginCheckJs" class="form-textarea" placeholder="return document.querySelector('.user') !== null" rows="2"></textarea></div>
          <div class="form-group full"><label>封面解密 JS</label><textarea v-model="form.coverDecodeJs" class="form-textarea" placeholder="封面图片解密代码" rows="2"></textarea></div>
        </div>
      </div>
      <div v-if="activeTab === 'start'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>起始 HTML</label><textarea v-model="form.startHtml" class="form-textarea" placeholder="起始页 HTML 内容" rows="6"></textarea></div>
          <div class="form-group full"><label>起始样式</label><textarea v-model="form.startStyle" class="form-textarea" placeholder="CSS 样式" rows="3"></textarea></div>
          <div class="form-group full"><label>起始 JS</label><textarea v-model="form.startJs" class="form-textarea" placeholder="JS 代码" rows="4"></textarea></div>
          <div class="form-group full"><label>预注入 JS</label><textarea v-model="form.preloadJs" class="form-textarea" placeholder="页面加载前执行的 JS" rows="3"></textarea></div>
        </div>
        <div class="switch-grid">
          <label class="switch-item"><input type="checkbox" v-model="form.enableJs" /> 启用 JS</label>
          <label class="switch-item"><input type="checkbox" v-model="form.loadWithBaseUrl" /> 基于 BaseURL 加载</label>
          <label class="switch-item"><input type="checkbox" v-model="form.showWebLog" /> 输出 WebView 日志</label>
        </div>
      </div>
      <div v-if="activeTab === 'list'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>列表规则 <span class="hint">支持 CSS/XPath/JSONPath/JS</span></label><textarea v-model="form.ruleArticles" class="form-textarea" placeholder=".article-list > li 或 //div[@class='item']" rows="3"></textarea></div>
          <div class="form-group full"><label>下一页规则</label><input v-model="form.ruleNextPage" type="text" class="input-search" placeholder=".next-page@href 或 PAGE" /></div>
          <div class="form-grid-2col">
            <div class="form-group"><label>标题规则</label><input v-model="form.ruleTitle" type="text" class="input-search" placeholder="h2@text" /></div>
            <div class="form-group"><label>链接规则</label><input v-model="form.ruleLink" type="text" class="input-search" placeholder="a@href" /></div>
            <div class="form-group"><label>日期规则</label><input v-model="form.rulePubDate" type="text" class="input-search" placeholder=".date@text" /></div>
            <div class="form-group"><label>描述规则</label><input v-model="form.ruleDescription" type="text" class="input-search" placeholder=".desc@text" /></div>
            <div class="form-group"><label>图片规则</label><input v-model="form.ruleImage" type="text" class="input-search" placeholder="img@src" /></div>
          </div>
        </div>
        <div class="form-hint"><p>💡 规则语法：</p><ul><li><code>CSS</code>: <code>.class@text</code> 或 <code>#id@html</code></li><li><code>XPath</code>: <code>/html/body/div</code> 或 <code>@XPath://div</code></li><li><code>JSONPath</code>: <code>$.data.list[0].title</code></li><li><code>JS</code>: <code>&lt;js&gt;return result.title;&lt;/js&gt;</code></li><li><code>正则替换</code>: <code>rule##pattern##replacement</code></li><li><code>逻辑组合</code>: <code>rule1 || rule2</code>（或 <code>&amp;&amp;</code> / <code>%%</code>）</li></ul></div>
      </div>
      <div v-if="activeTab === 'webview'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>正文规则</label><textarea v-model="form.ruleContent" class="form-textarea" placeholder="#content@html 或 //div[@class='content']" rows="3"></textarea></div>
          <div class="form-group full"><label>样式</label><textarea v-model="form.style" class="form-textarea" placeholder="body { font-size: 16px; }" rows="3"></textarea></div>
          <div class="form-group full"><label>注入 JS</label><textarea v-model="form.injectJs" class="form-textarea" placeholder="document.querySelector('.ad').remove()" rows="3"></textarea></div>
          <div class="form-group full"><label>内容白名单</label><textarea v-model="form.contentWhitelist" class="form-textarea" placeholder="每行一个 URL 前缀" rows="2"></textarea></div>
          <div class="form-group full"><label>内容黑名单</label><textarea v-model="form.contentBlacklist" class="form-textarea" placeholder="每行一个 URL 前缀" rows="2"></textarea></div>
          <div class="form-group full"><label>URL 跳转拦截</label><textarea v-model="form.shouldOverrideUrlLoading" class="form-textarea" placeholder="JS 代码，返回 true 拦截" rows="3"></textarea></div>
        </div>
      </div>
    </div>
    <div class="edit-footer">
      <div class="quick-insert">
        <span style="font-size:12px;color:var(--text-muted)">快捷插入：</span>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('<js>')">JS</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@js:')">@js</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@XPath:')">XPath</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@Json:')">JSONPath</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@CSS:')">CSS</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@webjs:')">WebJS</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('##')">##</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText(' || ')">||</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText(' && ')">&amp;&amp;</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText(' %% ')">%%</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('@put:{')">@put</button>
        <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="insertText('{{}}')">{{ }}</button>
      </div>
    </div>
    <RssLogin ref="loginRef" @success="msg.success('登录成功')" />
    <RssGroupManager ref="groupManagerRef" @change="onGroupChange" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import BackButton from '@/components/common/BackButton.vue'
import RssLogin from '@/components/rss/RssLogin.vue'
import RssGroupManager from '@/components/rss/RssGroupManager.vue'
import type { RssSource } from '@/types'

const route = useRoute()
const router = useRouter()
const msg = useMessage()

const isNew = computed(() => route.query.sourceUrl === undefined)
const saving = ref(false)
const activeTab = ref('base')
const loginRef = ref<InstanceType<typeof RssLogin> | null>(null)
const groupManagerRef = ref<InstanceType<typeof RssGroupManager> | null>(null)

const tabs = [
  { key: 'base', label: '基础信息' },
  { key: 'start', label: '起始页' },
  { key: 'list', label: '列表规则' },
  { key: 'webview', label: 'WebView' },
]

const form = ref<RssSource>({
  sourceName: '', sourceUrl: '', sourceIcon: null, sourceGroup: null, sourceComment: null, variableComment: null,
  enabled: true, singleUrl: false, enabledCookieJar: true, preload: false, cacheFirst: false,
  type: 0, articleStyle: 0, sortUrl: null, searchUrl: null, header: null, concurrentRate: null, jsLib: null,
  loginUrl: null, loginUi: null, loginCheckJs: null, coverDecodeJs: null,
  startHtml: null, startStyle: null, startJs: null, preloadJs: null,
  enableJs: true, loadWithBaseUrl: true, showWebLog: false,
  ruleArticles: null, ruleNextPage: null, ruleTitle: null, ruleLink: null, rulePubDate: null, ruleDescription: null, ruleImage: null,
  ruleContent: null, style: null, injectJs: null, contentWhitelist: null, contentBlacklist: null, shouldOverrideUrlLoading: null,
  customOrder: 0,
})

const existingGroups = ref<string[]>([])
let originalSourceUrl = ''

onMounted(async () => {
  await loadExistingGroups()
  const sourceUrl = route.query.sourceUrl as string
  if (sourceUrl) {
    originalSourceUrl = sourceUrl
    const data = await store.get('rssSources')
    const sources: RssSource[] = Array.isArray(data) ? data : []
    const found = sources.find((s) => s.sourceUrl === sourceUrl)
    if (found) form.value = JSON.parse(JSON.stringify(found))
  }
})

async function loadExistingGroups(): Promise<void> {
  try {
    const data = await store.get('rssSources')
    const sources: RssSource[] = Array.isArray(data) ? data : []
    const groups = new Set<string>()
    for (const s of sources) {
      if (s.sourceGroup) groups.add(s.sourceGroup)
    }
    existingGroups.value = Array.from(groups).sort()
  } catch {
    existingGroups.value = []
  }
}

function insertText(text: string): void {
  const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement
  if (!activeEl) return
  const start = activeEl.selectionStart ?? 0
  const end = activeEl.selectionEnd ?? 0
  const value = activeEl.value
  const before = value.substring(0, start)
  const after = value.substring(end)

  // 使用 native setter 触发 Vue 响应式
  const setter = Object.getOwnPropertyDescriptor(
    activeEl instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set
  if (setter) {
    setter.call(activeEl, before + text + after)
  } else {
    activeEl.value = before + text + after
  }
  activeEl.dispatchEvent(new Event('input', { bubbles: true }))
  activeEl.dispatchEvent(new Event('change', { bubbles: true }))

  const newPos = start + text.length
  activeEl.setSelectionRange(newPos, newPos)
  activeEl.focus()
}

async function openLogin(): Promise<void> {
  if (!form.value.sourceUrl) { msg.warning('请先保存订阅源'); return }
  await saveSource()
  const data = await store.get('rssSources')
  const sources: RssSource[] = Array.isArray(data) ? data : []
  const found = sources.find((s) => s.sourceUrl === form.value.sourceUrl)
  if (found) loginRef.value?.open(found)
  else msg.error('未找到订阅源')
}

function openGroupManager(): void { groupManagerRef.value?.open() }
function onGroupChange(): void { loadExistingGroups() }

async function saveSource(): Promise<void> {
  const f = form.value
  if (!f.sourceName.trim()) { msg.warning('请填写名称'); return }
  if (!f.sourceUrl.trim()) { msg.warning('请填写 URL'); return }

  saving.value = true
  try {
    const data = await store.get('rssSources')
    const sources: RssSource[] = Array.isArray(data) ? data : []
    const newUrl = f.sourceUrl.trim()

    if (originalSourceUrl && newUrl !== originalSourceUrl) {
      // URL 变更：移除旧条目，添加新条目
      const filtered = sources.filter((s) => s.sourceUrl !== originalSourceUrl)
      if (filtered.some((s) => s.sourceUrl === newUrl)) {
        msg.warning('URL 已存在')
        saving.value = false
        return
      }
      f.sourceUrl = newUrl
      filtered.push(f)
      await store.set('rssSources', filtered)
      originalSourceUrl = newUrl
    } else if (originalSourceUrl) {
      const idx = sources.findIndex((s) => s.sourceUrl === originalSourceUrl)
      if (idx !== -1) {
        sources[idx] = f
      } else {
        sources.push(f)
      }
      await store.set('rssSources', sources)
    } else {
      const existing = new Set(sources.map((s) => s.sourceUrl))
      if (existing.has(newUrl)) {
        msg.warning('URL 已存在')
        saving.value = false
        return
      }
      const maxOrder = sources.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
      f.customOrder = maxOrder + 1
      sources.push(f)
      await store.set('rssSources', sources)
    }

    msg.success('已保存')
    router.back()
  } catch (err: any) {
    msg.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.rss-edit-page { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-shrink: 0; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.edit-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; flex-shrink: 0; background: var(--bg); padding: 0 4px; }
.edit-tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
.edit-tab:hover { color: var(--text-primary); }
.edit-tab.active { color: var(--brand); border-bottom-color: var(--brand); }
.edit-body { flex: 1; overflow-y: auto; padding-bottom: 20px; }
.tab-content { max-width: 820px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form-group .required { color: #e74c3c; }
.form-group .hint { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.input-search { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.input-search:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-textarea { padding: 8px 12px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; resize: vertical; font-family: var(--font-mono); line-height: 1.5; transition: border-color 0.2s, box-shadow 0.2s; }
.form-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-select { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; width: 100%; transition: border-color 0.2s, box-shadow 0.2s; }
.form-select:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-divider { font-size: 14px; font-weight: 600; color: var(--text-primary); padding: 18px 0 10px 0; border-bottom: 1px solid var(--border-color); margin: 16px 0 14px 0; grid-column: 1 / -1; }
.switch-grid { display: flex; flex-wrap: wrap; gap: 16px 24px; padding: 8px 0 12px 0; }
.switch-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.switch-item input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
.form-hint { background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 18px; margin-top: 16px; font-size: 12px; color: var(--text-muted); }
.form-hint p { margin: 0 0 6px 0; font-weight: 500; color: var(--text-secondary); }
.form-hint ul { margin: 4px 0 0 0; padding-left: 20px; list-style: none; }
.form-hint li { padding: 2px 0; }
.form-hint code { background: var(--bg-hover); padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono); }
.edit-footer { border-top: 1px solid var(--border-color); padding: 10px 0; flex-shrink: 0; }
.quick-insert { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
</style>
