// ============================================
// 沙箱网络 API
// ============================================

export function createNetApi(options: {
  cookie?: { getCookie: (url: string) => string; getKey: (url: string, key: string) => string }
} = {}): Record<string, any> {
  const cookie = options.cookie || { getCookie: () => '', getKey: () => '' }

  return {
    ajax: async (url: any): Promise<string> => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const urlStr = Array.isArray(url) ? String(url[0]) : String(url)
        const result: any = await invoke('execute_js_rule', {
          request: {
            code: `java.ajax('${urlStr.replace(/'/g, "\\'")}')`,
            context: {},
            timeoutMs: 30000
          }
        })
        return result?.success ? result.result : 'error: ' + (result?.error || 'unknown')
      } catch (e: any) { return 'error: ' + (e?.message || String(e)) }
    },
    ajaxAll: async (urlList: string[]): Promise<string[]> => {
      const results: string[] = []
      for (const url of urlList) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const result: any = await invoke('execute_js_rule', {
            request: { code: `java.ajax('${url.replace(/'/g, "\\'")}')`, context: {}, timeoutMs: 30000 }
          })
          results.push(result?.success ? result.result : '')
        } catch { results.push('') }
      }
      return results
    },
    connect: async (urlStr: string): Promise<any> => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const result: any = await invoke('execute_js_rule', {
          request: { code: `java.ajax('${urlStr.replace(/'/g, "\\'")}')`, context: {}, timeoutMs: 30000 }
        })
        return result?.success ? result.result : ''
      } catch { return '' }
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
