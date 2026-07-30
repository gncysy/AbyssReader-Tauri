import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/api'
import type { ReplaceRule } from '@shared/types'

export const useReplaceRuleStore = defineStore('replaceRules', () => {
  const rules = ref<ReplaceRule[]>([])

  async function loadRules() {
    try { rules.value = (await store.get('replaceRule')) || [] } catch {}
  }

  async function saveRules() {
    await store.set('replaceRule', JSON.parse(JSON.stringify(rules.value)))
  }

  async function addRule(rule: ReplaceRule) { rules.value.push(rule); await saveRules() }
  async function updateRule(id: string, updates: Partial<ReplaceRule>) {
    const idx = rules.value.findIndex(r => r.id === id)
    if (idx !== -1) { rules.value[idx] = { ...rules.value[idx], ...updates }; await saveRules() }
  }
  async function removeRule(id: string) { rules.value = rules.value.filter(r => r.id !== id); await saveRules() }
  async function toggleRule(id: string) {
    const idx = rules.value.findIndex(r => r.id === id)
    if (idx !== -1) { rules.value[idx].isEnabled = !rules.value[idx].isEnabled; await saveRules() }
  }

  return { rules, loadRules, addRule, updateRule, removeRule, toggleRule }
})
