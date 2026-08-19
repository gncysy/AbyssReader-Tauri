// ============================================
// Book 类型 — 对齐 Legado
// ============================================

export interface ReadConfig {
  reverseToc?: boolean
  reSegment?: boolean
  imageStyle?: string | null
  useReplaceRule?: boolean | null
  delTag?: number
  ttsEngine?: string | null
  splitLongChapter?: boolean
  readSimulating?: boolean
  dailyChapters?: number
  openCredits?: number
  closeCredits?: number
  playMode?: number
  playSpeed?: number
  [key: string]: any
}

export interface Book {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string | null
  customCoverUrl?: string | null
  intro?: string | null
  customIntro?: string | null
  kind?: string | null
  customTag?: string | null
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
  durVolumeIndex?: number
  chapterInVolumeIndex?: number
  lastCheckCount?: number
  lastCheckTime?: number
  latestChapterTime?: number
  totalChapterNum?: number
  wordCount?: string
  readConfig?: ReadConfig | null
  variable?: string
  syncTime?: number
  charset?: string | null
  [key: string]: any
}
