// ============================================
// JS 执行器接口 + 全局注册
// ============================================

import type { JsRuntime } from '../types.js'

let globalRuntime: JsRuntime | null = null

export function setJsRuntime(runtime: JsRuntime): void {
  globalRuntime = runtime
}

export function getJsRuntime(): JsRuntime | null {
  return globalRuntime
}

export function clearJsCache(): void {
  globalRuntime?.clearCache?.()
}
