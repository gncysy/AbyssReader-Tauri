// ============================================
// 沙箱上下文管理（占位 — 未来实现）
// ============================================

interface SandboxInstance {
  context: any
  createdAt: number
  lastAccessed: number
}

const instances = new Map<string, SandboxInstance>()

export function getOrCreateContext(sourceId: string): any {
  const existing = instances.get(sourceId)
  if (existing) {
    existing.lastAccessed = Date.now()
    return existing.context
  }
  const context = {}
  instances.set(sourceId, { context, createdAt: Date.now(), lastAccessed: Date.now() })
  return context
}

export function destroyContext(sourceId: string): void {
  instances.delete(sourceId)
}

export function clearAllContexts(): void {
  instances.clear()
}
