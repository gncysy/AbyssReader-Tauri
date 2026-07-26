// ============================================
// 事件系统 — 支持 Tauri 跨进程通信
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

// ============================================
// 全局日志事件总线（跨进程）
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// 业务模块
export type LogModule =
  | 'explore'      // 发现页
  | 'search'       // 搜索
  | 'bookshelf'    // 书架
  | 'reader'       // 阅读器
  | 'source'       // 书源管理
  | 'network'      // 网络请求
  | 'engine'       // 引擎核心
  | 'system'       // 系统
  | 'ui'           // UI 组件
  | 'storage'      // 存储
  | 'login'        // 登录
  | 'sync'         // 同步
  | 'sandbox'      // 沙箱
  | 'crypto'       // 加密
  | 'url'          // URL解析
  | 'rule'         // 规则解析
  | 'unknown'      // 未知

// 日志来源（谁产生的）
export type LogSource = 'rust' | 'deno' | 'frontend'

export interface LogEntry {
  time: string
  level: LogLevel
  module: LogModule      // 业务模块
  source: LogSource      // 来源
  message: string
  tag?: string           // 可选标签，用于更精细过滤
}

// 日志订阅过滤器
export interface LogFilter {
  module?: LogModule | LogModule[]
  source?: LogSource | LogSource[]
  level?: LogLevel | LogLevel[]
  tag?: string
}

type LogListener = (entry: LogEntry) => void

const logListeners: Array<{ handler: LogListener; filter?: LogFilter }> = []
const MAX_LOGS = 1000
export const logHistory: LogEntry[] = []

// 判断日志是否匹配过滤器
function matchesFilter(entry: LogEntry, filter?: LogFilter): boolean {
  if (!filter) return true
  if (filter.module) {
    const modules = Array.isArray(filter.module) ? filter.module : [filter.module]
    if (!modules.includes(entry.module)) return false
  }
  if (filter.source) {
    const sources = Array.isArray(filter.source) ? filter.source : [filter.source]
    if (!sources.includes(entry.source)) return false
  }
  if (filter.level) {
    const levels = Array.isArray(filter.level) ? filter.level : [filter.level]
    if (!levels.includes(entry.level)) return false
  }
  if (filter.tag && entry.tag !== filter.tag) return false
  return true
}

// 注册日志监听器（支持过滤）
export function onLog(
  handler: LogListener,
  filter?: LogFilter
): () => void {
  logListeners.push({ handler, filter })
  // 回放历史日志（只回放匹配的）
  logHistory.forEach(entry => {
    if (matchesFilter(entry, filter)) {
      handler(entry)
    }
  })
  // 返回取消订阅函数
  return () => {
    const idx = logListeners.findIndex(l => l.handler === handler)
    if (idx !== -1) logListeners.splice(idx, 1)
  }
}

// 取消订阅（兼容旧接口）
export function offLog(handler: LogListener): void {
  const idx = logListeners.findIndex(l => l.handler === handler)
  if (idx !== -1) logListeners.splice(idx, 1)
}

// 发送日志
export function emitLog(
  level: LogLevel,
  module: LogModule,
  source: LogSource,
  message: string,
  tag?: string
): void {
  const entry: LogEntry = {
    time: new Date().toLocaleTimeString(),
    level,
    module,
    source,
    message,
    tag,
  }
  logHistory.push(entry)
  if (logHistory.length > MAX_LOGS) logHistory.shift()
  logListeners.forEach(({ handler, filter }) => {
    if (matchesFilter(entry, filter)) {
      try { handler(entry) } catch {}
    }
  })
}

// ─── 便捷函数 ───
export function logDebug(module: LogModule, source: LogSource, message: string, tag?: string) {
  emitLog('debug', module, source, message, tag)
}
export function logInfo(module: LogModule, source: LogSource, message: string, tag?: string) {
  emitLog('info', module, source, message, tag)
}
export function logWarn(module: LogModule, source: LogSource, message: string, tag?: string) {
  emitLog('warn', module, source, message, tag)
}
export function logError(module: LogModule, source: LogSource, message: string, tag?: string) {
  emitLog('error', module, source, message, tag)
}

// 初始化 Tauri 事件监听
export async function initLogBridge() {
  try {
    const { listen } = await import('@tauri-apps/api/event')
    await listen('global-log', (event: any) => {
      const payload = event.payload as { level: string; module: string; source: string; message: string; tag?: string }
      emitLog(
        (payload.level || 'info') as LogLevel,
        (payload.module || 'unknown') as LogModule,
        (payload.source || 'rust') as LogSource,
        payload.message || '',
        payload.tag
      )
    })
  } catch {}
}

// 挂载到 window 供 deno_core console 调用
if (typeof window !== 'undefined') {
  (window as any).__abyssEmitLog = (
    level: string,
    module: string,
    source: string,
    msg: string,
    tag?: string
  ) => {
    emitLog(
      level as LogLevel,
      (module || 'unknown') as LogModule,
      (source || 'deno') as LogSource,
      msg,
      tag
    )
  }
}
