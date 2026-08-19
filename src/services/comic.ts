// ============================================
// 漫画图片服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'
import type { ComicImage } from '@engine/business/comic/index.js'

export async function proxyCover(url: string, sourceJson: string): Promise<string> {
  try {
    return await invoke('proxy_image', { url, sourceJson })
  } catch {
    // 降级：尝试直接请求（浏览器会拦截跨域，但作为最后手段）
    try {
      const response = await fetch(url, { mode: 'no-cors' })
      if (response.ok) {
        const blob = await response.blob()
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
      }
    } catch {}
    return url
  }
}

export async function loadSingleImage(
  item: ComicImage,
  sourceJson: string,
  comicId: string,
): Promise<void> {
  while (item.retries > 0 && item.status !== 'loaded') {
    try {
      const result: any = await invoke('comic_fetch_image', { url: item.url, sourceJson, comicId })
      if (result?.data) { item.data = result.data; item.status = 'loaded'; return }
      if (result?.direct && result?.src) { item.directUrl = result.src; item.status = 'loaded'; return }
      item.retries--
    } catch {
      item.retries--
      if (item.retries <= 0) { item.status = 'error'; return }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (item.status !== 'loaded') item.status = 'error'
}

export async function loadComicImages(
  images: ComicImage[],
  sourceJson: string,
  comicId: string,
  concurrency = 2,
): Promise<void> {
  const queue = [...images]
  const workers: Promise<void>[] = []
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      await loadSingleImage(item, sourceJson, comicId)
    }
  }
  for (let i = 0; i < Math.min(concurrency, images.length); i++) workers.push(worker())
  await Promise.all(workers)
}

export async function prefetchComicImages(
  urls: string[],
  sourceJson: string,
  comicId: string,
): Promise<void> {
  invoke('comic_prefetch_images', { urls, sourceJson, comicId }).catch(() => {})
}
