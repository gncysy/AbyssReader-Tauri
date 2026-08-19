// ============================================
// useErrorHandler — Vue 组合式错误处理
// 不依赖 useMessage，由调用方决定如何显示
// ============================================

import { handleError, type ErrorContext, type ErrorResult } from '@/utils/error-handler.js'

export function useErrorHandler() {
  function handleAndNotify(err: unknown, ctx: ErrorContext): ErrorResult {
    const result = handleError(err, ctx)
    // 返回结果，由调用方决定是否弹 toast
    return result
  }

  function handleSilent(err: unknown, ctx: ErrorContext): ErrorResult {
    return handleError(err, { ...ctx, silent: true })
  }

  return {
    handleAndNotify,
    handleSilent,
  }
}
