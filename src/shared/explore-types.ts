// ============================================
// 发现页类型 - 对齐 Legado ExploreKind
// ============================================

export interface FlexChildStyle {
  layout_flexGrow?: number
  layout_flexShrink?: number
  layout_alignSelf?: 'auto' | 'flex_start' | 'flex_end' | 'center' | 'baseline' | 'stretch'
  layout_flexBasisPercent?: number
  layout_wrapBefore?: boolean
  layout_justifySelf?: 'auto' | 'flex_start' | 'flex_end' | 'center'
}

export interface ExploreKind {
  title: string
  url?: string | null
  type: 'url' | 'text' | 'button' | 'toggle' | 'select'
  action?: string | null
  chars?: string[] | null
  default?: string | null
  viewName?: string | null
  style?: FlexChildStyle | null
}

export function isExploreKind(item: any): item is ExploreKind {
  return item && typeof item.title === 'string' && typeof item.type === 'string'
}

export const EXPLORE_TYPE = {
  URL: 'url',
  TEXT: 'text',
  BUTTON: 'button',
  TOGGLE: 'toggle',
  SELECT: 'select',
} as const

export type ExploreType = typeof EXPLORE_TYPE[keyof typeof EXPLORE_TYPE]
