// ============================================
// 事件系统（占位 — 未来实现）
// ============================================

export type EventName = string
export type EventHandler = (...args: any[]) => any

export interface EventRegistry {
  register(name: EventName, handler: EventHandler): void
  emit(name: EventName, ...args: any[]): any
  clear(): void
}

export function createEventRegistry(): EventRegistry {
  const handlers = new Map<EventName, EventHandler>()
  return {
    register(name, handler) { handlers.set(name, handler) },
    emit(name, ...args) {
      const h = handlers.get(name)
      return h ? h(...args) : undefined
    },
    clear() { handlers.clear() },
  }
}
