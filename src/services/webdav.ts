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
  // network.fetch 返回的是字符串，需要兼容 status
  return { status: 200, data: typeof res === 'string' ? res : JSON.stringify(res) }
}

export async function listBackups(config: any): Promise<{ filename: string; date: string; deviceName: string }[]> {
  try {
    const res = await webdavRequest(config, 'PROPFIND', '', null, { Depth: '1' })
    const items: { filename: string; date: string; deviceName: string }[] = []
    const responses = res.data.split(/<d:response>/g).filter((s: string) => s.includes('<D:href>') || s.includes('<d:href>'))
    for (const resp of responses) {
      const nameMatch = resp.match(/<(?:d:)?displayname>([^<]+)<\/(?:d:)?displayname>/i)
      if (!nameMatch) continue
      const name = nameMatch[1]
      if (!name || (!name.endsWith('.zip') && !name.endsWith('.json'))) continue
      const dateMatch = resp.match(/<(?:d:)?getlastmodified>([^<]+)<\/(?:d:)?getlastmodified>/i)
      const date = dateMatch ? dateMatch[1] : ''
      items.push({ filename: name, date, deviceName: 'unknown' })
    }
    return items.sort((a, b) => b.filename.localeCompare(a.filename))
  } catch { return [] }
}

export async function getLatestBackup(config: any): Promise<{ filename: string; date: string; deviceName: string } | null> {
  const list = await listBackups(config)
  return list.length > 0 ? list[0] : null
}

export async function restoreBackup(config: any, filename: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await webdavRequest(config, 'GET', filename)
    if (filename.endsWith('.json')) {
      const data = JSON.parse(res.data)
      for (const [key, value] of Object.entries(data)) {
        await store.set(key, value)
      }
      return { success: true, message: '恢复成功' }
    }
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(res.data, { base64: true })
    const jsonFiles = zip.file(/\.json$/)
    if (!jsonFiles || jsonFiles.length === 0) return { success: false, message: 'ZIP 中未找到 JSON 文件' }
    for (const file of jsonFiles) {
      const content = await file.async('string')
      try {
        const parsed = JSON.parse(content)
        const key = file.name.replace(/\.json$/, '')
        await store.set(key, parsed)
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
    for (const [key, value] of Object.entries(dataToSync || {})) {
      if (value !== undefined && value !== null && !key.startsWith('_')) {
        zip.file(key + '.json', JSON.stringify(value, null, 2))
      }
    }
    const zipData = await zip.generateAsync({ type: 'base64' })
    const filename = 'backup' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + (config.deviceName || 'desktop') + '.zip'
    await webdavRequest(config, 'PUT', filename, zipData, { 'Content-Type': 'application/zip' })
    return { success: true, message: '备份上传成功: ' + filename }
  } catch (err: any) { return { success: false, message: err.message } }
}
