// ============================================
// RuleParser — 规则字符串解析（对齐 Legado AppPattern）
// ============================================

import { SourceRule } from './source-rule.js'
import type { RuleMode } from '../types.js'

// 对齐 Legado AppPattern.JS_PATTERN
const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi

// 对齐 Legado AppPattern.WebJS_PATTERN
const WebJS_PATTERN = /@webjs:([\s\S]{5,})/gi

export class RuleParser {
  private isJSONFlag: boolean
  private isRegexFlag: boolean

  constructor(isJSON = false, isRegex = false) {
    this.isJSONFlag = isJSON
    this.isRegexFlag = isRegex
  }

  set isJSON(value: boolean) {
    this.isJSONFlag = value
  }

  get isJSON(): boolean {
    return this.isJSONFlag
  }

  isJsonString(str: string): boolean {
    try {
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }

  isHtmlString(str: string): boolean {
    return /^\s*</.test(str)
  }

  splitSourceRuleCacheString(ruleStr: string, ruleCache: Map<string, SourceRule[]>): SourceRule[] {
    if (!ruleStr) return []
    const cached = ruleCache.get(ruleStr)
    if (cached) return cached.map((sr) => sr.cloneForExecution())
    const rules = this.splitSourceRule(ruleStr)
    ruleCache.set(ruleStr, rules)
    return rules
  }

  splitSourceRule(ruleStr: string, allInOne = false): SourceRule[] {
    if (!ruleStr) return []
    const ruleList: SourceRule[] = []
    let mMode: RuleMode = 'default'
    let start = 0

    if (allInOne && ruleStr.startsWith(':')) {
      mMode = 'regex'
      this.isRegexFlag = true
      start = 1
    } else if (this.isRegexFlag) {
      mMode = 'regex'
    }

    const jsMatcher = new RegExp(JS_PATTERN.source, 'gi')
    let jsMatch: RegExpExecArray | null
    while ((jsMatch = jsMatcher.exec(ruleStr)) !== null) {
      if (jsMatch.index > start) {
        const tmp = ruleStr.substring(start, jsMatch.index).trim()
        if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSONFlag))
      }
      const jsCode = (jsMatch[2] !== undefined ? jsMatch[2] : jsMatch[1]) ?? ''
      ruleList.push(new SourceRule(jsCode, 'js', this.isJSONFlag))
      start = jsMatch.index + jsMatch[0].length
    }

    const webJsMatcher = new RegExp(WebJS_PATTERN.source, 'gi')
    let webMatch: RegExpExecArray | null
    while ((webMatch = webJsMatcher.exec(ruleStr)) !== null) {
      if (webMatch.index > start) {
        const tmp = ruleStr.substring(start, webMatch.index).trim()
        if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSONFlag))
      }
      ruleList.push(new SourceRule(webMatch[1] || '', 'webjs', this.isJSONFlag))
      start = webMatch.index + webMatch[0].length
    }

    if (ruleStr.length > start) {
      const tmp = ruleStr.substring(start).trim()
      if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSONFlag))
    }

    return ruleList
  }

  detectMode(ruleStr: string): RuleMode {
    const lower = ruleStr.toLowerCase()
    if (lower.startsWith('@css:')) return 'default'
    if (lower.startsWith('@xpath:')) return 'xpath'
    if (lower.startsWith('@json:')) return 'json'
    if (ruleStr.startsWith('$.')) return 'json'
    if (ruleStr.startsWith('/')) return 'xpath'
    if (ruleStr.includes('@js:') || ruleStr.includes('<js>')) return 'js'
    if (ruleStr.includes('@webjs:') || ruleStr.includes('<webjs>')) return 'webjs'
    return 'default'
  }
}
