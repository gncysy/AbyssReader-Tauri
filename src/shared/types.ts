// ============================================
// 共享类型定义 — 完全对齐 legado
// ============================================

export interface Book {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  latestChapterTitle?: string | null
  tocUrl?: string | null
  origin?: string
  originName?: string
  originOrder?: number
  group?: number
  order?: number
  type?: number
  canUpdate?: boolean
  durChapterIndex?: number
  durChapterPos?: number
  durChapterTime?: number
  durChapterTitle?: string
  lastCheckCount?: number
  lastCheckTime?: number
  latestChapterTime?: number
  totalChapterNum?: number
  wordCount?: string
  readConfig?: any
  variable?: string
  syncTime?: number
}

export interface Chapter {
  id: number
  title: string
  url: string
  index: number
  isVip?: boolean
  isPay?: boolean
  content?: string | null
  updateTime?: string
  _deferredJs?: string
  _deferredResult?: any
}

export interface ReadingProgress {
  bookUrl: string
  chapterId: number
  chapterTitle: string
  scrollPercent: number
  updatedAt: string
}

export interface SearchRule {
  bookList?: string | null
  name?: string | null
  author?: string | null
  bookUrl?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  checkKeyWord?: string | null
}

export interface BookInfoRule {
  init?: string | null
  name?: string | null
  author?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  tocUrl?: string | null
  wordCount?: string | null
}

export interface TocRule {
  preUpdateJs?: string | null
  chapterList?: string | null
  chapterName?: string | null
  chapterUrl?: string | null
  formatJs?: string | null
  isVolume?: string | null
  isVip?: string | null
  isPay?: string | null
  updateTime?: string | null
  nextTocUrl?: string | null
}

export interface ContentRule {
  content?: string | null
  subContent?: string | null
  title?: string | null
  nextContentUrl?: string | null
  webJs?: string | null
  sourceRegex?: string | null
  replaceRegex?: string | null
  imageStyle?: string | null
  imageDecode?: string | null
  payAction?: string | null
  callBackJs?: string | null
}

export interface ExploreRule {
  bookList?: string | null
  name?: string | null
  author?: string | null
  bookUrl?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  updateTime?: string | null
}

export interface BookSource {
  bookSourceName: string
  bookSourceUrl: string
  bookSourceGroup?: string | null
  bookSourceComment?: string | null
  bookSourceType?: number
  searchUrl?: string
  ruleSearch?: SearchRule
  ruleBookInfo?: BookInfoRule
  ruleToc?: TocRule
  ruleContent?: ContentRule
  ruleExplore?: ExploreRule | null
  exploreUrl?: string | null
  header?: string | null
  enabled: boolean
  enabledCookieJar?: boolean
  enabledExplore?: boolean
  weight?: number
  customOrder?: number
  concurrentRate?: string | null
  jsLib?: string | null
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  respondTime?: number
  lastUpdateTime?: number
  bookUrlPattern?: string | null
  customButton?: boolean
  eventListener?: boolean
  code?: string | null
  callBackJs?: string | null
  [key: string]: any
}

// ============================================
// 替换规则 — 完全对齐 Legado ReplaceRule
// ============================================
export interface ReplaceRule {
  id: number
  name: string
  group?: string | null
  pattern: string
  replacement: string
  scope?: string | null
  scopeTitle: boolean
  scopeContent: boolean
  excludeScope?: string | null
  isEnabled: boolean
  isRegex: boolean
  timeoutMillisecond: number
  order: number
}

// ─── 订阅源（完全对齐 Legado） ───
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
