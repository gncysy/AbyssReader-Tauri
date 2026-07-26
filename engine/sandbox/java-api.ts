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

  const netApi = createNetApi({ cookie: options.cookie });
  return {
    source: wrapSource(options.source),
    ...netApi,
    ...createCryptoApi(),
    ...createStorageApi(sourceKey),
    ...createUtilsApi(),
    webView: (html: string, url: string, js: string) => netApi.ajax(url || ''),
    webViewGetSource: (html: string, url: string, js: string, regex: string) => netApi.ajax(url || ''),
    webViewGetOverrideUrl: (html: string, url: string, js: string, regex: string) => netApi.ajax(url || ''),
    webJsExecute: (html: string, js: string) => netApi.ajax(''),
    startBrowser: (url: string) => { window.open(url, '_blank'); },
    startBrowserAwait: (url: string, title: string) => { window.open(url, '_blank'); return ''; },
    showBrowser: () => {},
    showPhoto: (src: string) => { window.open(src, '_blank'); },
    getVerificationCode: () => '',
    searchBook: (keyword: string, source: any) => {},
    openUrl: (url: string) => { window.open(url, '_blank'); },
    copyText: (text: string) => { navigator.clipboard?.writeText(text); },
    loadCookies: () => {},
    saveCookies: () => {},
    loginComplete: (url: string, cookie: string) => {},
    readBookConfig: {},
    refreshExplore: () => {},
    refreshBookInfo: () => {},
    upLoginData: (info: string) => {},
    eventListener: false,
    on: () => {},
    emit: () => {},
  }
}
