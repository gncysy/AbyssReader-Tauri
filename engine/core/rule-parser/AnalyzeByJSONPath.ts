import jsonpath from 'jsonpath'
import { RuleAnalyzer } from './RuleAnalyzer.js'

export class AnalyzeByJSONPath {
  private data: any

  constructor(content: any) {
    if (typeof content === 'string') { try { this.data = JSON.parse(content) } catch { this.data = content } }
    else { this.data = content }
  }

  getString(rule: string, resolver?: (inner: string) => string): string | null {
    if (!rule) return null
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||')
    if (rules.length === 1) {
      ruleAnalyzer.reSetPos()
      let processed = ruleAnalyzer.innerRule('{$.', 1, 1, (inner) => {
        return resolver ? resolver(inner) : this.getString(inner, resolver) || ''
      })
      if (!processed) {
        try {
          const ob = this.data
          const val = jsonpath.query(ob, rule)
          return Array.isArray(val) ? val.map(String).join('\n') : String(val)
        } catch { return null }
      }
      return processed
    }
    const textList: string[] = []
    for (const rl of rules) {
      const temp = this.getString(rl, resolver)
      if (temp) { textList.push(temp); if (ruleAnalyzer.elementsType === '||') break }
    }
    return textList.join('\n') || null
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')
    if (rules.length === 1) {
      ruleAnalyzer.reSetPos()
      let processed = ruleAnalyzer.innerRule('{$.', 1, 1, (inner) => this.getString(inner) || '')
      if (!processed) {
        try {
          const val = jsonpath.query(this.data, rule)
          return Array.isArray(val) ? val.map(String) : [String(val)]
        } catch { return [] }
      }
      return [processed]
    }
    const results: string[][] = []
    for (const rl of rules) {
      const temp = this.getStringList(rl)
      if (temp.length > 0) { results.push(temp); if (ruleAnalyzer.elementsType === '||') break }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []; const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) for (const r of results) { if (i < r.length) merged.push(r[i]) }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  getObject(rule: string): any {
    try { return jsonpath.query(this.data, rule) } catch { return null }
  }

  getList(rule: string): any[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')
    if (rules.length === 1) {
      try { return jsonpath.query(this.data, rules[0]) || [] } catch { return [] }
    }
    const results: any[][] = []
    for (const rl of rules) {
      const temp = this.getList(rl)
      if (temp.length > 0) { results.push(temp); if (ruleAnalyzer.elementsType === '||') break }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: any[] = []; const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) for (const r of results) { if (i < r.length) merged.push(r[i]) }
      return merged
    }
    return ([] as any[]).concat(...results)
  }
}
