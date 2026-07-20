// ============================================
// 沙箱网络 API（Tauri 版：标记为不可用，走 Rust deno_core）
// ============================================

export function createNetApi(options: {
  cookie?: { getCookie: (url: string) => string; getKey: (url: string, key: string) => string }
} = {}): Record<string, any> {
  const cookie = options.cookie || { getCookie: () => '', getKey: () => '' }

  return {
    ajax: (_url: any): string => {
      throw new Error('java.ajax 必须通过 deno_core 执行，请使用 invoke("execute_js_rule")')
    },
    ajaxAll: (_urlList: string[]): string[] => {
      throw new Error('java.ajaxAll 必须通过 deno_core 执行')
    },
    connect: (_urlStr: string): any => {
      throw new Error('java.connect 必须通过 deno_core 执行')
    },
    getCookie: (tag: string, key?: string): string => {
      if (key) return cookie.getKey(tag, key)
      return cookie.getCookie(tag)
    },
    cookie: {
      getCookie: (tag: string): string => cookie.getCookie(tag),
      getKey: (tag: string, key: string): string => cookie.getKey(tag, key),
      setCookie: (_url: string, _cookieStr: string): void => {},
    },
  }
}
