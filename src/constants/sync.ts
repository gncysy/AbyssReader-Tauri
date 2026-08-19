// ============================================
// 同步 & 数据键名
// ============================================

export const SYNC_KEYS = [
  'bookshelf',
  'bookSource',
  'readingProgress',
  'replaceRule',
  'bookGroup',
  'txtTocRule',
  'dictRule',
  'keyboardAssists',
  'rssSources',
] as const

export const STORE_KEYS = {
  BOOK_SOURCE: 'bookSource',
  BOOKSHELF: 'bookshelf',
  READING_PROGRESS: 'readingProgress',
  REPLACE_RULE: 'replaceRule',
  BOOK_GROUP: 'bookGroup',
  TXT_TOC_RULE: 'txtTocRule',
  DICT_RULE: 'dictRule',
  RSS_SOURCES: 'rssSources',
  SETTINGS: 'settings',
  USER_AGENT: 'userAgent',
  WEBDAV_CONFIG: 'webdavConfig',
  CACHE_CONFIG: 'cacheConfig',
} as const
