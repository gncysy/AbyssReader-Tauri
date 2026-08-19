// ============================================
// WebDAV 同步服务 — 安全加密
// ============================================

import { store, network } from './index.js'
import { invoke } from '@tauri-apps/api/core'

const PASSWORD_SALT = 'moYue-reader-webdav-salt-v1'
const KEY_DERIVE_ITERATIONS = 50000

async function getDefaultDeviceName(): Promise<string> {
  try {
    const hostname: string = await invoke('get_hostname')
    if (hostname && hostname.trim()) return hostname.trim()
  } catch {
    // ignore
  }
  return 'desktop'
}

export const DEFAULT_WEBDAV_CONFIG = {
  server: '',
  username: '',
  password: '',
  folder: 'legado',
  deviceName: '',
  enabled: false,
}

// BUG-3 修复：使用设备名 + 固定盐派生密钥（不依赖密码本身，支持可逆解密）
async function deriveKeyFromDevice(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const deviceName = await getDeviceName()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(PASSWORD_SALT + deviceName),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(PASSWORD_SALT),
      iterations: KEY_DERIVE_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptConfig(config: any): Promise<any> {
  const encoded = { ...config }
  if (encoded.password) {
    try {
      const key = await deriveKeyFromDevice()
      const enc = new TextEncoder()
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(encoded.password)
      )
      const combined = new Uint8Array(iv.length + encrypted.byteLength)
      combined.set(iv)
      combined.set(new Uint8Array(encrypted), iv.length)
      encoded.password = btoa(String.fromCharCode(...combined))
    } catch {
      encoded.password = ''
    }
  }
  return encoded
}

export async function decryptConfig(config: any): Promise<any> {
  const decoded = { ...config }
  if (decoded.password) {
    try {
      const combined = new Uint8Array(
        atob(decoded.password).split('').map(c => c.charCodeAt(0))
      )
      const iv = combined.slice(0, 12)
      const encrypted = combined.slice(12)
      const key = await deriveKeyFromDevice()
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      )
      decoded.password = new TextDecoder().decode(decrypted)
    } catch {
      // 解密失败：可能是旧版本或其他设备的数据，保留原值让用户重新输入
      decoded.password = ''
    }
  }
  return decoded
}

export async function getDeviceName(): Promise<string> {
  return getDefaultDeviceName()
}

export async function webdavRequest(
  config: any,
  method: string,
  path: string,
  body: any = null,
  headers: any = {},
): Promise<{ status: number; data: string }> {
  const base = config.server.replace(/\/+$/, '')
  const folder = (config.folder || 'legado').replace(/^\/+/, '').replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  const url = base + '/' + folder + '/' + cleanPath
  const auth = btoa(config.username + ':' + config.password)
  const allHeaders = { Authorization: 'Basic ' + auth, ...headers }

  const res = await network.fetch(url, { method, headers: allHeaders, body, timeout: 30000 })
  return { status: 200, data: typeof res === 'string' ? res : JSON.stringify(res) }
}

export async function listBackups(config: any): Promise<
  { filename: string; date: string; deviceName: string }[]
> {
  try {
    const res = await webdavRequest(config, 'PROPFIND', '', null, { Depth: '1' })
    const xml = res.data
    if (!xml.includes('<d:multistatus') && !xml.includes('<D:multistatus')) return []

    const items: { filename: string; date: string; deviceName: string }[] = []

    // 使用 DOMParser 解析 WebDAV XML
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, 'application/xml')
      const responses = doc.querySelectorAll('response, \\*|response')

      responses.forEach((resp) => {
        const href = resp.querySelector('href, \\*|href')?.textContent || ''
        const displayName = resp.querySelector('displayname, \\*|displayname')?.textContent || ''
        const lastModified = resp.querySelector('getlastmodified, \\*|getlastmodified')?.textContent || ''

        const name = displayName || href.split('/').filter(Boolean).pop() || ''
        if (!name || (!name.endsWith('.zip') && !name.endsWith('.json'))) return

        const nameWithoutExt = name.replace(/\.(zip|json)$/, '')
        const parts = nameWithoutExt.split('-')
        const deviceName = parts.length >= 3 ? parts.slice(2).join('-') : 'unknown'

        items.push({ filename: name, date: lastModified, deviceName })
      })
    } catch {
      // 降级为正则解析
      const responses = xml.split(/<(?:d|D):response>/g).filter((s: string) =>
        s.includes('<d:href>') || s.includes('<D:href>') || s.includes('href')
      )
      for (const resp of responses) {
        const nameMatch = resp.match(/<(?:d|D):displayname>([^<]+)<\/(?:d|D):displayname>/) ||
          resp.match(/<href[^>]*>([^<]+)<\/href>/i)
        if (!nameMatch) continue
        const rawName = nameMatch[1]
        const name = rawName.split('/').filter(Boolean).pop() || ''
        if (!name || (!name.endsWith('.zip') && !name.endsWith('.json'))) continue

        const dateMatch = resp.match(/<(?:d|D):getlastmodified>([^<]+)<\/(?:d|D):getlastmodified>/)
        const date = dateMatch ? dateMatch[1] : ''
        const nameWithoutExt = name.replace(/\.(zip|json)$/, '')
        const parts = nameWithoutExt.split('-')
        const deviceName = parts.length >= 3 ? parts.slice(2).join('-') : 'unknown'
        items.push({ filename: name, date, deviceName })
      }
    }

    return items.sort((a, b) => b.filename.localeCompare(a.filename))
  } catch {
    return []
  }
}

export async function getLatestBackup(config: any): Promise<{
  filename: string; date: string; deviceName: string
} | null> {
  const list = await listBackups(config)
  return list.length > 0 ? list[0] : null
}

export async function restoreBackup(
  config: any,
  filename: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const base = config.server.replace(/\/+$/, '')
    const folder = (config.folder || 'legado').replace(/^\/+/, '').replace(/\/+$/, '')
    const url = base + '/' + folder + '/' + filename
    const auth = btoa(config.username + ':' + config.password)
    const headers = { Authorization: 'Basic ' + auth }

    if (filename.endsWith('.json')) {
      const res = await network.fetch(url, { method: 'GET', headers, timeout: 30000 })
      const data = JSON.parse(typeof res === 'string' ? res : JSON.stringify(res))
      for (const [key, value] of Object.entries(data)) {
        await store.set(key, value)
      }
      return { success: true, message: '恢复成功' }
    }

    const base64Data = await network.downloadBinary(url, headers)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(base64Data, { base64: true })
    const jsonFiles = zip.file(/\.json$/)
    if (!jsonFiles || jsonFiles.length === 0) {
      return { success: false, message: 'ZIP 中未找到 JSON 文件' }
    }

    for (const file of jsonFiles) {
      const content = await file.async('string')
      try {
        const parsed = JSON.parse(content)
        const key = file.name.replace(/\.json$/, '').replace(/^.*\//, '')
        if (key === 'replaceRule') {
          const existing = (await store.get('replaceRule')) || []
          const incoming = Array.isArray(parsed) ? parsed : []
          const merged = [...existing]
          for (const rule of incoming) {
            if (!merged.find((r: any) => r.name === rule.name && r.pattern === rule.pattern)) {
              merged.push(rule)
            }
          }
          await store.set('replaceRule', merged)
        } else {
          await store.set(key, parsed)
        }
      } catch {
        continue
      }
    }

    return { success: true, message: '恢复成功' }
  } catch (err: any) {
    return { success: false, message: '恢复失败: ' + err.message }
  }
}

export async function fullSync(
  config: any,
  localData?: any,
): Promise<{ success: boolean; message: string }> {
  try {
    const dataToSync = localData || (await store.getAll())
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    const keysToSync = [
      'bookshelf', 'bookSource', 'readingProgress', 'replaceRule',
      'bookGroup', 'txtTocRule', 'dictRule', 'keyboardAssists', 'rssSources',
    ]
    let syncedCount = 0

    for (const key of keysToSync) {
      const value = dataToSync[key]
      if (value !== undefined && value !== null) {
        zip.file(key + '.json', JSON.stringify(value, null, 2))
        syncedCount++
      }
    }

    if (syncedCount === 0) return { success: false, message: '没有数据可同步' }

    const zipData = await zip.generateAsync({ type: 'base64' })
    const device = config.deviceName || (await getDeviceName())
    const filename = `backup${new Date().toISOString().slice(0, 10)}-${device}.zip`

    await webdavRequest(config, 'PUT', filename, zipData, { 'Content-Type': 'application/zip' })
    return { success: true, message: `备份上传成功: ${filename} (${syncedCount} 个文件)` }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
}
