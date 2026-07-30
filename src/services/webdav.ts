import { store, network } from '../api/index.js'

export const DEFAULT_WEBDAV_CONFIG = {
  server: '',
  username: '',
  password: '',
  folder: 'legado',
  deviceName: 'desktop',
  enabled: false,
}

export function encryptConfig(config: any): any {
  const encoded = { ...config }
  if (encoded.password) encoded.password = btoa(encoded.password.split('').reverse().join(''))
  return encoded
}

export function decryptConfig(config: any): any {
  const decoded = { ...config }
  if (decoded.password) {
    try { decoded.password = atob(decoded.password).split('').reverse().join('') }
    catch { decoded.password = '' }
  }
  return decoded
}

export async function webdavRequest(
  config: any, method: string, path: string, body: any = null, headers: any = {}
): Promise<{ status: number; data: string }> {
  const base = config.server.replace(/\/+$/, '')
  const folder = (config.folder || 'legado').replace(/^\/+/, '').replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  const url = base + '/' + folder + '/' + cleanPath
  const auth = btoa(config.username + ':' + config.password)
  const allHeaders = { Authorization: 'Basic ' + auth, ...headers }

  const res = await network.fetch(url, {
    method, headers: allHeaders, body, timeout: 30000,
  })
  return { status: 200, data: typeof res === 'string' ? res : JSON.stringify(res) }
}

export async function listBackups(config: any): Promise<{ filename: string; date: string; deviceName: string }[]> {
  try {
    const res = await webdavRequest(config, 'PROPFIND', '', null, { Depth: '1' })
    const items: { filename: string; date: string; deviceName: string }[] = []
    const xml = res.data
    if (!xml.includes('<d:multistatus') && !xml.includes('<D:multistatus')) return []
    const responses = xml.split(/<(?:d|D):response>/g).filter((s: string) => s.includes('<d:href>') || s.includes('<D:href>'))
    for (const resp of responses) {
      const nameMatch = resp.match(/<(?:d|D):displayname>([^<]+)<\/(?:d|D):displayname>/)
      if (!nameMatch) continue
      const name = nameMatch[1]
      if (!name || (!name.endsWith('.zip') && !name.endsWith('.json'))) continue
      const dateMatch = resp.match(/<(?:d|D):getlastmodified>([^<]+)<\/(?:d|D):getlastmodified>/)
      const date = dateMatch ? dateMatch[1] : ''
      let deviceName = 'unknown'
      const nameWithoutExt = name.replace(/\.(zip|json)$/, '')
      const parts = nameWithoutExt.split('-')
      if (parts.length >= 3) { deviceName = parts.slice(2).join('-') }
      items.push({ filename: name, date, deviceName })
    }
    return items.sort((a, b) => b.filename.localeCompare(a.filename))
  } catch (err) { return [] }
}

export async function getLatestBackup(config: any): Promise<{ filename: string; date: string; deviceName: string } | null> {
  const list = await listBackups(config)
  return list.length > 0 ? list[0] : null
}

export async function restoreBackup(config: any, filename: string): Promise<{ success: boolean; message: string }> {
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

    // ZIP
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
        let key = file.name.replace(/\.json$/, '').replace(/^.*\//, '')
        // 合并替换规则：replaceRule 追加而非覆盖
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
      } catch { continue }
    }

    return { success: true, message: '恢复成功' }
  } catch (err: any) {
    return { success: false, message: '恢复失败: ' + err.message }
  }
}

export async function fullSync(config: any, localData?: any): Promise<{ success: boolean; message: string }> {
  try {
    const dataToSync = localData || await store.getAll()
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    const keysToSync = ['bookshelf', 'bookSource', 'readingProgress', 'replaceRule', 'bookGroup', 'txtTocRule', 'dictRule', 'keyboardAssists', 'rssSources']
    let syncedCount = 0

    for (const key of keysToSync) {
      const value = dataToSync[key]
      if (value !== undefined && value !== null) {
        zip.file(key + '.json', JSON.stringify(value, null, 2))
        syncedCount++
      }
    }

    if (syncedCount === 0) { return { success: false, message: '没有数据可同步' } }

    const zipData = await zip.generateAsync({ type: 'base64' })
    const device = config.deviceName || 'desktop'
    const filename = `backup${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${device}.zip`

    await webdavRequest(config, 'PUT', filename, zipData, { 'Content-Type': 'application/zip' })

    return { success: true, message: `备份上传成功: ${filename} (${syncedCount} 个文件)` }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
}
