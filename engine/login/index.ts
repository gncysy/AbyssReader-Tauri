// ============================================
// 登录流程
// ============================================

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

// 执行书源的 loginUrl JS 规则
export async function executeLoginJs(source: any): Promise<LoginResult> {
  try {
    const result: any = await invoke('source_login', { source })
    if (result?.success) {
      return { success: true, cookies: result.result ? JSON.parse(result.result) : undefined }
    }
    return { success: false, error: result?.error || '未知错误' }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}

// 执行书源的 loginCheckJs 规则，检查登录状态
export async function checkLoginStatus(source: any): Promise<boolean> {
  try {
    const checkJs = (source as any)?.loginCheckJs
    if (!checkJs) return false
    const result: any = await invoke('execute_js_rule', {
      request: {
        code: checkJs.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, ''),
        context: { source, result: '', baseUrl: source.bookSourceUrl || '' },
        timeoutMs: 10000
      }
    })
    return result?.success && result?.result === 'true'
  } catch {
    return false
  }
}

// 完整登录流程
export async function performLogin(config: LoginConfig): Promise<LoginResult> {
  const { loginUrl, sourceKey } = config
  if (!loginUrl) {
    return { success: false, error: '书源未配置 loginUrl' }
  }

  try {
    // 1. 获取书源
    const { store } = await import('../../src/api/index.js')
    const sources = await store.get('bookSource')
    const source = Array.isArray(sources)
      ? sources.find((s: any) => (s.bookSourceUrl || s.bookSourceName) === sourceKey)
      : null

    if (!source) {
      return { success: false, error: '书源未找到: ' + sourceKey }
    }

    // 2. 如果有 loginUi，先渲染 UI 让用户操作
    if (source.loginUi) {
      try {
        const uiResult: any = await invoke('source_login_ui', { source })
        if (uiResult?.success && uiResult.result) {
          const uiItems = JSON.parse(uiResult.result)
          return { success: true, cookies: { uiItems: JSON.stringify(uiItems) } }
        }
      } catch (e: any) {
        return { success: false, error: '登录UI加载失败: ' + (e?.message || e) }
      }
    }

    // 3. 执行 loginUrl JS
    const loginResult = await executeLoginJs(source)
    if (loginResult.success) {
      return loginResult
    }

    // 4. 如果需要 WebView 登录，打开登录窗口
    if (source.bookSourceUrl) {
      try {
        const { loginWebview } = await import('../../src/api/index.js')
        await loginWebview(source.bookSourceUrl, source.bookSourceName || '登录', 300)
        return { success: true }
      } catch (e: any) {
        return { success: false, error: 'WebView登录失败: ' + (e?.message || e) }
      }
    }

    return { success: false, error: '登录失败，请尝试WebView登录' }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}
