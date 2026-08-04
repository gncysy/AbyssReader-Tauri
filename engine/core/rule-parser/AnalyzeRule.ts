import { AnalyzeByCSS } from './AnalyzeByCSS.js'
import { AnalyzeByXPath } from './AnalyzeByXPath.js'
import { AnalyzeByJSONPath } from './AnalyzeByJSONPath.js'
import { SourceRule } from './SourceRule.js'
import { RuleAnalyzer } from './RuleAnalyzer.js'
import { getResultLast, getResultList, getElementsRecursive } from './ResultExtractor.js'
import { network } from '../../../src/api/index.js'
import type { RuleContext } from '../../../src/shared/rss-rule-types.js'

const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi
const WEBJS_PATTERN = /<webjs>([\s\S]*?)<\/webjs>|@webjs:([^\n]*)/gi

function normalizeCssSelector(expression: string): string {
  return expression
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
    .replace(/@class\.([\w-]+)/g, '.$1')
    .replace(/@id\.([\w-]+)/g, '#$1')
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    .replace(/\btag\.(\w[\w-]*)/g, '$1')
    .replace(/\bid\.([\w-]+)/g, '#$1')
    .replace(/^@+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isDomElement(val: any): boolean {
  return val && typeof val === 'object' && typeof val.querySelectorAll === 'function'
}

function toEffectiveRoot(val: any): Element | null {
  if (isDomElement(val)) return val as Element
  const html = typeof val === 'string' ? val : String(val)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body || doc.documentElement
}

export class AnalyzeRule {
  private content: any
  private baseUrl: string | null = null
  private redirectUrl: string | null = null
  private source: any | null = null
  private isJSON: boolean = false
  private isRegex: boolean = false

  private cssCache = new Map<string, AnalyzeByCSS>()
  private xpathCache = new Map<string, AnalyzeByXPath>()
  private jsonpathCache = new Map<string, AnalyzeByJSONPath>()

  private variableStore: Map<string, string> = new Map()
  private ruleCache = new Map<string, SourceRule[]>()
  private regexCache = new Map<string, RegExp | null>()

  private lastContext: RuleContext | null = null

  constructor(source?: any) { this.source = source || null }

  setContent(content: any, baseUrl?: string): this {
    this.content = content
    this.isJSON = typeof content === 'string' && this.isJsonString(content) && !this.isHtmlString(content)
    if (baseUrl) this.baseUrl = baseUrl
    this.cssCache.clear(); this.xpathCache.clear(); this.jsonpathCache.clear()
    return this
  }

  setBaseUrl(url: string): this { this.baseUrl = url; return this }
  setRedirectUrl(url: string): this { this.redirectUrl = url; return this }

  private isJsonString(str: string): boolean { try { JSON.parse(str); return true } catch { return false } }
  private isHtmlString(str: string): boolean { return /^\s*</.test(str) }

  async getString(ruleStr: string | null, context?: RuleContext): Promise<string> {
    if (!ruleStr) return ''
    this.lastContext = context || null
    return this.getStringInternal(this.splitSourceRuleCacheString(ruleStr), context, (context as any)?.isUrl === true)
  }

  async getStringList(ruleStr: string | null, context?: RuleContext): Promise<string[]> {
    if (!ruleStr) return []
    this.lastContext = context || null
    return this.getStringListInternal(this.splitSourceRuleCacheString(ruleStr), context) || []
  }

  async getElements(ruleStr: string | null, context?: RuleContext): Promise<any[]> {
    if (!ruleStr) return []
    this.lastContext = context || null
    return this.getElementsInternal(this.splitSourceRule(ruleStr, true), context)
  }

  async getElement(ruleStr: string | null, context?: RuleContext): Promise<any | null> {
    const list = await this.getElements(ruleStr, context)
    return list.length > 0 ? list[0] : null
  }

  private async getStringInternal(ruleList: SourceRule[], context?: RuleContext, isUrl: boolean = false): Promise<string> {
    let result: any = context?.result ?? this.content
    for (const sr of ruleList) {
      this.putRule(sr.putMap, context)
      await sr.makeUpRule(result, (js, res) => this.evalJS(js, res, context), (k) => this.get(k), (r) => this.getString(r, context))
      if (result === null || result === undefined) continue
      if (sr.rule || sr.replaceRegex) result = await this.executeRuleForString(sr.rule, result, sr.mode, context, isUrl)
      if (result !== null && sr.replaceRegex) result = this.replaceRegex(String(result), sr)
    }
    if (result === null || result === undefined) return ''
    let str = String(result)
    if (str.indexOf('&') > -1) str = this.unescapeHtml(str)
    if (isUrl) return str ? this.resolveUrl(str) : (this.baseUrl || '')
    return str
  }

  private async executeRuleForString(rule: string, input: any, mode: string, context?: RuleContext, isUrl: boolean = false): Promise<any> {
    if (!rule) return input
    switch (mode) {
      case 'webjs': return this.getWebJsResult(rule, input)
      case 'js': return this.evalJS(rule, input, context)
      case 'json': return this.getJSONPathAnalyzer(input).getString(rule, (inner) => this.getString(inner, context))
      case 'xpath': return this.getXPathAnalyzer(input).getString(rule)
      case 'regex': return rule
      default: return this.executeDefaultForString(rule, input, isUrl)
    }
  }

  private executeDefaultForString(rule: string, input: any, isUrl: boolean = false): string {
    const root = toEffectiveRoot(input)
    if (!root) return ''

    const isCss = rule.toLowerCase().startsWith('@css:')
    const elementsRule = isCss ? rule.substring(5).trim() : rule
    if (!elementsRule) return root.textContent || ''

    const ruleAnalyzer = new RuleAnalyzer(elementsRule)
    const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')
    const results: string[][] = []

    for (const rs of ruleStrS) {
      let temp: string[] | null
      if (isCss) {
        const lastIndex = rs.lastIndexOf('@')
        if (lastIndex > 0) {
          const els = Array.from(root.querySelectorAll(normalizeCssSelector(rs.substring(0, lastIndex))))
          temp = getResultLast(els, rs.substring(lastIndex + 1))
        } else {
          const els = Array.from(root.querySelectorAll(normalizeCssSelector(rs)))
          temp = getResultLast(els, 'text')
        }
      } else {
        temp = getResultList(root, rs)
      }
      if (temp && temp.length > 0) { results.push(temp); if (ruleAnalyzer.elementsType === '||') break }
    }
    if (results.length === 0) return ''

    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []
      const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) for (const r of results) { if (i < r.length) merged.push(r[i]) }
      return isUrl ? (merged[0] || '') : merged.join('\n')
    }
    const merged = ([] as string[]).concat(...results)
    if (isUrl) return merged.length > 0 ? merged[0] : ''
    if (merged.length === 1) return merged[0]
    return merged.join('\n')
  }

  private async getStringListInternal(ruleList: SourceRule[], context?: RuleContext, isUrl: boolean = false): Promise<string[] | null> {
    let result: any = context?.result ?? this.content
    for (const sr of ruleList) {
      this.putRule(sr.putMap, context)
      await sr.makeUpRule(result, (js, res) => this.evalJS(js, res, context), (k) => this.get(k), (r) => this.getString(r, context))
      if (result === null || result === undefined) continue
      result = await this.executeRuleForStringList(result, sr, context)
      if (result !== null && sr.replaceRegex) {
        if (Array.isArray(result)) result = result.map((v: any) => this.replaceRegex(String(v), sr))
        else result = this.replaceRegex(String(result), sr)
      }
    }
    if (result === null || result === undefined) return null
    if (typeof result === 'string') return result.split('\n').filter(Boolean)
    if (Array.isArray(result)) {
      if (isUrl) {
        const urlList: string[] = []
        for (const u of result) { const abs = this.resolveUrl(String(u)); if (abs && !urlList.includes(abs)) urlList.push(abs) }
        return urlList
      }
      return result.map(v => String(v)).filter(Boolean)
    }
    return [String(result)]
  }

  private async executeRuleForStringList(input: any, sr: SourceRule, context?: RuleContext): Promise<any> {
    if (!sr.rule) return input
    switch (sr.mode) {
      case 'webjs': return this.getWebJsResult(sr.rule, input)
      case 'js': return this.evalJS(sr.rule, input, context)
      case 'json': return this.getJSONPathAnalyzer(input).getStringList(sr.rule)
      case 'xpath': return this.getXPathAnalyzer(input).getStringList(sr.rule)
      case 'regex': return [sr.rule]
      default: return this.executeDefaultForStringList(sr.rule, input)
    }
  }

  private executeDefaultForStringList(rule: string, input: any): string[] | null {
    const root = toEffectiveRoot(input)
    if (!root) return null

    const isCss = rule.toLowerCase().startsWith('@css:')
    const elementsRule = isCss ? rule.substring(5).trim() : rule
    if (!elementsRule) return [root.textContent || '']

    const ruleAnalyzer = new RuleAnalyzer(elementsRule)
    const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')
    const results: string[][] = []

    for (const rs of ruleStrS) {
      let temp: string[] | null
      if (isCss) {
        const lastIndex = rs.lastIndexOf('@')
        if (lastIndex > 0) {
          const els = Array.from(root.querySelectorAll(normalizeCssSelector(rs.substring(0, lastIndex))))
          temp = getResultLast(els, rs.substring(lastIndex + 1))
        } else {
          const els = Array.from(root.querySelectorAll(normalizeCssSelector(rs)))
          temp = getResultLast(els, 'text')
        }
      } else {
        temp = getResultList(root, rs)
      }
      if (temp && temp.length > 0) { results.push(temp); if (ruleAnalyzer.elementsType === '||') break }
    }
    if (results.length === 0) return null
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []; const baseLen = results[0].length
      for (let i = 0; i < baseLen; i++) for (const r of results) { if (i < r.length) merged.push(r[i]) }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  private async getElementsInternal(ruleList: SourceRule[], context?: RuleContext): Promise<any[]> {
    let result: any = context?.result ?? this.content
    for (const sr of ruleList) {
      this.putRule(sr.putMap, context)
      await sr.makeUpRule(result, (js, res) => this.evalJS(js, res, context), (k) => this.get(k), (r) => this.getString(r, context))
      if (result === null || result === undefined) continue
      switch (sr.mode) {
        case 'regex': result = this.executeRegexElements(String(result), sr.rule.split(/\s+/).filter(Boolean)); break
        case 'webjs': result = JSON.parse(await this.getWebJsResultAsync(sr.rule, result) || '[]'); break
        case 'js': result = await this.evalJS(sr.rule, result, context); break
        case 'json': result = this.getJSONPathAnalyzer(result).getList(sr.rule); break
        case 'xpath': result = this.getXPathAnalyzer(result).getElements(sr.rule); break
        default: {
          // 修复：使用 getResultList 处理 @ 属性提取语法，对齐 getString 路径
          const html = typeof result === 'string' ? result : String(result)
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const root = doc.body || doc.documentElement
          // 用 getResultList 解析规则，支持 text.xxx@href 等语法
          const stringResults = getResultList(root, sr.rule)
          if (stringResults && stringResults.length > 0) {
            result = stringResults
          } else {
            // 回退到 getElementsRecursive（处理无 @ 的纯元素选择）
            result = getElementsRecursive(root, sr.rule)
          }
        }
      }
    }
    return Array.isArray(result) ? result : (result ? [result] : [])
  }

  private executeRegexList(rule: string, input: string): string[] | null {
    const regs = rule.split(/\s+/).filter(Boolean)
    if (regs.length === 0) return null
    return this.executeRegexGetElements(input, regs, 0).map(r => r.join(''))
  }

  private executeRegexElements(res: string, regs: string[]): any[] {
    return this.executeRegexGetElements(res, regs, 0)
  }

  private executeRegexGetElements(res: string, regs: string[], index: number): string[][] {
    const pattern = this.compileRegex(regs[index])
    if (!pattern) return []
    pattern.lastIndex = 0
    const firstMatch = pattern.exec(res)
    if (!firstMatch) return []
    if (index + 1 === regs.length) {
      const books: string[][] = []
      pattern.lastIndex = 0
      let m
      while ((m = pattern.exec(res)) !== null) {
        const info: string[] = []
        for (let i = 0; i <= m.length; i++) info.push(m[i] || '')
        books.push(info)
        if (pattern.lastIndex === 0) break
      }
      return books
    }
    let combined = ''
    pattern.lastIndex = 0
    let m
    while ((m = pattern.exec(res)) !== null) {
      combined += m[0]
      if (pattern.lastIndex === 0) break
    }
    return this.executeRegexGetElements(combined, regs, index + 1)
  }

  private replaceRegex(result: string, sr: SourceRule): string {
    if (!sr.replaceRegex) return result
    const regex = this.compileRegex(sr.replaceRegex)
    if (sr.replaceFirst) {
      if (regex) { regex.lastIndex = 0; const m = regex.exec(result); if (m) return m[0].replace(regex, sr.replacement); return '' }
      return sr.replacement
    }
    if (regex) return result.replace(regex, sr.replacement)
    return result.replace(sr.replaceRegex, sr.replacement)
  }

  private compileRegex(pattern: string): RegExp | null {
    const cached = this.regexCache.get(pattern)
    if (cached !== undefined) return cached
    try { const re = new RegExp(pattern, 'g'); this.regexCache.set(pattern, re); return re }
    catch { this.regexCache.set(pattern, null); return null }
  }

  private splitSourceRuleCacheString(ruleStr: string): SourceRule[] {
    if (!ruleStr) return []
    const cached = this.ruleCache.get(ruleStr)
    if (cached) return cached.map(sr => sr.cloneForExecution())
    const rules = this.splitSourceRule(ruleStr)
    this.ruleCache.set(ruleStr, rules)
    return rules
  }

  splitSourceRule(ruleStr: string, allInOne: boolean = false): SourceRule[] {
    if (!ruleStr) return []
    const ruleList: SourceRule[] = []
    let mMode: 'default' | 'js' | 'regex' | 'webjs' | 'xpath' | 'json' = 'default'
    let start = 0
    if (allInOne && ruleStr.startsWith(':')) { mMode = 'regex'; this.isRegex = true; start = 1 }
    else if (this.isRegex) { mMode = 'regex' }

    const jsMatcher = new RegExp(JS_PATTERN.source, 'gi'); let jsMatch
    while ((jsMatch = jsMatcher.exec(ruleStr)) !== null) {
      if (jsMatch.index > start) { const tmp = ruleStr.substring(start, jsMatch.index).trim(); if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSON)) }
      const jsCode = (jsMatch[2] !== undefined ? jsMatch[2] : jsMatch[1]) ?? ''
      ruleList.push(new SourceRule(jsCode, 'js', this.isJSON))
      start = jsMatch.index + jsMatch[0].length
    }
    const webJsMatcher = new RegExp(WEBJS_PATTERN.source, 'gi'); let webMatch
    while ((webMatch = webJsMatcher.exec(ruleStr)) !== null) {
      if (webMatch.index > start) { const tmp = ruleStr.substring(start, webMatch.index).trim(); if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSON)) }
      ruleList.push(new SourceRule(webMatch[1] || '', 'webjs', this.isJSON))
      start = webMatch.index + webMatch[0].length
    }
    if (ruleStr.length > start) { const tmp = ruleStr.substring(start).trim(); if (tmp) ruleList.push(new SourceRule(tmp, mMode, this.isJSON)) }
    return ruleList
  }

  async evalJS(jsStr: string, result: any = null, context?: RuleContext): Promise<any> {
    const code = jsStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
    try {
      const { executeJs } = await import('./js.js')
      const ctx = context || this.lastContext || {}
      const raw = await executeJs(code, {
        result,
        src: this.content,
        source: ctx.source || this.source || {},
        baseUrl: ctx.baseUrl || this.baseUrl || '',
        book: ctx.book || {},
        key: ctx.key || '',
        page: ctx.page || 1,
        chapter: ctx.chapter || {},
        nextChapterUrl: ctx.nextChapterUrl || '',
      })
      return typeof raw === 'string' ? raw : JSON.stringify(raw)
    } catch { return '' }
  }

  private getWebJsResult(jsStr: string, result: any): string {
    try {
      const code = jsStr.replace(/^@webjs:\s*/, '').replace(/^<webjs>/, '').replace(/<\/webjs>$/, '').trim()
      const html = typeof this.content === 'string' ? this.content : String(this.content)
      return this.executeWebJSWithRuntime(html, this.baseUrl || '', code)
    } catch { return '' }
  }

  private async getWebJsResultAsync(jsStr: string, result: any): Promise<string> {
    return this.getWebJsResult(jsStr, result)
  }

  private async executeWebJSWithRuntime(html: string, url: string, js: string): Promise<string> {
    try { return await network.fetchWebView(url, { webJs: js, timeout: 30000, sourceType: 0 }) } catch {
      return new Promise(resolve => {
        const iframe = document.createElement('iframe'); iframe.style.display = 'none'; document.body.appendChild(iframe)
        const d = iframe.contentDocument || iframe.contentWindow?.document
        if (!d) { document.body.removeChild(iframe); resolve(''); return }
        d.open(); d.write(html); d.close()
        setTimeout(() => { try { resolve(String((iframe.contentWindow as any).eval(js) || '')) } catch { resolve('') } document.body.removeChild(iframe) }, 500)
      })
    }
  }

  put(key: string, value: string): void { this.variableStore.set(key, value) }
  get(key: string): string { return this.variableStore.get(key) || '' }

  private putRule(map: Record<string, string>, context?: RuleContext): void {
    for (const [k, v] of Object.entries(map)) this.put(k, this.getString(v, context) as any)
  }

  private resolveUrl(url: string): string {
    if (!url || url.startsWith('http')) return url
    const base = this.redirectUrl || this.baseUrl || ''
    if (!base) return url
    try { return new URL(url, base).href } catch { return url }
  }

  private unescapeHtml(str: string): string {
    return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  }

  private getCSSAnalyzer(content: any): AnalyzeByCSS { const k = String(content).substring(0, 200); if (!this.cssCache.has(k)) this.cssCache.set(k, new AnalyzeByCSS(content)); return this.cssCache.get(k)! }
  private getXPathAnalyzer(content: any): AnalyzeByXPath { const k = String(content).substring(0, 200); if (!this.xpathCache.has(k)) this.xpathCache.set(k, new AnalyzeByXPath(content)); return this.xpathCache.get(k)! }
  private getJSONPathAnalyzer(content: any): AnalyzeByJSONPath { const k = String(content).substring(0, 200); if (!this.jsonpathCache.has(k)) this.jsonpathCache.set(k, new AnalyzeByJSONPath(content)); return this.jsonpathCache.get(k)! }

  clearCache(): void { this.cssCache.clear(); this.xpathCache.clear(); this.jsonpathCache.clear(); this.ruleCache.clear(); this.regexCache.clear(); this.variableStore.clear() }
}
