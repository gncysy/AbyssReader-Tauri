// ============================================
// RSS 登录服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export interface RssLoginSource {
  sourceUrl: string
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  [key: string]: any
}

export async function executeRssLoginJs(
  code: string,
  source: RssLoginSource,
  extraContext: Record<string, any> = {},
): Promise<{ success: boolean; result: string; error?: string }> {
  const context = {
    source,
    result: extraContext.result ?? '',
    baseUrl: source.sourceUrl || '',
    formData: extraContext.formData || {},
  }
  const response: any = await invoke('execute_js_rule', {
    code,
    context,
    timeoutMs: extraContext.timeoutMs || 15000,
  })
  return {
    success: !!response?.success,
    result: response?.result || '',
    error: response?.error,
  }
}
