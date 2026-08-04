// ============================================
// 前端 V8 沙箱 - java API（同步，无 ajax）
// ============================================

import { createCryptoApi } from './crypto.js'
import { parseJsoup } from './jsoup-mock.js'
import { jsonPathQuery } from './jsonpath.js'

const dictMemoryCache: Record<string, any> = {}

export function createJavaApi(): Record<string, any> {
  const cryptoApi = createCryptoApi()
  return {
    ...cryptoApi,
    encodeURI: (str: string) => encodeURIComponent(str),
    decodeURI: (str: string) => decodeURIComponent(str),
    log: (msg: any) => { console.log('[sandbox]', msg); return msg },
    toast: (msg: any) => msg,
    longToast: (msg: any) => msg,
    startBrowser: (url: string) => { window.open(url, '_blank') },
    copyText: (text: string) => { navigator.clipboard?.writeText(text) },
    getWebViewUA: () => navigator.userAgent,
    androidId: () => 'abyss-reader-sandbox',
    timeFormat: (ts: number) => new Date(ts).toISOString(),
    randomUUID: () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16) }),
    strToBytes: (str: string) => new TextEncoder().encode(str),
    bytesToStr: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
    getByteArray: (data: any) => typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(),
    t2s: (text: string) => text,
    s2t: (text: string) => text,
    cache: {
      get: (k: string) => dictMemoryCache[k] || null,
      put: (k: string, v: any) => { dictMemoryCache[k] = v },
      delete: (k: string) => { delete dictMemoryCache[k] },
      clear: () => { Object.keys(dictMemoryCache).forEach(k => delete dictMemoryCache[k]) },
      getFromMemory: (k: string) => dictMemoryCache[k] || null,
      putMemory: (k: string, v: any) => { dictMemoryCache[k] = v },
      deleteMemory: (k: string) => { delete dictMemoryCache[k] },
    },
    getString: (rule: string, mContent?: any) => {
      const data = mContent !== undefined ? mContent : ''
      return String(data)
    },
    getElements: (rule: string, mContent?: any) => {
      const data = mContent !== undefined ? mContent : ''
      const doc = new DOMParser().parseFromString(String(data), 'text/html')
      return Array.from(doc.querySelectorAll(rule))
    },
  }
}

export function buildSandbox(result: string, key: string = '', baseUrl: string = ''): Record<string, any> {
  const java = createJavaApi()
  const org = {
    jsoup: {
      Jsoup: {
        parse: (html: string) => parseJsoup(html),
      },
    },
  }
  const Packages = {
    com: {
      jayway: {
        jsonpath: {
          JsonPath: {
            using: (_config: any) => ({
              parse: (json: any) => {
                const data = typeof json === 'string' ? JSON.parse(json) : json
                return {
                  read: (path: string) => {
                    const result = jsonPathQuery(data, path)
                    if (result === null || result === undefined) {
                      if (path.includes('[*]') || path.includes('*')) return []
                      return ''
                    }
                    return result
                  },
                }
              },
            }),
          },
          Configuration: { builder: () => ({ options: () => ({ build: () => ({}) }) }) },
          Option: { SUPPRESS_EXCEPTIONS: 'SUPPRESS_EXCEPTIONS' },
        },
      },
    },
    org,
    java: { lang: { String: (s: any) => String(s) } },
    javax: { crypto: { Cipher: { getInstance: () => ({ init: () => {}, doFinal: (data: any) => data }) } } },
    android: { util: { Base64: { encodeToString: (d: any) => btoa(d), decode: (d: any) => atob(d) } } },
  }
  const cache = java.cache
  return { java, org, Packages, cache, result, key, baseUrl }
}

export function executeJs(code: string, sandbox: Record<string, any>): any {
  const keys = Object.keys(sandbox)
  const values = keys.map(k => sandbox[k])
  const fn = new Function(...keys, code)
  return fn(...values)
}
