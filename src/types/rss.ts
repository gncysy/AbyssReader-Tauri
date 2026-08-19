// ============================================
// RSS 类型
// ============================================

export interface RssSource {
  sourceName: string
  sourceUrl: string
  sourceIcon?: string | null
  sourceGroup?: string | null
  sourceComment?: string | null
  variableComment?: string | null
  enabled: boolean
  enabledCookieJar?: boolean
  singleUrl?: boolean
  enableJs?: boolean
  loadWithBaseUrl?: boolean
  showWebLog?: boolean
  preload?: boolean
  cacheFirst?: boolean
  sortUrl?: string | null
  customOrder?: number
  ruleArticles?: string | null
  ruleNextPage?: string | null
  ruleTitle?: string | null
  rulePubDate?: string | null
  ruleDescription?: string | null
  ruleImage?: string | null
  ruleLink?: string | null
  ruleContent?: string | null
  contentWhitelist?: string | null
  contentBlacklist?: string | null
  shouldOverrideUrlLoading?: string | null
  style?: string | null
  injectJs?: string | null
  preloadJs?: string | null
  startHtml?: string | null
  startStyle?: string | null
  startJs?: string | null
  coverDecodeJs?: string | null
  header?: string | null
  concurrentRate?: string | null
  jsLib?: string | null
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  articleStyle?: number
  type?: number
  lastUpdateTime?: number
  searchUrl?: string | null
  [key: string]: any
}

export interface RssArticle {
  title: string
  link: string
  description?: string | null
  image?: string | null
  pubDate?: string | null
  sort?: string
  origin?: string
  read?: boolean
}
