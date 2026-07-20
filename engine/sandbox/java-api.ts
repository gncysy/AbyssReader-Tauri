// ============================================
// Java API 门面 — 组合子模块
// ============================================

import { createNetApi } from './java-net.js'
import { createCryptoApi } from './java-crypto.js'
import { createStorageApi } from './java-storage.js'
import { createUtilsApi } from './java-utils.js'

function wrapSource(source: any): any {
  if (!source || typeof source !== 'object') return source
  return new Proxy(source, {
    get(target, prop) {
      if (prop === 'getKey') return () => target.bookSourceUrl || target.url || ''
      if (prop === 'getTag') return () => target.bookSourceName || target.name || ''
      return target[prop]
    }
  })
}

export interface JavaApiOptions {
  source?: any
  sourceKey?: string
  cookie?: {
    getCookie: (url: string) => string
    getKey: (url: string, key: string) => string
  }
}

export function createJavaApi(options: JavaApiOptions = {}): Record<string, any> {
  const sourceKey = options.sourceKey || 'default'

  return {
    source: wrapSource(options.source),
    ...createNetApi({ cookie: options.cookie }),
    ...createCryptoApi(),
    ...createStorageApi(sourceKey),
    ...createUtilsApi(),
  }
}
