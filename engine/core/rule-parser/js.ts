// ============================================
// JS 执行器 — 复用 Rust Deno 运行时
// ============================================

type JsExecutor = (code: string, context: Record<string, any>) => Promise<string>

let executor: JsExecutor | null = null

export function setJsExecutor(fn: JsExecutor): void {
  executor = fn
}

export async function executeJs(
  code: any,
  context: Record<string, any>
): Promise<string> {
  // 确保 code 是字符串
  const codeStr = typeof code === 'string' ? code : String(code)

  if (!executor) {
    console.warn('[executeJs] 执行器未注入，尝试从 api 导入')
    try {
      const { engine } = await import('../../../src/api/index.js')
      const result = await engine.executeJs(codeStr, context)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch (err: any) {
      console.error('[executeJs] 降级执行失败:', err.message)
      return ''
    }
  }
  try {
    const result = await executor(codeStr, context)
    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch (err: any) {
    console.error('[executeJs] 执行失败:', err.message)
    return ''
  }
}
