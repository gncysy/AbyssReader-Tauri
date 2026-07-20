// ============================================
// 登录流程（占位 — 未来实现）
// ============================================

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

export async function performLogin(_config: LoginConfig): Promise<LoginResult> {
  return { success: false, error: '未实现' }
}
