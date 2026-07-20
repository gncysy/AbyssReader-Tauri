// ============================================
// 沙箱存储 API
// ============================================

import { putContext, getContext } from '../context/store.js'

let persistentStore: {
  get: (key: string) => any
  set: (key: string, value: any) => void
} | null = null

export function setPersistentStore(store: { get: (key: string) => any; set: (key: string, value: any) => void }): void {
  persistentStore = store
}

export function createStorageApi(sourceKey: string): Record<string, any> {
  const sourceMaps = new Map<string, Map<string, any>>()
  const loginHeaderKey = `loginHeader_${sourceKey}`

  function getSourceMap(): Map<string, any> {
    if (!sourceMaps.has(sourceKey)) {
      sourceMaps.set(sourceKey, new Map())
    }
    return sourceMaps.get(sourceKey)!
  }

  return {
    source: {
      setVariable: (key: string, value: any) => {
        putContext(sourceKey, key, value)
        return value
      },
      getVariable: (key: string) => {
        const val = getContext(sourceKey, key)
        return val !== undefined && val !== null ? String(val) : ''
      },
    },
    put: (key: string, value: any): any => {
      putContext(sourceKey, key, value)
      if (persistentStore) {
        try {
          const all = persistentStore.get(`sandbox_${sourceKey}`) || {}
          all[key] = value
          persistentStore.set(`sandbox_${sourceKey}`, all)
        } catch {}
      }
      return value
    },
    get: (key: string): string => {
      const memVal = getContext(sourceKey, key)
      if (memVal !== undefined && memVal !== null) return String(memVal)
      if (persistentStore) {
        try {
          const all = persistentStore.get(`sandbox_${sourceKey}`) || {}
          if (all[key] !== undefined) return String(all[key])
        } catch {}
      }
      return ''
    },
    Map: (key?: string): any => {
      const map = getSourceMap()
      if (key === undefined) return ''
      return map.has(key) ? String(map.get(key)) : ''
    },
    putLoginHeader: (header: string): void => {
      if (persistentStore) {
        try { persistentStore.set(loginHeaderKey, header) } catch {}
      }
    },
    getLoginHeader: (): string => {
      if (persistentStore) {
        try { return String(persistentStore.get(loginHeaderKey) || '') } catch {}
      }
      return ''
    },
    getLoginInfoMap: (): Record<string, string> => {
      const result: Record<string, string> = {}
      const map = getSourceMap()
      for (const [k, v] of map) { result[k] = String(v) }
      if (persistentStore) {
        try {
          const val = persistentStore.get(loginHeaderKey)
          if (val && typeof val === 'string') {
            const parsed = JSON.parse(val.replace(/^#/, ''))
            for (const [k, v] of Object.entries(parsed)) { result[k] = String(v) }
          }
        } catch {}
      }
      return result
    },
    putLoginInfo: (info: string): void => {
      if (persistentStore) {
        try { persistentStore.set(loginHeaderKey, '#' + info) } catch {}
      }
    },
  }
}
