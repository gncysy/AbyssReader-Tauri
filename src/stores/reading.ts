import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/services'

export const useReadingStore = defineStore('reading', () => {
  const theme = ref('dark')
  const loaded = ref(false)

  async function loadSettings(): Promise<void> {
    try {
      const settings = await store.get('appSettings')
      if (settings) {
        theme.value = settings.theme || 'dark'
      }
    } catch {
      // ignore
    }
    loaded.value = true
  }

  async function saveSettings(): Promise<void> {
    await store.set('appSettings', {
      theme: theme.value,
    })
  }

  function setTheme(val: string): void { theme.value = val; saveSettings() }

  return {
    theme, loaded,
    loadSettings, saveSettings,
    setTheme,
  }
})
