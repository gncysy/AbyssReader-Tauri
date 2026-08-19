// ============================================
// UI 常量 — z-index 层级、尺寸、动画等
// ============================================

// ─── z-index 层级（从低到高） ───

export const Z_INDEX = {
  // 基础层 (0-99)
  BASE: 0,
  DROPDOWN: 10,

  // 弹窗层 (100-999)
  MODAL: 100,
  TOAST: 200,
  TOOLTIP: 300,

  // 覆盖层 (1000-4999)
  OVERLAY: 1000,          // BookDetail 等半透明背景
  POPUP: 2000,            // TocPopup, ReaderSettings
  FULLSCREEN: 9999,       // Reader, PhotoViewer, DebugPanel

  // 最高层 (50000+)
  CONTEXT_MENU: 50000,    // 右键菜单
  DICT_PANEL: 50001,      // 字典弹窗（在 ContextMenu 之上）
} as const

// ─── 尺寸常量 ───

export const UI = {
  TITLEBAR_HEIGHT: 40,
  SIDEBAR_WIDTH: 200,
  CONTROL_HEIGHT: 38,
  MIN_WINDOW_WIDTH: 800,
  MIN_WINDOW_HEIGHT: 600,
} as const

// ─── 动画时长 ───

export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 280,
  SLOW: 400,
  CONTROLS_HIDE: 3000,
} as const

// ─── 间距体系 ───

export const SPACING = {
  XS: 4,
  SM: 8,
  MD: 12,
  LG: 16,
  XL: 24,
  XXL: 32,
} as const
