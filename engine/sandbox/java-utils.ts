// ============================================
// 沙箱工具 API
// ============================================

import { md5Short } from '../crypto/index.js'

const memoryCache = new Map<string, { value: any; expiry: number }>()

export function createUtilsApi(): Record<string, any> {
  return {
    t2s: (text: string): string => text,
    s2t: (text: string): string => text,
    log: (msg: any): any => { console.log('[java-api]', msg); return msg },
    androidId: (): string => 'abyss-reader-android-id',
    getWebViewUA: (): string => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timeFormat: (time: number): string => new Date(time).toISOString(),
    strToBytes: (str: string): Uint8Array => new TextEncoder().encode(str),
    bytesToStr: (bytes: Uint8Array): string => new TextDecoder().decode(bytes),
    encodeURI: (str: string): string => encodeURIComponent(str),
    decodeURI: (str: string): string => decodeURIComponent(str),

    cacheFile: (url: string, saveTime?: number): string => {
      const key = md5Short(url)
      const cached = memoryCache.get(key)
      if (cached && (cached.expiry === 0 || Date.now() < cached.expiry)) {
        return String(cached.value)
      }
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', url, false)
        xhr.send()
        const body = xhr.responseText || ''
        const expiry = saveTime ? Date.now() + saveTime * 1000 : 0
        memoryCache.set(key, { value: body, expiry })
        return body
      } catch { return '' }
    },

    importScript: (path: string): string => {
      if (path.startsWith('http')) {
        return createUtilsApi().cacheFile(path, 3600)
      }
      return ''
    },

    cache: {
      get: (key: string): any => {
        const entry = memoryCache.get(key)
        if (entry && (entry.expiry === 0 || Date.now() < entry.expiry)) {
          return entry.value
        }
        return null
      },
      put: (key: string, value: any, ttlSeconds?: number): void => {
        const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0
        memoryCache.set(key, { value, expiry })
      },
      delete: (key: string): void => {
        memoryCache.delete(key)
      },
      clear: (): void => {
        memoryCache.clear()
      },
    },
  }
}
