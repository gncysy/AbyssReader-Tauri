// ============================================
// JSONPath 解析器 — 对齐 Legado AnalyzeByJSonPath
// ============================================

import jsonpath from 'jsonpath'
import { RuleAnalyzer } from '../rule-analyzer.js'

export class AnalyzeByJSONPath {
  private data: unknown

  constructor(content: unknown) {
    if (typeof content === 'string') {
      try {
        this.data = JSON.parse(content)
      } catch {
        // 非 JSON 字符串，包装为 { result: content }
        this.data = { result: content }
      }
    } else if (content === null || content === undefined) {
      this.data = {}
    } else if (typeof content === 'object') {
      this.data = content
    } else {
      // 数字/布尔等其他类型，包装为 { result: content }
      this.data = { result: content }
    }
  }

  getString(rule: string, resolver?: (inner: string) => string): string | null {
    if (!rule) return null

    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||')

    if (rules.length === 1) {
      ruleAnalyzer.reSetPos()
      const processed = ruleAnalyzer.innerRule('{$.', 1, 1, (inner) => {
        return resolver ? resolver(inner) : (this.getString(inner, resolver) || '')
      })
      if (!processed) {
        try {
          const val = jsonpath.query(this.data as object, rule)
          if (Array.isArray(val)) {
            if (val.length === 1 && Array.isArray(val[0])) {
              return val[0].map((v) => String(v)).join('\n')
            }
            return val.map((v) => String(v)).join('\n')
          }
          return String(val)
        } catch {
          return null
        }
      }
      return processed
    }

    const textList: string[] = []
    for (const rl of rules) {
      const temp = this.getString(rl, resolver)
      if (temp) {
        textList.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      }
    }
    return textList.join('\n') || null
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')

    if (rules.length === 1) {
      ruleAnalyzer.reSetPos()
      const processed = ruleAnalyzer.innerRule('{$.', 1, 1, (inner) => this.getString(inner) || '')
      if (!processed) {
        try {
          const val = jsonpath.query(this.data as object, rule)
          if (Array.isArray(val)) {
            if (val.length === 1 && Array.isArray(val[0])) {
              return val[0].map((v) => String(v))
            }
            return val.map((v) => String(v))
          }
          return [String(val)]
        } catch {
          return []
        }
      }
      return [processed]
    }

    const results: string[][] = []
    for (const rl of rules) {
      const temp = this.getStringList(rl)
      if (temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []
      const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) {
        for (const r of results) {
          if (i < r.length) merged.push(r[i])
        }
      }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  getObject(rule: string): unknown {
    try {
      return jsonpath.query(this.data as object, rule)
    } catch {
      return null
    }
  }

  getList(rule: string): any[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')

    if (rules.length === 1) {
      try {
        const result = jsonpath.query(this.data as object, rules[0])
        if (Array.isArray(result)) {
          if (result.length === 1 && Array.isArray(result[0])) {
            return result[0]
          }
          return result
        }
        return result ? [result] : []
      } catch {
        return []
      }
    }

    const results: any[][] = []
    for (const rl of rules) {
      const temp = this.getList(rl)
      if (temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: any[] = []
      const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) {
        for (const r of results) {
          if (i < r.length && r[i] !== null && r[i] !== undefined) merged.push(r[i])
        }
      }
      return merged
    }
    return ([] as any[]).concat(...results)
  }
}
