// ============================================
// useNaiveTheme — Naive UI 主题跟随系统阅读主题
// 用于 Teleport 弹窗组件（Reader, BookDetail 等）
// ============================================

import { computed } from 'vue'
import { darkTheme, lightTheme } from 'naive-ui'
import { useReadingStore } from '@/stores/reading.js'
import { BRAND_COLORS } from '@/constants/theme.js'
import type { GlobalThemeOverrides } from 'naive-ui'

export function useNaiveTheme() {
  const readingStore = useReadingStore()

  const effectiveTheme = computed(() => {
    const t = readingStore.theme
    if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return t
  })

  const naiveTheme = computed(() => {
    const t = effectiveTheme.value
    if (t === 'sepia') {
      return lightTheme
    }
    return t === 'dark' ? darkTheme : lightTheme
  })

  const themeOverrides = computed<GlobalThemeOverrides>(() => {
    const isSepia = effectiveTheme.value === 'sepia'
    if (!isSepia) {
      return {
        common: {
          primaryColor: BRAND_COLORS.primary,
          primaryColorHover: BRAND_COLORS.hover,
          primaryColorPressed: BRAND_COLORS.pressed,
          primaryColorSuppl: BRAND_COLORS.suppl,
        },
      }
    }
    return {
      common: {
        primaryColor: BRAND_COLORS.primary,
        primaryColorHover: BRAND_COLORS.hover,
        primaryColorPressed: BRAND_COLORS.pressed,
        primaryColorSuppl: BRAND_COLORS.suppl,
        bodyColor: '#f4ecd8',
        cardColor: '#faf5e8',
        modalColor: '#faf5e8',
        popoverColor: '#faf5e8',
        textColorBase: '#3d2b1f',
        textColor1: '#3d2b1f',
        textColor2: '#6b5540',
        textColor3: '#8a7560',
        borderColor: 'rgba(139,119,80,0.15)',
        dividerColor: 'rgba(139,119,80,0.1)',
        actionColor: 'rgba(139,119,80,0.06)',
        inputColor: '#faf5e8',
        inputColorDisabled: 'rgba(139,119,80,0.06)',
        tableHeaderColor: 'rgba(139,119,80,0.04)',
        hoverColor: 'rgba(139,119,80,0.06)',
        pressedColor: 'rgba(139,119,80,0.1)',
        closeColor: '#8a7560',
        closeColorHover: '#6b5540',
        closeColorPressed: '#3d2b1f',
      },
    }
  })

  return { naiveTheme, themeOverrides }
}
