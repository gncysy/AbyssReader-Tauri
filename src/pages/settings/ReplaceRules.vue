<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>替换规则</h2>
    </header>

    <div class="setting-item">
      <div>
        <span class="label-text">替换规则</span>
        <span class="label-desc">{{ replaceRuleStore.rules.length }} 条 · 正文净化与修正</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-secondary" @click="triggerImport">导入 JSON</button>
         name="field-8142"
        <button class="btn-secondary" @click="showImportUrlModal = true">从 URL</button>
        <button class="btn-secondary" @click="showPasteModal = true">粘贴 JSON</button>
        <button class="btn-primary" @click="openAddDialog">添加规则</button>
      </div>
    </div>

    <div v-if="replaceRuleStore.rules.length > 0" class="rule-list">
      <div v-for="rule in replaceRuleStore.rules" :key="rule.id" class="rule-card">
        <div class="rule-header">
          <span class="rule-name">{{ rule.name }}</span>
          <span class="rule-badge">{{ rule.scope === 'title' ? '标题' : '正文' }}</span>
          <span v-if="rule.isRegex" class="rule-badge rule-badge-regex">正则</span>
        </div>
        <div class="rule-row"><span class="rule-label">匹配</span><code>{{ rule.pattern }}</code></div>
        <div class="rule-row"><span class="rule-label">替换</span><code>{{ rule.replacement || '(空)' }}</code></div>
        <div class="rule-actions">
          <label class="toggle-switch"> name="field-6462"<span class="toggle-slider"></span></label>
          <button class="btn-secondary" @click="editRule(rule)">编辑</button>
          <button class="btn-danger" @click="deleteRule(rule)">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state"><p>暂无替换规则，导入 JSON 开始净化阅读</p></div>

    <n-modal v-model:show="showDialog" preset="dialog" :title="editingRule ? '编辑规则' : '添加规则'" positive-text="保存" negative-text="取消" @positive-click="saveRule">
      <div class="dialog-form">
        <div class="form-group"><label>规则名称</label><n-input v-model:value="form.name" placeholder="如：去除广告" /></div>
        <div class="form-group"><label>作用范围</label>
          <select v-model="form.scope" class="form-select"><option value="content">正文</option><option value="title">标题</option></select>
        </div>
        <div class="form-group"><label>匹配模式</label><n-input v-model:value="form.pattern" placeholder="正则或纯文本" /></div>
        <div class="form-group"><label>替换为</label><n-input v-model:value="form.replacement" placeholder="留空表示删除" /></div>
        <label class="checkbox-label"> name="field-2242"<span>正则表达式</span></label>
      </div>
    </n-modal>

    <n-modal v-model:show="showPasteModal" preset="dialog" title="粘贴替换规则 JSON" positive-text="导入" negative-text="取消" @positive-click="importFromJson">
      <n-input v-model:value="pasteJson" type="textarea" placeholder="粘贴替换规则 JSON 数组..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>

    <n-modal v-model:show="showImportUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" negative-text="取消" @positive-click="importFromUrl">
      <n-input v-model:value="importUrl" placeholder="输入替换规则 JSON URL..." />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import { useReplaceRuleStore } from '@/store/replace-rules'
import { network } from '@/api'
import BackButton from '@/components/BackButton.vue'
import type { ReplaceRule } from '@shared/types'

const message = useMessage()
const replaceRuleStore = useReplaceRuleStore()

const showDialog = ref(false)
const editingRule = ref<ReplaceRule | null>(null)
const form = ref({ name: '', scope: 'content' as 'title' | 'content', pattern: '', replacement: '', isRegex: false })

const showPasteModal = ref(false)
const pasteJson = ref('')
const showImportUrlModal = ref(false)
const importUrl = ref('')
const importInput = ref<HTMLInputElement | null>(null)

function openAddDialog() {
  editingRule.value = null
  form.value = { name: '', scope: 'content', pattern: '', replacement: '', isRegex: false }
  showDialog.value = true
}

function editRule(rule: ReplaceRule) {
  editingRule.value = rule
  form.value = { name: rule.name, scope: rule.scope, pattern: rule.pattern, replacement: rule.replacement, isRegex: rule.isRegex }
  showDialog.value = true
}

async function saveRule() {
  if (!form.value.name.trim() || !form.value.pattern.trim()) { message.warning('名称和匹配模式不能为空'); return }
  if (editingRule.value) {
    await replaceRuleStore.updateRule(editingRule.value.id, { ...form.value })
    message.success('已更新')
  } else {
    await replaceRuleStore.addRule({
      id: Date.now().toString(36), ...form.value,
      isEnabled: true, bookName: '', bookOrigin: '', timeoutMs: 5000,
    })
    message.success('已添加')
  }
  showDialog.value = false
}

async function deleteRule(rule: ReplaceRule) {
  await replaceRuleStore.removeRule(rule.id)
  message.success('已删除')
}

function triggerImport() { importInput.value?.click() }

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try { const text = await file.text(); await importRulesFromJson(text); message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = '' }
}

async function importFromJson() {
  if (!pasteJson.value.trim()) { message.warning('请粘贴 JSON'); return }
  try { await importRulesFromJson(pasteJson.value); pasteJson.value = ''; showPasteModal.value = false; message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
}

async function importFromUrl() {
  if (!importUrl.value.trim()) { message.warning('请输入 URL'); return }
  try {
    const res = await network.fetch(importUrl.value, { method: 'GET' })
    const data = typeof res === 'string' ? res : JSON.stringify(res)
    await importRulesFromJson(data)
    importUrl.value = ''; showImportUrlModal.value = false; message.success('导入成功')
  } catch (err: any) { message.error('导入失败: ' + err.message) }
}

async function importRulesFromJson(jsonStr: string) {
  let data: any = jsonStr
  if (typeof data === 'string') {
    if (data.trim() === '[object Object]') throw new Error('无效数据')
    data = JSON.parse(data)
  }
  let rules: any[] = []
  if (Array.isArray(data)) rules = data
  else if (data.replaceRules && Array.isArray(data.replaceRules)) rules = data.replaceRules
  else if (data.rules && Array.isArray(data.rules)) rules = data.rules
  else throw new Error('无法识别的格式')

  let added = 0
  for (const item of rules) {
    const pattern = item.regex || item.pattern || ''
    if (!pattern || pattern.trim() === '') continue
    const rule: ReplaceRule = {
      id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: item.replaceSummary || item.name || item.summary || '未命名规则',
      pattern,
      replacement: item.replacement || '',
      isRegex: item.isRegex !== undefined ? item.isRegex : true,
      isEnabled: item.enable !== undefined ? item.enable : true,
      scope: 'content',
      bookName: '',
      bookOrigin: '',
      timeoutMs: 5000,
    }
    await replaceRuleStore.addRule(rule)
    added++
  }
  if (added === 0) throw new Error('未找到有效规则')
  message.success(`已导入 ${added} 条规则`)
}

onMounted(() => { replaceRuleStore.loadRules() })
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; display: block; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px; }
.rule-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.rule-card { padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: border-color 0.2s, box-shadow 0.2s; }
.rule-card:hover { border-color: rgba(212,160,23,0.2); box-shadow: var(--shadow-sm); }
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-name { font-size: 14px; font-weight: 500; color: var(--text-primary); flex: 1; }
.rule-badge { font-size: 11px; padding: 2px 10px; border-radius: 9999px; background: var(--bg-hover); color: var(--text-muted); font-weight: 500; }
.rule-badge-regex { background: rgba(212,160,23,0.12); color: var(--brand); }
.rule-row { display: flex; gap: 8px; font-size: 12px; margin: 3px 0; }
.rule-row code { color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); }
.rule-label { color: var(--text-muted); min-width: 36px; font-weight: 500; }
.rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.form-select { padding: 8px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 100%; }
.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--bg-hover); border-radius: 24px; transition: 0.3s; }
.toggle-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle-switch input:checked + .toggle-slider { background: var(--brand); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
.hidden { display: none; }
</style>
