// ============================================
// JS 规则执行（强制走 deno_core，不再回退浏览器）
// ============================================

import type { ParseContext } from '../../types.js'
import { logDebug, logInfo, logWarn, logError } from '../../event/index.js'

let jsExecutor: ((code: string, context: Record<string, any>) => Promise<string>) | null = null

export function setJsExecutor(fn: (code: string, context: Record<string, any>) => Promise<string>) {
  jsExecutor = fn
  logInfo('engine', 'frontend', 'JS执行器已注入 (deno_core)')
  console.log('[js.ts] JS执行器已注入')
}

export async function executeJs(source: any, rule: string, context: ParseContext): Promise<any> {
  const ctx: Record<string, any> = {
    result: context.result !== undefined ? context.result : (typeof source === 'string' ? source : ''),
    src: context.src || (typeof source === 'string' ? source : ''),
    source: context.source,
    book: context.book || {},
    chapter: context.chapter,
    baseUrl: context.baseUrl || '',
    nextChapterUrl: context.nextChapterUrl,
    key: context.key,
    page: context.page || 1,
  }

  let code = rule.trim()
  if (code.startsWith('@js:')) {
    code = code.substring(4).trim()
  }
  if (code.startsWith('<js>')) {
    code = code.substring(4)
  }
  if (code.endsWith('</js>')) {
    code = code.substring(0, code.length - 5)
  }

  logDebug('engine', 'frontend', 'executeJs 调用, code长度=' + code.length + ', jsExecutor存在=' + (!!jsExecutor))

  if (jsExecutor) {
    try {
      logDebug('engine', 'frontend', '调用 jsExecutor, context keys=' + Object.keys(ctx).join(','))
      const result = await jsExecutor(code, ctx)
      logDebug('engine', 'frontend', 'jsExecutor 返回, result类型=' + typeof result + ', 长度=' + (result ? result.length : 0))
      if (result !== undefined && result !== null) {
        if (typeof result === 'string') {
          try { return JSON.parse(result) } catch { return result }
        }
        return result
      }
      return ''
    } catch (e: any) {
      logError('engine', 'frontend', 'deno_core 执行失败: ' + (e?.message || e))
      console.error('[JS] deno_core 执行失败:', e)
      return ''
    }
  }

  logWarn('engine', 'frontend', 'deno_core 不可用，无法执行 JS 规则')
  console.warn('[JS] deno_core 不可用')
  return ''
}
