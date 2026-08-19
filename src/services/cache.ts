// ============================================
// 缓存 API — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'
import type { Book } from '@/types'

// ─── LRU 缓存 ───

class LRUCache<K, V> {
  private maxSize: number
  private cache: Map<K, V>

  constructor(maxSize: number) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, value)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// ─── 内存缓存实例 ───

const MAX_CACHED_CHAPTERS = 100
const preloadedContents = new LRUCache<string, string>(MAX_CACHED_CHAPTERS)
const rawContents = new LRUCache<string, string>(MAX_CACHED_CHAPTERS)

export const cache = {
  getInfo: (): Promise<any> => invoke('cache_get_info'),

  clearAll: (): Promise<any> => invoke('cache_clear'),

  clearCategory: (category: string): Promise<any> =>
    invoke('cache_clear_category', { category }),

  getCover: (url: string): Promise<string | null> =>
    invoke('cache_get_cover', { url }),

  putCover: (url: string, dataBase64: string): Promise<string> =>
    invoke('cache_put_cover', { url, dataBase64 }),

  hasCover: (url: string): Promise<boolean> =>
    invoke('cache_has_cover', { url }),

  getToc: (bookUrl: string): Promise<string | null> =>
    invoke('cache_get_toc', { bookUrl }),

  putToc: (bookUrl: string, dataJson: string): Promise<string> =>
    invoke('cache_put_toc', { bookUrl, dataJson }),

  getContent: (bookUrl: string): Promise<string | null> =>
    invoke('cache_get_content', { bookUrl }),

  putContent: (bookUrl: string, dataJson: string): Promise<string> =>
    invoke('cache_put_content', { bookUrl, dataJson }),

  setMaxSize: (maxMb: number): Promise<any> =>
    invoke('cache_set_max_size', { maxMb }),

  migrate: (newPath: string): Promise<any> =>
    invoke('cache_migrate', { newPath }),

  putCovers: (items: Array<{ url: string; data: string }>): Promise<number> =>
    invoke('cache_put_covers', { items }),
}

// ─── 章节缓存辅助 ───

// 使用 encodeURIComponent 避免键碰撞
function getBookCacheKey(book: Book): string {
  const key = book.tocUrl || book.bookUrl
  return encodeURIComponent(key)
}

function getChapterCacheKey(book: Book, chapterIndex: number): string {
  return getBookCacheKey(book) + '::' + chapterIndex
}

export function getPreloadedContent(book: Book, chapterIndex: number): string | undefined {
  return preloadedContents.get(getChapterCacheKey(book, chapterIndex))
}

export function setPreloadedContent(book: Book, chapterIndex: number, content: string): void {
  preloadedContents.set(getChapterCacheKey(book, chapterIndex), content)
}

export function clearPreloadedContents(): void {
  preloadedContents.clear()
}

export function getRawContent(book: Book, chapterIndex: number): string | undefined {
  return rawContents.get(getChapterCacheKey(book, chapterIndex))
}

export function setRawContent(book: Book, chapterIndex: number, content: string): void {
  rawContents.set(getChapterCacheKey(book, chapterIndex), content)
}

export function hasPreloadedContent(book: Book, chapterIndex: number): boolean {
  return preloadedContents.has(getChapterCacheKey(book, chapterIndex))
}

export async function getCachedContent(
  book: Book,
  chapterId: number
): Promise<string | null> {
  try {
    const bookKey = getBookCacheKey(book)
    const key = bookKey + '/' + chapterId
    const raw = await invoke('cache_get_content', { bookUrl: key })
    if (raw) return raw as string
  } catch {
    // ignore
  }
  return null
}

export async function setCachedContent(
  book: Book,
  chapterId: number,
  data: string
): Promise<void> {
  try {
    const bookKey = getBookCacheKey(book)
    const key = bookKey + '/' + chapterId
    await invoke('cache_put_content', { bookUrl: key, dataJson: data })
  } catch {
    // ignore
  }
}
