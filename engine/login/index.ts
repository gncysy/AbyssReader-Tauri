import { invoke } from '@tauri-apps/api/core'

export interface LoginConfig {
  loginUrl: string
  loginUi?: string
  loginCheckJs?: string
  sourceKey: string
}

export interface LoginResult {
  success: boolean
  cookies?: Record<string, string>
  error?: string
}

export async function executeLoginJs(source: any): Promise<LoginResult> {
  try {
    const result: any = await invoke('source_login', { source })
    if (result?.success) return { success: true, cookies: result.result ? JSON.parse(result.result) : undefined }
    return { success: false, error: result?.error || '未知错误' }
  } catch (e: any) { return { success: false, error: e?.message || String(e) } }
}

export async function checkLoginStatus(source: any): Promise<boolean> {
  try {
    const checkJs = (source as any)?.loginCheckJs
    if (!checkJs) return false
    const result: any = await invoke('execute_js_rule', {
      code: checkJs.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, ''),
      context: { source, result: '', baseUrl: source.bookSourceUrl || '' },
      timeoutMs: 10000
    })
    return result?.success && result?.result === 'true'
  } catch { return false }
}

export async function performLogin(config: LoginConfig): Promise<LoginResult> {
  const { loginUrl, sourceKey } = config
  if (!loginUrl) return { success: false, error: '书源未配置 loginUrl' }

  try {
    const { store } = await import('../../src/api/index.js')
    const sources = await store.get('bookSource')
    const source = Array.isArray(sources) ? sources.find((s: any) => (s.bookSourceUrl || s.bookSourceName) === sourceKey) : null
    if (!source) return { success: false, error: '书源未找到: ' + sourceKey }

    if (source.loginUi) {
      try {
        const uiResult: any = await invoke('source_login_ui', { source })
        if (uiResult?.success && uiResult.result) {
          const uiItems = JSON.parse(uiResult.result)
          return { success: true, cookies: { uiItems: JSON.stringify(uiItems) } }
        }
      } catch (e: any) { return { success: false, error: '登录UI加载失败: ' + (e?.message || e) } }
    }

    const loginResult = await executeLoginJs(source)
    if (loginResult.success) return loginResult

    if (source.bookSourceUrl) {
      try {
        const { loginWebview } = await import('../../src/api/index.js')
        await loginWebview(source.bookSourceUrl, source.bookSourceName || '登录', 300)
        return { success: true }
      } catch (e: any) { return { success: false, error: 'WebView登录失败: ' + (e?.message || e) } }
    }

    return { success: false, error: '登录失败，请尝试WebView登录' }
  } catch (e: any) { return { success: false, error: e?.message || String(e) } }
}
