// ============================================
// 沙箱事件 API（占位）
// ============================================

export interface EventListenerOptions {
  sourceKey: string
  onEvent?: (name: string, ...args: any[]) => any
}

export function createEventApi(_options: EventListenerOptions): Record<string, any> {
  return {
    eventListener: true,
    on: (_event: string, _handler: (...args: any[]) => any) => {},
    emit: (_event: string, ..._args: any[]) => {},
  }
}
