// ============================================
// InfoMap - 对齐 Legado InfoMap
// 存储发现页 select/toggle/text 的状态
// ============================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface InfoMapEntry {
  data: Record<string, string>
  needSave: boolean
  saveTime: number
}

export const useInfoMapStore = defineStore('infoMap', () => {
  const maps = ref<Record<string, InfoMapEntry>>({})

  // 获取或创建 InfoMap
  function getMap(sourceUrl: string): InfoMapEntry {
    if (!maps.value[sourceUrl]) {
      // 从 localStorage 恢复
      let savedData: Record<string, string> = {}
      try {
        const raw = localStorage.getItem(`infoMap_${sourceUrl}`)
        if (raw) {
          savedData = JSON.parse(raw)
        }
      } catch {}
      maps.value[sourceUrl] = {
        data: savedData,
        needSave: false,
        saveTime: 0,
      }
    }
    return maps.value[sourceUrl]
  }

  // 获取值
  function get(sourceUrl: string, key: string): string {
    const map = getMap(sourceUrl)
    return map.data[key] || ''
  }

  // 设置值
  function set(sourceUrl: string, key: string, value: string, saveTime: number = 0): void {
    const map = getMap(sourceUrl)
    map.data[key] = value
    map.needSave = true
    map.saveTime = saveTime
    // 自动保存（延迟）
    if (saveTime === 0) {
      saveNow(sourceUrl)
    } else {
      // 延迟保存
      const timerKey = `infoMap_save_${sourceUrl}`
      const existing = (window as any)[timerKey]
      if (existing) {
        clearTimeout(existing)
      }
      ;(window as any)[timerKey] = setTimeout(() => {
        saveNow(sourceUrl)
        delete (window as any)[timerKey]
      }, saveTime * 1000)
    }
  }

  // 立即保存
  function saveNow(sourceUrl: string): void {
    const map = maps.value[sourceUrl]
    if (!map) return
    if (!map.needSave) return
    try {
      localStorage.setItem(`infoMap_${sourceUrl}`, JSON.stringify(map.data))
      map.needSave = false
    } catch {}
  }

  // 批量保存所有
  function saveAll(): void {
    for (const key of Object.keys(maps.value)) {
      saveNow(key)
    }
  }

  // 清除
  function clear(sourceUrl: string): void {
    delete maps.value[sourceUrl]
    try {
      localStorage.removeItem(`infoMap_${sourceUrl}`)
    } catch {}
  }

  return {
    maps,
    getMap,
    get,
    set,
    saveNow,
    saveAll,
    clear,
  }
})
