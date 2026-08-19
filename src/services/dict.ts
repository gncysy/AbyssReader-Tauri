// ============================================
// 字典查询服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { shouldExecuteInDeno } from './rule-evaluator.js'

export interface DictQueryResult {
  content: string
}

export async function queryDict(
  urlRule: string,
  showRule: string,
  key: string,
  timeoutSecs = 20,
): Promise<string> {
  const needDeno = shouldExecuteInDeno(urlRule) || shouldExecuteInDeno(showRule)

  if (needDeno) {
    const response: any = await invoke('dict_query', {
      urlRule,
      showRule,
      key,
      timeoutSecs: timeoutSecs || 20,
    })
    return response?.result || '<p>查询失败</p>'
  }

  try {
    const replacedUrl = urlRule.replace(/\{\{key\}\}/g, encodeURIComponent(key))
    const response: any = await invoke('fetch_url', {
      url: replacedUrl,
      method: 'GET',
      body: null,
      headers: {},
      charset: null,
      useWebview: false,
      webJs: null,
      timeoutSecs: timeoutSecs || 20,
      sourceType: 0,
      preserveStyle: false,
    })

    const html = typeof response === 'string' ? response : JSON.stringify(response)
    if (!html || html.length < 10) return '<p>获取页面内容失败</p>'

    const { getString } = await import('@engine/parser/index.js')
    const result = await getString(html, showRule, {})
    if (!result || result.length === 0) return '<p>未匹配到内容</p>'
    return result
  } catch (e: any) {
    return '<p>查询失败: ' + (e?.message || String(e)) + '</p>'
  }
}
