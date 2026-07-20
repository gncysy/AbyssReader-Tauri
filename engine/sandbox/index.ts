// ============================================
// JS 沙箱 — 浏览器端 new Function 执行
// ============================================

import { createJavaApi } from './java-api.js'
import { parseJsoup } from './jsoup-mock.js'
import { setPersistentStore } from './java-storage.js'
import { getString as ruleGetString, getElements as ruleGetElements, getElement as ruleGetElement } from '../core/rule-parser/index.js'
import { putContext, getContext } from '../context/store.js'
import type { JavaApiOptions } from './java-api.js'

const jsLibScopes = new Map<string, boolean>()

export function setCookieJar(jar: any): void {
  (globalThis as any).__sandboxCookieJar = jar
}

export interface SandboxContext {
  result?: any; src?: any; source?: any; book?: any; chapter?: any
  baseUrl?: string; nextChapterUrl?: string; cookie?: any
}

function buildSandbox(context: SandboxContext): any {
  const { result = null, src = result, source = {}, book = {}, chapter = {}, baseUrl = '', nextChapterUrl = null, cookie = null } = context
  const sourceKey = source?.bookSourceUrl || source?.url || 'default'

  const sandbox: any = {
    result, book, source, baseUrl, chapter, nextChapterUrl, src, cookie,
    JSON, String, Number, Boolean, Array, Object, parseInt, parseFloat, isNaN, isFinite,
    console: {
      log: (...args: any[]) => console.log('[Sandbox]', ...args),
      error: (...args: any[]) => console.error('[Sandbox]', ...args),
      warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
    },
  }

  if (source.jsLib) {
    if (!jsLibScopes.has(sourceKey)) {
      try {
        const fn = new Function(...Object.keys(sandbox), source.jsLib)
        fn(...Object.values(sandbox))
        jsLibScopes.set(sourceKey, true)
      } catch (e: any) {
        console.warn('[Sandbox] jsLib 加载失败:', sourceKey, e.message)
      }
    }
  }

  const javaApiOptions: JavaApiOptions = { sourceKey, cookie, source }
  const javaObj = createJavaApi(javaApiOptions)
  javaObj.getString = (rule: string, mContent?: any) => {
    const data = mContent !== undefined ? mContent : sandbox.result || ''
    return ruleGetString(data, rule, { source, baseUrl, book })
  }
  javaObj.getElements = (rule: string, mContent?: any) => {
    const data = mContent !== undefined ? mContent : sandbox.result || ''
    return ruleGetElements(data, rule, { source, baseUrl, book })
  }
  javaObj.getElement = (rule: string, mContent?: any) => {
    const data = mContent !== undefined ? mContent : sandbox.result || ''
    return ruleGetElement(data, rule, { source, baseUrl, book })
  }
  sandbox.java = javaObj
  sandbox.org = { jsoup: { Jsoup: { parse: (html: string) => parseJsoup(html) } } }

  if ((globalThis as any).__persistentStore) {
    setPersistentStore((globalThis as any).__persistentStore)
  }

  return sandbox
}

export function executeJs(jsCode: string, context: SandboxContext = {}): any {
  if (!jsCode) return context.result || ''

  const sourceKey = context.source?.bookSourceUrl || context.source?.url || 'default'
  const sandbox = buildSandbox(context)

  try {
    const fn = new Function(
      ...Object.keys(sandbox),
      `"use strict"; return (function() { ${jsCode} })()`
    )
    const output = fn(...Object.values(sandbox))

    if (output && typeof output === 'object' && typeof output.size === 'function' && typeof output.get === 'function') {
      const arr: any = []
      const len = output.size()
      for (let i = 0; i < len; i++) arr.push(output.get(i))
      ;(arr as any).size = output.size
      ;(arr as any).select = output.select
      ;(arr as any).remove = output.remove
      return arr
    }

    if (typeof output === 'string') return output
    if (output !== undefined && output !== null) return JSON.stringify(output)
    return ''
  } catch (e: any) {
    console.warn('[Sandbox] 执行失败:', sourceKey, e.message)
    console.warn('[Sandbox] 代码前100字:', jsCode?.substring(0, 100))
    return ''
  }
}

export function clearJsCache(): void {
  jsLibScopes.clear()
}
