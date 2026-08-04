<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <BackButton />
      <h2>WebDAV 同步</h2>
    </header>

    <div class="setting-item">
      <div class="setting-label">
        <span class="label-text">服务器地址</span>
        <span class="label-desc">支持坚果云、Nextcloud 等</span>
      </div>
      <input v-model="config.server" type="text" class="input-search" style="width:260px" placeholder="https://dav.jianguoyun.com/dav/" name="webdav-server" id="webdav-server" autocomplete="off" />
    </div>
    <div class="setting-item">
      <div class="setting-label"><span class="label-text">账号</span></div>
      <input v-model="config.username" type="text" class="input-search" style="width:260px" name="webdav-username" id="webdav-username" autocomplete="off" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-text">密码</span>
        <span class="label-desc">应用专用密码，加密存储</span>
      </div>
      <input v-model="config.password" type="password" class="input-search" style="width:260px" name="webdav-password" id="webdav-password" autocomplete="new-password" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-text">子文件夹</span>
        <span class="label-desc">默认 legado</span>
      </div>
      <input v-model="config.folder" type="text" class="input-search" style="width:260px" placeholder="legado" name="webdav-folder" id="webdav-folder" autocomplete="off" />
    </div>
    <div class="setting-item">
      <div class="setting-label"><span class="label-text">设备名称</span></div>
      <input v-model="config.deviceName" type="text" class="input-search" style="width:260px" placeholder="desktop" name="webdav-device" id="webdav-device" autocomplete="off" />
    </div>
    <div class="setting-item">
      <div class="setting-label"><span class="label-text">启用同步</span></div>
      <label class="toggle-switch">
        <input v-model="config.enabled" type="checkbox" name="webdav-enabled" id="webdav-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="webdav-actions">
      <button class="btn-primary" :disabled="testing" @click="testConnection">{{ testing ? '测试中...' : '测试连接' }}</button>
      <button class="btn-primary" :disabled="syncing" @click="uploadBackup">{{ syncing ? '上传中...' : '上传备份' }}</button>
      <button class="btn-secondary" :disabled="syncing" @click="loadBackupList">刷新备份列表</button>
      <button class="btn-secondary" :disabled="syncing || backupList.length === 0" @click="restoreLatest">恢复最新备份</button>
    </div>

    <div v-if="status" class="status-message" :class="status.type">{{ status.message }}</div>

    <div v-if="backupList.length > 0" class="backup-list">
      <div class="backup-header">可用备份（共 {{ backupList.length }} 个）</div>
      <div v-for="backup in backupList" :key="backup.filename" class="backup-item">
        <span class="backup-name">{{ backup.filename }}</span>
        <span class="backup-date">{{ backup.date }}</span>
        <button class="btn-secondary" style="padding:4px 14px;font-size:12px" @click="restoreBackupFile(backup.filename)">恢复</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/api'
import { useBookshelfStore } from '@/store'
import { DEFAULT_WEBDAV_CONFIG, webdavRequest, listBackups, getLatestBackup, restoreBackup, fullSync, encryptConfig, decryptConfig } from '@/services/webdav'
import BackButton from '@/components/BackButton.vue'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const config = ref({ ...DEFAULT_WEBDAV_CONFIG, deviceName: 'desktop' })
const status = ref<{ type: string; message: string } | null>(null)
const backupList = ref<{ filename: string; date: string; deviceName: string }[]>([])
const testing = ref(false)
const syncing = ref(false)

async function loadConfig() {
  try { const saved = await store.get('webdavConfig'); if (saved) config.value = { ...DEFAULT_WEBDAV_CONFIG, ...decryptConfig(saved) } } catch {}
}
async function saveConfig() { try { await store.set('webdavConfig', encryptConfig(config.value)) } catch {} }

async function testConnection() {
  testing.value = true; status.value = null
  try {
    const res = await webdavRequest(config.value, 'PROPFIND', '', null, { Depth: '0' })
    if (res.status === 207) { status.value = { type: 'success', message: '连接成功' }; await loadBackupList() }
    else if (res.status === 401) status.value = { type: 'error', message: '认证失败' }
    else if (res.status === 404) status.value = { type: 'warning', message: '文件夹不存在，上传时会自动创建' }
    else status.value = { type: 'error', message: `HTTP ${res.status}` }
  } catch (err: any) { status.value = { type: 'error', message: err.message } }
  finally { testing.value = false; await saveConfig() }
}

async function loadBackupList() {
  try {
    const result = await listBackups(config.value)
    if (result && Array.isArray(result)) {
      backupList.value = result
    } else {
      backupList.value = []
    }
    if (backupList.value.length === 0) message.info('没有找到备份文件')
    else message.success(`找到 ${backupList.value.length} 个备份`)
  } catch (err: any) {
    console.error('[WebDAV] loadBackupList 异常:', err)
    message.error('加载备份列表失败: ' + err.message)
  }
}

async function uploadBackup() {
  syncing.value = true; status.value = null
  try {
    const allKeys: any = await store.getAll()
    const localData: any = {}
    for (const key of Object.keys(allKeys || {})) {
      localData[key] = allKeys[key]
    }
    const result = await fullSync(config.value, localData)
    status.value = { type: result.success ? 'success' : 'error', message: result.message }
    if (result.success) await loadBackupList()
  } catch (err: any) { status.value = { type: 'error', message: err.message } }
  finally { syncing.value = false }
}

async function restoreLatest() {
  const latest = await getLatestBackup(config.value)
  if (!latest) { status.value = { type: 'warning', message: '没有可恢复的备份' }; return }
  await restoreBackupFile(latest.filename)
}

async function restoreBackupFile(filename: string) {
  syncing.value = true; status.value = null
  try {
    const result = await restoreBackup(config.value, filename)
    if (result.success) {
      await bookshelfStore.loadBooks()
      status.value = { type: 'success', message: `已恢复: ${filename}` }
      message.success('恢复成功')
    } else {
      status.value = { type: 'error', message: result.message }
    }
  } catch (err: any) { status.value = { type: 'error', message: err.message } }
  finally { syncing.value = false }
}

watch(config, () => saveConfig(), { deep: true })
onMounted(() => { loadConfig() })
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.setting-label { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); }
.webdav-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
.status-message { margin-top: 14px; padding: 12px 16px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
.status-message.success { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.2); color: #4caf50; }
.status-message.error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }
.status-message.warning { background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.2); color: #f39c12; }
.backup-list { margin-top: 18px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.backup-header { padding: 10px 14px; background: var(--bg-hover); font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: 500; }
.backup-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); transition: background 0.15s; }
.backup-item:last-child { border-bottom: none; }
.backup-item:hover { background: var(--bg-hover); }
.backup-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-date { color: var(--text-muted); font-size: 12px; flex-shrink: 0; }
</style>
