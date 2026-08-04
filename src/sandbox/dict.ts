import { invoke } from '@tauri-apps/api/core'

export async function queryDict(urlRule: string, showRule: string, key: string, timeoutSecs: number = 20): Promise<string> {
  try {
    const result: any = await invoke('dict_query', {
      urlRule,
      showRule,
      key,
      timeoutSecs,
    })
    console.log('[dict_query] 完整返回:', JSON.stringify(result, null, 2))
    if (result?.success) {
      const res = result.result
      if (res === null || res === undefined || res === '') {
        return '<p>未找到该词</p>'
      }
      if (res === '[]') {
        return '<p>未找到该词</p>'
      }
      return res
    }
    console.error('[dict_query] 错误详情:', result?.error)
    return '<p>查询失败: ' + (result?.error || '未知错误') + '</p>'
  } catch (e: any) {
    console.error('[dict_query] 异常:', e)
    return '<p>查询异常: ' + (e?.message || String(e)) + '</p>'
  }
}
