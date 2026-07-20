// ============================================
// T6 - 变量存储（按 sourceId 隔离）
// ============================================

const contextStore = new Map<string, Map<string, any>>()
const chapterStore = new Map<string, Map<string, any>>()
const bookStore = new Map<string, Map<string, any>>()

// ─── 全局变量 ───
function getSourceMap(sourceId: string): Map<string, any> {
  if (!contextStore.has(sourceId)) {
    contextStore.set(sourceId, new Map())
  }
  return contextStore.get(sourceId)!
}

export function putContext(sourceId: string, key: string, value: any): void {
  getSourceMap(sourceId).set(key, value)
}

export function getContext(sourceId: string, key: string): any {
  return getSourceMap(sourceId).get(key)
}

export function clearContext(sourceId?: string): void {
  if (sourceId) {
    contextStore.delete(sourceId)
    chapterStore.delete(sourceId)
    bookStore.delete(sourceId)
  } else {
    contextStore.clear()
    chapterStore.clear()
    bookStore.clear()
  }
}

// ─── 章节变量 ───
function getChapterMap(sourceId: string): Map<string, any> {
  if (!chapterStore.has(sourceId)) {
    chapterStore.set(sourceId, new Map())
  }
  return chapterStore.get(sourceId)!
}

export function putChapterVariable(sourceId: string, chapterKey: string, key: string, value: any): void {
  getChapterMap(sourceId).set(`${chapterKey}::${key}`, value)
}

export function getChapterVariable(sourceId: string, chapterKey: string, key: string): any {
  return getChapterMap(sourceId).get(`${chapterKey}::${key}`)
}

// ─── 书籍变量 ───
function getBookMap(sourceId: string): Map<string, any> {
  if (!bookStore.has(sourceId)) {
    bookStore.set(sourceId, new Map())
  }
  return bookStore.get(sourceId)!
}

export function putBookVariable(sourceId: string, key: string, value: any): void {
  getBookMap(sourceId).set(key, value)
}

export function getBookVariable(sourceId: string, key: string): any {
  return getBookMap(sourceId).get(key)
}
