// ============================================
// 漫画图片处理 — 纯函数（从 sandbox/comic.ts 迁移）
// ============================================

export interface ComicImage {
  url: string
  data: string
  directUrl: string
  status: 'loading' | 'loaded' | 'error'
  retries: number
}

export function extractImageUrls(html: string): string[] {
  const imgRegex = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  const urls = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = imgRegex.exec(html)) !== null) {
    if (m[1] && m[1].trim() && m[1].includes('//')) urls.add(m[1].trim())
  }
  return [...urls]
}

export function createComicImages(urls: string[]): ComicImage[] {
  return urls.map((url) => ({
    url,
    data: '',
    directUrl: '',
    status: 'loading' as const,
    retries: 3,
  }))
}
