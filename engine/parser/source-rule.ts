// ============================================
// SourceRule — 单个规则对象（对齐 Legado）
// ============================================

import type { RuleMode } from '../types.js'

const EVAL_PATTERN = /@get:\{[^}]+\}|\{\{[\w\W]*?\}\}/gi
const REGEX_PATTERN = /\$\d{1,2}/g
const PUT_PATTERN = /@put:\{([^}]+?)\}/gi

// 对齐 Legado AppPattern.JS_PATTERN
const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi

const GET_RULE_TYPE = -2
const JS_RULE_TYPE = -1
const DEFAULT_RULE_TYPE = 0

type PutMap = Record<string, string>

export class SourceRule {
  rule: string
  mode: RuleMode
  replaceRegex = ''
  replacement = ''
  replaceFirst = false
  putMap: PutMap = {}

  private ruleParam: string[] = []
  private ruleType: number[] = []
  private jsCode: string | null = null
  private prefixRule: string | null = null

  constructor(ruleStr: string, mode: RuleMode = 'default', isJSON = false) {
    const jsMatch = ruleStr.match(JS_PATTERN)
    if (jsMatch && (mode === 'default' || mode === 'js')) {
      this.jsCode = (jsMatch[2] || jsMatch[1] || '').trim()
      const jsIndex = ruleStr.search(/@js:|<js>/)
      if (jsIndex > 0) {
        this.prefixRule = ruleStr.substring(0, jsIndex).trim()
      }
      if (this.jsCode) {
        mode = 'js'
      }
    }

    if (mode === 'js' || mode === 'regex') {
      this.rule = ruleStr
    } else if (ruleStr.toLowerCase().startsWith('@css:')) {
      mode = 'default'
      this.rule = ruleStr
    } else if (ruleStr.startsWith('@@')) {
      mode = 'default'
      this.rule = ruleStr.substring(2)
    } else if (ruleStr.toLowerCase().startsWith('@xpath:')) {
      mode = 'xpath'
      this.rule = ruleStr.substring(7)
    } else if (ruleStr.toLowerCase().startsWith('@json:')) {
      mode = 'json'
      this.rule = ruleStr.substring(6)
    } else if (isJSON || ruleStr.startsWith('$.') || ruleStr.startsWith('$[')) {
      mode = 'json'
      this.rule = ruleStr
    } else if (ruleStr.startsWith('/')) {
      mode = 'xpath'
      this.rule = ruleStr
    } else {
      this.rule = ruleStr
    }

    this.mode = mode
    this.rule = this.splitPutRule(this.rule, this.putMap)

    let start = 0
    const evalMatcher = new RegExp(EVAL_PATTERN.source, 'gi')

    if (evalMatcher.test(this.rule)) {
      evalMatcher.lastIndex = 0
      const tmp = this.rule.substring(0, this.rule.search(EVAL_PATTERN))
      if (mode !== 'js' && mode !== 'regex' &&
          (evalMatcher.lastIndex === 0 || !tmp.includes('##'))) {
        mode = 'regex'
        this.mode = mode
      }
      let evalMatch: RegExpExecArray | null
      while ((evalMatch = evalMatcher.exec(this.rule)) !== null) {
        if (evalMatch.index > start) {
          this.splitRegex(this.rule.substring(start, evalMatch.index))
        }
        const matched = evalMatch[0]
        if (matched.toLowerCase().startsWith('@get:')) {
          this.ruleType.push(GET_RULE_TYPE)
          // DIFF-7 修复：正确提取 @get:{key} 中的 key
          const keyMatch = /^@get:\{([^}]+)\}$/.exec(matched)
          this.ruleParam.push(keyMatch ? keyMatch[1] : matched.substring(6))
        } else if (matched.startsWith('{{')) {
          this.ruleType.push(JS_RULE_TYPE)
          this.ruleParam.push(matched.substring(2, matched.length - 2))
        } else {
          this.splitRegex(matched)
        }
        start = evalMatch.index + evalMatch[0].length
      }
    }

    if (this.rule.length > start) {
      this.splitRegex(this.rule.substring(start))
    }
  }

  cloneForExecution(): SourceRule {
    const clone = Object.create(SourceRule.prototype) as SourceRule
    clone.rule = this.rule
    clone.mode = this.mode
    clone.replaceRegex = this.replaceRegex
    clone.replacement = this.replacement
    clone.replaceFirst = this.replaceFirst
    clone.putMap = this.putMap ? { ...this.putMap } : {}
    ;(clone as any).ruleParam = this.ruleParam
    ;(clone as any).ruleType = this.ruleType
    clone.jsCode = this.jsCode
    clone.prefixRule = this.prefixRule
    return clone
  }

  getJsCode(): string | null {
    return this.jsCode
  }

  getPrefixRule(): string | null {
    return this.prefixRule
  }

  getParamSize(): number {
    return this.ruleParam.length
  }

  private splitPutRule(ruleStr: string, putMap: PutMap): string {
    let result = ruleStr
    const putMatcher = new RegExp(PUT_PATTERN.source, 'gi')
    let match: RegExpExecArray | null
    while ((match = putMatcher.exec(ruleStr)) !== null) {
      result = result.replace(match[0], '')
      try {
        Object.assign(putMap, JSON.parse(match[1]))
      } catch {
        try {
          Object.assign(putMap, JSON.parse(match[1].replace(/'/g, '"')))
        } catch {
          // 非标准 JSON，忽略
        }
      }
    }
    return result
  }

  private splitRegex(ruleStr: string): void {
    if (!ruleStr) return
    let start = 0
    const parts = ruleStr.split('##')
    const regexMatcher = new RegExp(REGEX_PATTERN.source, 'g')

    if (parts[0] && regexMatcher.test(parts[0])) {
      regexMatcher.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regexMatcher.exec(parts[0])) !== null) {
        if (match.index > start) {
          this.ruleType.push(DEFAULT_RULE_TYPE)
          this.ruleParam.push(parts[0].substring(start, match.index))
        }
        this.ruleType.push(parseInt(match[0].substring(1)))
        this.ruleParam.push(match[0])
        start = match.index + match[0].length
      }
    }
    if (parts[0] && parts[0].length > start) {
      this.ruleType.push(DEFAULT_RULE_TYPE)
      this.ruleParam.push(parts[0].substring(start))
    }
    if (parts.length > 1) this.replaceRegex = parts[1]
    if (parts.length > 2) this.replacement = parts[2]
    if (parts.length > 3) this.replaceFirst = true
  }

  async makeUpRule(
    result: any,
    evalJS: (js: string, res: any) => Promise<any>,
    get: (key: string) => string,
    getString: (rule: string) => Promise<string>,
  ): Promise<void> {
    if (this.jsCode && this.prefixRule !== null) {
      try {
        let prefixValue = this.prefixRule
        if (prefixValue && !prefixValue.startsWith('@')) {
          if (result && typeof result === 'object' && result[prefixValue] !== undefined) {
            prefixValue = String(result[prefixValue])
          }
        }
        const jsResult = await evalJS(this.jsCode, result)
        const jsStr = jsResult !== null && jsResult !== undefined ? String(jsResult) : ''
        this.rule = prefixValue + jsStr
        this.mode = 'default'
        return
      } catch {
        this.mode = 'default'
      }
    }

    if (this.ruleParam.length === 0) return

    const infoVal: string[] = []
    let index = this.ruleParam.length
    while (index-- > 0) {
      const regType = this.ruleType[index]
      if (regType > DEFAULT_RULE_TYPE) {
        if (Array.isArray(result) && result.length > regType) {
          infoVal.unshift(result[regType]?.toString() || '')
        } else {
          infoVal.unshift(this.ruleParam[index])
        }
      } else if (regType === JS_RULE_TYPE) {
        if (this.isRule(this.ruleParam[index])) {
          infoVal.unshift(await getString(this.ruleParam[index]))
        } else {
          const jsEval: any = await evalJS(this.ruleParam[index], result)
          if (jsEval !== null && jsEval !== undefined) {
            if (typeof jsEval === 'string') {
              infoVal.unshift(jsEval)
            } else if (typeof jsEval === 'number' && Number.isInteger(jsEval)) {
              infoVal.unshift(String(jsEval))
            } else {
              infoVal.unshift(String(jsEval))
            }
          }
        }
      } else if (regType === GET_RULE_TYPE) {
        infoVal.unshift(get(this.ruleParam[index]))
      } else {
        infoVal.unshift(this.ruleParam[index])
      }
    }
    this.rule = infoVal.join('')

    const ruleStrS = this.rule.split('##')
    this.rule = ruleStrS[0].trim()
    if (ruleStrS.length > 1) this.replaceRegex = ruleStrS[1]
    if (ruleStrS.length > 2) this.replacement = ruleStrS[2]
    if (ruleStrS.length > 3) this.replaceFirst = true
  }

  private isRule(ruleStr: string): boolean {
    return ruleStr.startsWith('@') ||
      ruleStr.startsWith('$.') ||
      ruleStr.startsWith('$[') ||
      ruleStr.startsWith('//')
  }
}
