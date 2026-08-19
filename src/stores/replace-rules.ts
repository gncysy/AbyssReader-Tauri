import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/services'
import type { ReplaceRule } from '@/types'

export const useReplaceRuleStore = defineStore('replaceRules', () => {
  const rules = ref<ReplaceRule[]>([])

  async function loadRules(): Promise<void> {
    try {
      const raw = await store.get('replaceRule')
      rules.value = Array.isArray(raw) ? raw : []
    } catch {
      rules.value = []
    }
  }

  async function saveRules(): Promise<void> {
    // 直接引用保存，避免深拷贝开销
    await store.set('replaceRule', [...rules.value])
  }

  async function addRule(rule: ReplaceRule): Promise<void> {
    rules.value = [...rules.value, rule]
    await saveRules()
  }

  async function updateRule(id: number, updates: Partial<ReplaceRule>): Promise<void> {
    const idx = rules.value.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const arr = [...rules.value]
      arr[idx] = { ...arr[idx], ...updates }
      rules.value = arr
      await saveRules()
    }
  }

  async function removeRule(id: number): Promise<void> {
    rules.value = rules.value.filter((r) => r.id !== id)
    await saveRules()
  }

  async function toggleRule(id: number): Promise<void> {
    const idx = rules.value.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const arr = [...rules.value]
      arr[idx] = { ...arr[idx], isEnabled: !arr[idx].isEnabled }
      rules.value = arr
      await saveRules()
    }
  }

  return { rules, loadRules, saveRules, addRule, updateRule, removeRule, toggleRule }
})
