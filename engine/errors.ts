// ============================================
// 引擎错误类型
// ============================================

export class ParseError extends Error {
  constructor(message: string, public readonly rule?: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly url?: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class SourceError extends Error {
  constructor(message: string, public readonly sourceName?: string) {
    super(message)
    this.name = 'SourceError'
  }
}

export class UserCancelError extends Error {
  constructor(message = '用户已取消') {
    super(message)
    this.name = 'UserCancelError'
  }
}

export function isUserCancel(err: unknown): err is UserCancelError {
  return err instanceof UserCancelError ||
    (err instanceof Error &&
      (err.name === 'AbortError' ||
       err.name === 'CancelError' ||
       err.message === 'canceled' ||
       err.message === 'aborted' ||
       err.message === '用户已取消'))
}
