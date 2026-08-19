// ============================================
// 日志 & 诊断系统（全局统一）
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogModule =
  | 'explore' | 'search' | 'bookshelf' | 'reader' | 'source'
  | 'network' | 'engine' | 'system' | 'ui' | 'storage'
  | 'login' | 'sync' | 'sandbox' | 'crypto' | 'url'
  | 'rule' | 'diagnostics' | 'unknown'

export type LogSource = 'rust' | 'deno' | 'frontend'

export interface LogEntry {
  time: string
  level: LogLevel
  module: LogModule
  source: LogSource
  message: string
  tag?: string
}

export interface LogFilter {
  module?: LogModule | LogModule[]
  source?: LogSource | LogSource[]
  level?: LogLevel | LogLevel[]
  tag?: string
}

type LogListener = (entry: LogEntry) => void

const logListeners: Array<{ handler: LogListener; filter?: LogFilter }> = []
const MAX_LOGS = 2000
const MAX_LISTENERS = 100
export const logHistory: LogEntry[] = []

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

export function onLog(handler: LogListener, filter?: LogFilter): () => void {
  const existingIdx = logListeners.findIndex((l) => l.handler === handler)
  if (existingIdx !== -1) {
    logListeners.splice(existingIdx, 1)
  }
  logListeners.push({ handler, filter })
  if (logListeners.length > MAX_LISTENERS) {
    logListeners.shift()
  }
  logHistory.forEach((entry) => {
    if (matchesFilter(entry, filter)) handler(entry)
  })
  return () => offLog(handler)
}

export function offLog(handler: LogListener): void {
  const idx = logListeners.findIndex((l) => l.handler === handler)
  if (idx !== -1) logListeners.splice(idx, 1)
}

export function emitLog(
  level: LogLevel,
  module: LogModule,
  source: LogSource,
  message: string,
  tag?: string,
): void {
  const entry: LogEntry = {
    time: new Date().toLocaleTimeString(),
    level, module, source, message, tag,
  }
  logHistory.push(entry)
  if (logHistory.length > MAX_LOGS) {
    const excess = logHistory.length - MAX_LOGS
    logHistory.splice(0, excess)
  }
  logListeners.forEach(({ handler, filter }) => {
    if (matchesFilter(entry, filter)) {
      try { handler(entry) } catch { /* ignore */ }
    }
  })

  if (message.startsWith('DIAG|')) {
    const diag = parseDiagnostic(entry)
    if (diag) recordDiagnostic(diag)
  }
}

export function logDebug(module: LogModule, source: LogSource, message: string, tag?: string): void {
  emitLog('debug', module, source, message, tag)
}

export function logInfo(module: LogModule, source: LogSource, message: string, tag?: string): void {
  emitLog('info', module, source, message, tag)
}

export function logWarn(module: LogModule, source: LogSource, message: string, tag?: string): void {
  emitLog('warn', module, source, message, tag)
}

export function logError(module: LogModule, source: LogSource, message: string, tag?: string): void {
  emitLog('error', module, source, message, tag)
}

export interface LogBridge {
  init(): Promise<void>
}

let logBridge: LogBridge | null = null

export function setLogBridge(bridge: LogBridge): void {
  logBridge = bridge
}

export function getLogBridge(): LogBridge | null {
  return logBridge
}

export async function initLogBridge(): Promise<void> {
  if (logBridge) {
    await logBridge.init()
  }
}

export interface DiagnosticSnapshot {
  id: string
  timestamp: string
  tag: string
  sourceUrl: string
  hasCrypto: boolean
  resultLen: number
  outputLen: number
  cachedLen: number
  preview: string
  d0?: string
  d1?: string
  errorInfo?: string
  extra: Record<string, string>
}

const diagnosticHistory: DiagnosticSnapshot[] = []
const MAX_DIAGNOSTICS = 50

function parseDiagnostic(entry: LogEntry): DiagnosticSnapshot | null {
  const msg = entry.message || ''
  const prefix = 'DIAG|'
  if (!msg.startsWith(prefix)) return null
  const rest = msg.substring(prefix.length)
  const pipe2 = rest.indexOf('|')
  if (pipe2 === -1) return null
  const type = rest.substring(0, pipe2)
  const jsonStr = rest.substring(pipe2 + 1)
  try {
    const d = JSON.parse(jsonStr)
    const extra: Record<string, string> = {}
    const knownKeys = new Set(['t','u','c','r','o','p','a','m','s','x','y','z','v','w','q','e','f','d0','d1'])
    for (const k of Object.keys(d)) {
      if (!knownKeys.has(k)) extra[k] = typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k])
    }
    return {
      id: entry.time + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: entry.time,
      tag: d.t || type,
      sourceUrl: d.u || '',
      hasCrypto: !!d.c,
      resultLen: d.r ?? -1,
      outputLen: d.o ?? -1,
      cachedLen: d.a ?? -1,
      preview: d.p || '',
      d0: d.d0 || undefined,
      d1: d.d1 || undefined,
      errorInfo: type === 'error' ? (d.m || d.e || d.s || undefined) : undefined,
      extra,
    }
  } catch {
    return null
  }
}

export function recordDiagnostic(snapshot: DiagnosticSnapshot): void {
  diagnosticHistory.unshift(snapshot)
  if (diagnosticHistory.length > MAX_DIAGNOSTICS) diagnosticHistory.pop()
}

export function getDiagnostics(tag?: string): DiagnosticSnapshot[] {
  if (tag) return diagnosticHistory.filter((d) => d.tag === tag)
  return [...diagnosticHistory]
}

export function clearDiagnostics(): void {
  diagnosticHistory.length = 0
}
