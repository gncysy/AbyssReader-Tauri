// ============================================
// 发现页分类 — 纯函数
// ============================================

import type { EngineBookSource } from '../../types.js'

export interface ExploreKind {
  title: string
  url?: string | null
  type: 'url' | 'text' | 'button' | 'toggle' | 'select'
  action?: string | null
  chars?: string[] | null
  default?: string | null
  viewName?: string | null
  style?: {
    layout_flexGrow?: number
    layout_flexShrink?: number
    layout_alignSelf?: string
    layout_flexBasisPercent?: number
    layout_wrapBefore?: boolean
    layout_justifySelf?: string
  } | null
}

export function getExploreCategories(source: EngineBookSource): ExploreKind[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    return []
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          title: item.title || item.name || '未命名',
          url: item.url || item.value || null,
          type: item.type || 'url',
          action: item.action || null,
          chars: item.chars || null,
          default: item.default || null,
          viewName: item.viewName || null,
          style: item.style || null,
        }))
      }
    } catch {
      // ignore
    }
  }

  if (trimmed.includes('\n') && trimmed.includes('::')) {
    return trimmed
      .split('\n')
      .filter((line: string) => line.includes('::'))
      .map((line: string) => {
        const parts = line.split('::').map((s: string) => s.trim())
        return { title: parts[0] || '未命名', url: parts[1] || '', type: 'url' as const }
      })
  }

  if (trimmed.includes('::')) {
    const parts = trimmed.split('::').map((s: string) => s.trim())
    if (parts.length >= 2) {
      return [{ title: parts[0] || '未命名', url: parts[1] || '', type: 'url' as const }]
    }
  }

  return []
}
