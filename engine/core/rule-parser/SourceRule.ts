import type { RuleMode, PutMap } from '../../../src/shared/rss-rule-types.js'

const EVAL_PATTERN = /@get:\{[^}]+\}|\{\{[^}]*\}\}/gi
const REGEX_PATTERN = /\$\d{1,2}/g
const PUT_PATTERN = /@put:\{([^}]+?)\}/gi

const GET_RULE_TYPE = -2
const JS_RULE_TYPE = -1
const DEFAULT_RULE_TYPE = 0

export class SourceRule {
  rule: string
  mode: RuleMode
  replaceRegex: string = ''
  replacement: string = ''
  replaceFirst: boolean = false
  putMap: PutMap = {}

  private ruleParam: string[] = []
  private ruleType: number[] = []

  constructor(ruleStr: string, mode: RuleMode = 'default', isJSON: boolean = false) {
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
      if (mode !== 'js' && mode !== 'regex' && !this.rule.includes('##')) {
        mode = 'regex'
        this.mode = mode
      }
      let evalMatch
      while ((evalMatch = evalMatcher.exec(this.rule)) !== null) {
        if (evalMatch.index > start) {
          this.splitRegex(this.rule.substring(start, evalMatch.index))
        }
        const tmp = evalMatch[0]
        if (tmp.toLowerCase().startsWith('@get:')) {
          this.ruleType.push(GET_RULE_TYPE)
          this.ruleParam.push(tmp.substring(6, tmp.length - 1))
        } else if (tmp.startsWith('{{')) {
          let inner = tmp.substring(2, tmp.length - 2)
          if (inner.startsWith('@@')) {
            inner = inner.substring(2)
            this.ruleType.push(DEFAULT_RULE_TYPE)
            this.ruleParam.push(inner)
          } else {
            this.ruleType.push(JS_RULE_TYPE)
            this.ruleParam.push(inner)
          }
        } else {
          this.splitRegex(tmp)
        }
        start = evalMatch.index + evalMatch[0].length
      }
    }

    if (this.rule.length > start) {
      this.splitRegex(this.rule.substring(start))
    }
  }

  // 创建可安全修改的副本——直接从缓存原型复制，不重新走构造函数
  cloneForExecution(): SourceRule {
    const clone = Object.create(SourceRule.prototype) as SourceRule
    clone.rule = this.rule
    clone.mode = this.mode
    clone.replaceRegex = this.replaceRegex
    clone.replacement = this.replacement
    clone.replaceFirst = this.replaceFirst
    clone.putMap = this.putMap ? { ...this.putMap } : {}
    // ruleParam/ruleType 由构造函数生成，makeUpRule 只消费不修改，无需复制
    ;(clone as any).ruleParam = this.ruleParam
    ;(clone as any).ruleType = this.ruleType
    return clone
  }

  private splitPutRule(ruleStr: string, putMap: PutMap): string {
    let result = ruleStr
    const putMatcher = new RegExp(PUT_PATTERN.source, 'gi')
    let match
    while ((match = putMatcher.exec(ruleStr)) !== null) {
      result = result.replace(match[0], '')
      try { Object.assign(putMap, JSON.parse(match[1])) } catch {
        try { Object.assign(putMap, JSON.parse(match[1].replace(/'/g, '"'))) } catch {}
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
      let match
      while ((match = regexMatcher.exec(parts[0])) !== null) {
        if (match.index > start) {
          this.ruleType.push(DEFAULT_RULE_TYPE)
          this.ruleParam.push(parts[0].substring(start, match.index))
        }
        const tmp = match[0]
        this.ruleType.push(parseInt(tmp.substring(1)))
        this.ruleParam.push(tmp)
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
    getString: (rule: string) => Promise<string>
  ): Promise<void> {
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
        if (this.ruleParam[index].startsWith('@') || this.ruleParam[index].startsWith('$.') || this.ruleParam[index].startsWith('//')) {
          infoVal.unshift(await getString(this.ruleParam[index]))
        } else {
          const jsEval = await evalJS(this.ruleParam[index], result)
          infoVal.unshift(jsEval !== null && jsEval !== undefined ? String(jsEval) : '')
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
}