<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="'登录 - ' + (source?.sourceName || '订阅源')"
    style="max-width:520px"
    :bordered="false"
    @after-leave="onClose"
  >
    <div v-if="loading" style="display:flex;justify-content:center;padding:40px">
      <div class="loading-spinner"></div>
    </div>

    <div v-else-if="error" class="login-error">
      {{ error }}
      <button class="btn-secondary" style="margin-top:10px;padding:4px 16px;font-size:12px" @click="retry">重试</button>
    </div>

    <div v-else-if="loginUiItems.length > 0" class="login-ui">
      <div
        v-for="(item, idx) in loginUiItems"
        :key="idx"
        class="login-ui-row"
        :class="{ 'login-ui-row-button': item.type === 'button' }"
      >
        <template v-if="item.type === 'text'">
          <span class="login-ui-label">{{ item.name }}</span>
        </template>

        <template v-else-if="item.type === 'input'">
          <span class="login-ui-label">{{ item.name }}</span>
          <input
            v-model="formData[item.name]"
            :type="item.inputType || 'text'"
            class="login-ui-input"
            :placeholder="item.placeholder || ''"
            @keyup.enter="executeAction(item.action)"
          />
        </template>

        <template v-else-if="item.type === 'password'">
          <span class="login-ui-label">{{ item.name }}</span>
          <input
            v-model="formData[item.name]"
            type="password"
            class="login-ui-input"
            :placeholder="item.placeholder || ''"
            @keyup.enter="executeAction(item.action)"
          />
        </template>

        <template v-else-if="item.type === 'toggle'">
          <span class="login-ui-label">{{ item.name }}</span>
          <div class="login-ui-toggle-group">
            <button
              v-for="c in item.chars || []"
              :key="c"
              class="login-ui-toggle-btn"
              :class="{ active: formData[item.name] === c }"
              @click="formData[item.name] = c"
            >{{ c }}</button>
          </div>
        </template>

        <template v-else-if="item.type === 'button'">
          <button
            class="btn-primary"
            :disabled="executing"
            style="width:100%;padding:8px;font-size:14px"
            @click="executeAction(item.action)"
          >
            {{ executing ? '执行中...' : (item.name || '确定') }}
          </button>
        </template>
      </div>
    </div>

    <div v-else-if="source?.loginUrl && !loginUiItems.length" class="login-simple">
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:12px">
        将在新窗口中打开登录页面
      </p>
      <button class="btn-primary" style="width:100%;padding:8px;font-size:14px" @click="openLoginUrl">
        打开登录页
      </button>
    </div>

    <div v-else class="login-empty">
      <p style="color:var(--text-muted)">该订阅源未配置登录方式</p>
    </div>

    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" @click="close">取消</button>
        <button
          v-if="loginUiItems.length > 0 || source?.loginUrl"
          class="btn-primary"
          :disabled="executing || checking"
          @click="checkLogin"
        >
          {{ checking ? '检测中...' : '检测登录状态' }}
        </button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage, NModal } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { store } from '@/api'
import { loginWebview } from '@/api'
import type { RssSource } from '@shared/types'

const message = useMessage()

const props = defineProps<{
  source: RssSource | null
}>()

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'close'): void
}>()

const visible = ref(false)
const loading = ref(false)
const checking = ref(false)
const executing = ref(false)
const error = ref('')
const loginUiItems = ref<any[]>([])
const formData = ref<Record<string, string>>({})
const sourceKey = ref('')

// ─── 打开登录弹窗 ──────────────────────────────────────────
function open() {
  visible.value = true
  loading.value = true
  error.value = ''
  loginUiItems.value = []
  formData.value = {}

  if (!props.source) {
    error.value = '未指定订阅源'
    loading.value = false
    return
  }

  sourceKey.value = props.source.sourceUrl

  // 检查是否有 loginUi
  if (props.source.loginUi) {
    loadLoginUi()
  } else if (props.source.loginUrl) {
    loading.value = false
  } else {
    error.value = '该订阅源未配置登录'
    loading.value = false
  }
}

function close() {
  visible.value = false
  emit('close')
}

function onClose() {
  // 清理
}

// ─── 加载 LoginUi ──────────────────────────────────────────
async function loadLoginUi() {
  if (!props.source) return
  loading.value = true
  error.value = ''

  try {
    // 解析 loginUi 获取表单配置
    const uiStr = props.source.loginUi || ''
    const cleaned = uiStr
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()

    // 尝试直接解析 JSON
    try {
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        loginUiItems.value = parsed
        // 初始化 formData
        for (const item of parsed) {
          if (item.type === 'input' || item.type === 'password') {
            formData.value[item.name] = item.default || ''
          }
          if (item.type === 'toggle') {
            formData.value[item.name] = item.default || (item.chars?.[0] || '')
          }
        }
        loading.value = false
        return
      }
    } catch {}

    // 如果是 JS，执行获取
    const ctx = {
      source: props.source,
      result: '',
      baseUrl: props.source.sourceUrl,
    }
    const result = await invoke('execute_js_rule', {
      code: cleaned,
      context: ctx,
      timeoutMs: 10000,
    })

    if (result && (result as any).success) {
      const data = (result as any).result
      try {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) {
          loginUiItems.value = parsed
          for (const item of parsed) {
            if (item.type === 'input' || item.type === 'password') {
              formData.value[item.name] = item.default || ''
            }
            if (item.type === 'toggle') {
              formData.value[item.name] = item.default || (item.chars?.[0] || '')
            }
          }
        }
      } catch {
        loginUiItems.value = []
      }
    }
  } catch (err: any) {
    error.value = '加载登录界面失败: ' + err.message
  } finally {
    loading.value = false
  }
}

// ─── 执行 Action ──────────────────────────────────────────
async function executeAction(action?: string) {
  if (!action || !props.source) return
  if (executing.value) return

  executing.value = true
  error.value = ''

  try {
    // 替换 formData 占位符
    let processed = action
    for (const [key, value] of Object.entries(formData.value)) {
      processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
    }

    // 执行 action
    const ctx = {
      source: props.source,
      result: processed,
      baseUrl: props.source.sourceUrl,
      formData: formData.value,
    }

    const result = await invoke('execute_js_rule', {
      code: processed,
      context: ctx,
      timeoutMs: 15000,
    })

    if (result && (result as any).success) {
      const res = (result as any).result
      if (res && res.includes('success') || res === 'true') {
        message.success('操作成功')
        // 检测登录状态
        await checkLogin()
      } else if (res && res.startsWith('error:')) {
        error.value = res.substring(6)
      } else {
        message.info(res || '操作完成')
      }
    }
  } catch (err: any) {
    error.value = err.message || '执行失败'
  } finally {
    executing.value = false
  }
}

// ─── 打开登录 URL ──────────────────────────────────────────
async function openLoginUrl() {
  if (!props.source?.loginUrl) return

  try {
    const url = props.source.loginUrl
    const title = props.source.sourceName || '登录'
    const result = await loginWebview(url, title, 300)

    if (result && typeof result === 'string') {
      if (result.includes('cookies') || result.includes('success')) {
        message.success('登录成功')
        await checkLogin()
      } else {
        message.info('登录窗口已关闭')
        await checkLogin()
      }
    }
  } catch (err: any) {
    error.value = err.message || '打开登录页失败'
  }
}

// ─── 检测登录状态 ──────────────────────────────────────────
async function checkLogin() {
  if (!props.source) return
  if (checking.value) return

  checking.value = true
  error.value = ''

  try {
    const checkJs = props.source.loginCheckJs
    if (checkJs) {
      const cleaned = checkJs
        .replace(/^@js:\s*/, '')
        .replace(/^<js>/, '')
        .replace(/<\/js>$/, '')
        .trim()

      const ctx = {
        source: props.source,
        result: '',
        baseUrl: props.source.sourceUrl,
        formData: formData.value,
      }

      const result = await invoke('execute_js_rule', {
        code: cleaned,
        context: ctx,
        timeoutMs: 10000,
      })

      if (result && (result as any).success) {
        const res = (result as any).result
        if (res === 'true' || res === true || res === 1) {
          message.success('登录成功！')
          emit('success')
          close()
          return
        } else {
          error.value = '未登录，请完成登录操作'
        }
      }
    } else {
      // 没有检测 JS，尝试用 Cookie 判断
      try {
        const cookie = await invoke('execute_js_rule', {
          code: 'cookie.getCookie(baseUrl)',
          context: { source: props.source, baseUrl: props.source.sourceUrl },
          timeoutMs: 5000,
        })
        if (cookie && (cookie as any).result && (cookie as any).result.length > 10) {
          message.success('已检测到 Cookie，登录有效')
          emit('success')
          close()
          return
        }
      } catch {}
      error.value = '未检测到登录状态，请完成登录'
    }
  } catch (err: any) {
    error.value = err.message || '检测失败'
  } finally {
    checking.value = false
  }
}

function retry() {
  error.value = ''
  if (props.source?.loginUi) {
    loadLoginUi()
  } else {
    loading.value = false
  }
}

// ─── 暴露 ──────────────────────────────────────────────────
defineExpose({ open, close })
</script>

<style scoped>
.login-ui {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}
.login-ui-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.login-ui-row-button {
  margin-top: 8px;
  flex-direction: column;
}
.login-ui-label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 60px;
  font-weight: 500;
}
.login-ui-input {
  flex: 1;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.login-ui-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}
.login-ui-toggle-group {
  display: flex;
  gap: 4px;
  flex: 1;
}
.login-ui-toggle-btn {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.login-ui-toggle-btn:hover {
  color: var(--text-primary);
  border-color: var(--brand);
}
.login-ui-toggle-btn.active {
  color: var(--brand);
  border-color: var(--brand);
  background: var(--bg-active);
}
.login-error {
  padding: 20px;
  text-align: center;
  color: #e74c3c;
  font-size: 14px;
}
.login-simple {
  padding: 8px 0;
}
.login-empty {
  padding: 30px;
  text-align: center;
}
</style>
