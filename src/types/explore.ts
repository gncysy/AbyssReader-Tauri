// ============================================
// 发现页类型
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
