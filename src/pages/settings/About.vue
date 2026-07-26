<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>关于</h2>
    </header>

    <div class="about-content">
      <div class="about-logo">
        <img src="/icons/icon.svg" alt="墨阅" class="logo-icon" />
        <span class="logo-name">墨阅</span>
      </div>
      <p class="about-version">v{{ appVersion }}</p>
      <p class="about-desc">桌面端小说阅读器 · 兼容开源阅读书源</p>
      <p class="about-license">GPL-3.0</p>

      <div class="about-links">
        <a href="https://github.com/gncysy/AbyssReader-Tauri" target="_blank" rel="noopener noreferrer" class="about-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
      </div>

      <button class="btn-check-update" :disabled="checking || downloading" @click="checkForUpdate">
        <span v-if="checking">检查中...</span>
        <span v-else-if="downloading">下载中 {{ downloadProgress }}%</span>
        <span v-else>{{ updateStatus || '检查更新' }}</span>
      </button>
      <p v-if="updateError" class="update-error">{{ updateError }}</p>
      <p class="about-disclaimer">本工具仅供学习研究，请勿用于商业用途</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { APP_VERSION } from '@shared/constants'
import BackButton from '@/components/BackButton.vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

const appVersion = APP_VERSION
const checking = ref(false)
const downloading = ref(false)
const downloadProgress = ref(0)
const updateStatus = ref('')
const updateError = ref('')

const PROXY_PREFIXES = [
  'https://gh-proxy.org/',
  'https://v4.gh-proxy.org/',
  'https://v6.gh-proxy.org/',
  'https://cdn.gh-proxy.org/',
]

function compareVersions(current: string, latest: string): boolean {
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true
    if ((b[i] || 0) < (a[i] || 0)) return false
  }
  return false
}

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } })
    if (res.ok) return res
  } catch {}
  return null
}

async function checkForUpdate() {
  checking.value = true; updateStatus.value = ''; updateError.value = ''
  try {
    const apiUrl = 'https://api.github.com/repos/gncysy/AbyssReader-Tauri/releases?per_page=5'

    let res: Response | null = null
    for (const prefix of PROXY_PREFIXES) {
      res = await tryFetch(prefix + apiUrl)
      if (res) break
    }
    if (!res) {
      res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } })
    }
    if (!res.ok) throw new Error('HTTP ' + res.status)

    const releases = await res.json()
    if (!Array.isArray(releases) || releases.length === 0) {
      updateStatus.value = '暂无发布版本'; return
    }
    const latest = releases[0].tag_name?.replace(/^v/, '') || ''
    if (!latest) throw new Error('未能解析版本号')

    if (compareVersions(appVersion, latest)) {
      updateStatus.value = `发现新版本 v${latest}${releases[0].prerelease ? ' [预发布]' : ''}`
      const asset = releases[0].assets?.find((a: any) => a.name?.endsWith('.exe'))
      if (asset) {
        await downloadAndInstall(asset.browser_download_url, asset.name)
      } else {
        updateError.value = '未找到安装包'
      }
    } else {
      updateStatus.value = '已是最新版本'
    }
  } catch (err: any) {
    updateError.value = '检查失败: ' + (err.message || '网络错误')
  } finally { checking.value = false }
}

async function downloadAndInstall(downloadUrl: string, fileName: string) {
  downloading.value = true; downloadProgress.value = 0

  let url = downloadUrl
  for (const prefix of PROXY_PREFIXES) {
    const proxyUrl = prefix + downloadUrl
    try {
      const test = await fetch(proxyUrl, { method: 'HEAD' })
      if (test.ok) { url = proxyUrl; break }
    } catch {}
  }

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('下载失败')
    const total = Number(response.headers.get('content-length') || 0)
    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) downloadProgress.value = Math.round((received / total) * 100)
    }

    const blob = new Blob(chunks)
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl; a.download = fileName
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)

    updateStatus.value = '下载完成，即将关闭程序进行安装'
    setTimeout(async () => {
      try {
        await getCurrentWindow().close()
      } catch {}
    }, 1500)
  } catch (err: any) {
    updateError.value = '下载失败: ' + err.message
  } finally { downloading.value = false }
}

onMounted(() => { checkForUpdate() })
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.about-content { padding: 48px 32px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); text-align: center; box-shadow: var(--shadow-sm); }
.about-logo { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 16px; }
.logo-icon { width: 52px; height: 52px; filter: drop-shadow(0 2px 8px rgba(212,160,23,0.2)); }
.logo-name { font-size: 26px; font-weight: 600; color: var(--text-primary); letter-spacing: 0.04em; }
.about-version { font-size: 15px; color: var(--brand); margin: 6px 0; font-weight: 500; }
.about-desc { font-size: 14px; color: var(--text-secondary); margin: 6px 0; line-height: 1.5; }
.about-license { font-size: 12px; color: var(--text-muted); opacity: 0.6; margin-top: 10px; }
.about-links { margin-top: 20px; }
.about-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; font-size: 14px; color: var(--text-secondary); text-decoration: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: color 0.2s, border-color 0.2s, background 0.2s, transform 0.2s; }
.about-link:hover { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); transform: translateY(-1px); }
.btn-check-update { display: inline-flex; align-items: center; justify-content: center; margin-top: 20px; padding: 8px 22px; font-size: 14px; font-weight: 500; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; transition: color 0.2s, background 0.2s, border-color 0.2s, transform 0.2s; }
.btn-check-update:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); transform: translateY(-1px); }
.btn-check-update:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.update-error { margin-top: 10px; font-size: 12px; color: #e74c3c; line-height: 1.5; }
.about-disclaimer { margin-top: 16px; font-size: 11px; color: var(--text-muted); opacity: 0.5; }
</style>
