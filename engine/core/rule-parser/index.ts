// ============================================
// 规则解析主入口 — 完全对齐 legado AnalyzeRule + RuleAnalyzer
// ============================================

import { executeCss, parseCss } from './css.js'
import { executeXPath } from './xpath.js'
import { executeJsonPath } from './jsonpath.js'
import { executeRegex } from './regex.js'
import { executeJs } from './js.js'
import { putContext, getContext } from '../../context/store.js'
import type { ParseContext, SourceRule, RuleMode } from '../../types.js'

const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:\s*([\s\S]+)/gi
const ruleCache = new Map<string, SourceRule[]>()
const MAX_RULE_CACHE = 200

function isJsonContent(content: any): boolean {
  if (content && typeof content === 'object' && (content as any).type === 'tag') return false
  if (typeof content === 'object' && content !== null) return true
  if (typeof content === 'string') {
    const t = content.trim()
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
  }
  return false
}

// 修复：使用非贪婪匹配 + 递归处理嵌套花括号
const PUT_PATTERN = /@put:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gi
function extractPutRule(ruleStr: string): { cleanedRule: string; putMap: Record<string, string> } {
  const putMap: Record<string, string> = {}
  let cleanedRule = ruleStr
  // 使用 replace 并限制最多执行 20 次防止死循环
  let iterations = 0
  while (iterations < 20) {
    const newRule = cleanedRule.replace(PUT_PATTERN, (_m, jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr.replace(/'/g, '"'))
        Object.assign(putMap, parsed)
      } catch {
        const pairs = jsonStr.replace(/'/g, '"').split(',').map((s: string) => s.trim())
        for (const pair of pairs) {
          const idx = pair.indexOf(':')
          if (idx > 0) {
            const key = pair.substring(0, idx).trim().replace(/["']/g, '')
            const val = pair.substring(idx + 1).trim().replace(/["']/g, '')
            if (key) putMap[key] = val
          }
        }
      }
      return ''
    })
    if (newRule === cleanedRule) break
    cleanedRule = newRule
    iterations++
  }
  return { cleanedRule, putMap }
}

class RuleAnalyzer {
  private queue: string; private pos: number; private start: number; private startX: number
  private rule: string[]; private step: number; elementsType: string; private code: boolean

  constructor(data: string, code: boolean = false) {
    this.queue = data; this.pos = 0; this.start = 0; this.startX = 0
    this.rule = []; this.step = 0; this.elementsType = ''; this.code = code
    this.trim()
  }

  private trim(): void {
    if (this.pos < this.queue.length && (this.queue[this.pos] === '@' || this.queue[this.pos] < '!')) {
      this.pos++
      while (this.pos < this.queue.length && (this.queue[this.pos] === '@' || this.queue[this.pos] < '!')) this.pos++
      this.start = this.pos; this.startX = this.pos
    }
  }

  private chompBalanced(open: string, close: string): boolean { return this.code ? this.chompCodeBalanced(open, close) : this.chompRuleBalanced(open, close) }

  private chompRuleBalanced(open: string, close: string): boolean {
    let depth = 0; let inSingleQuote = false; let inDoubleQuote = false
    const openChar = open.charCodeAt(0); const closeChar = close.charCodeAt(0)
    let i = this.pos
    while (i < this.queue.length) {
      const c = this.queue.charCodeAt(i); i++
      if (c === 0x27 && !inDoubleQuote) { inSingleQuote = !inSingleQuote; continue }
      if (c === 0x22 && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; continue }
      if (inSingleQuote || inDoubleQuote) continue
      if (c === 0x5c) { i++; continue }
      if (c === openChar) depth++; else if (c === closeChar) depth--
      if (depth < 0) break
    }
    this.pos = i
    return depth <= 0
  }

  private chompCodeBalanced(open: string, close: string): boolean {
    let depth = 0; let otherDepth = 0; let inSingleQuote = false; let inDoubleQuote = false; let inTemplate = false
    const openChar = open.charCodeAt(0); const closeChar = close.charCodeAt(0)
    let i = this.pos
    while (i < this.queue.length) {
      const c = this.queue.charCodeAt(i); i++
      if (c !== 0x5c) {
        if (c === 0x60 && !inSingleQuote && !inDoubleQuote) { inTemplate = !inTemplate; continue }
        if (c === 0x27 && !inDoubleQuote && !inTemplate) { inSingleQuote = !inSingleQuote; continue }
        if (c === 0x22 && !inSingleQuote && !inTemplate) { inDoubleQuote = !inDoubleQuote; continue }
        if (inSingleQuote || inDoubleQuote || inTemplate) continue
        if (c === 0x5b) depth++; else if (c === 0x5d) depth--
        else if (depth === 0) { if (c === openChar) otherDepth++; else if (c === closeChar) otherDepth-- }
      } else { i++ }
    }
    this.pos = i
    return depth <= 0 && otherDepth <= 0
  }

  private consumeTo(seq: string): boolean { this.start = this.pos; const offset = this.queue.indexOf(seq, this.pos); if (offset === -1) return false; this.pos = offset; return true }
  private consumeToAny(...seq: string[]): boolean { let p = this.pos; while (p !== this.queue.length) { for (const s of seq) { if (this.queue.startsWith(s, p)) { this.step = s.length; this.pos = p; return true } } p++ } return false }
  private findToAny(...chars: string[]): number { let p = this.pos; while (p !== this.queue.length) { for (const ch of chars) { if (this.queue[p] === ch) return p } p++ } return -1 }

  private splitRuleFirst(split: string[]): string[] {
    this.elementsType = split[0]
    if (split.length === 1) { if (!this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.startX)); return this.rule } this.step = this.elementsType.length }
    else if (!this.consumeToAny(...split)) { this.rule.push(this.queue.substring(this.startX)); return this.rule }
    const end = this.pos; this.pos = this.start
    while (true) {
      const st = this.findToAny('[', '('); if (st === -1) { this.pushRemainingSegments(end); return this.rule }
      if (st > end) return this.pushSegmentsAndRecurse(end, st, split)
      this.pos = st; const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        // 如果括号不平衡，跳过并继续
        this.pos = st + 1
        continue
      }
      if (end <= this.pos) { this.start = this.pos; return this.splitRuleNext() }
    }
  }

  private splitRuleNext(): string[] {
    const end = this.pos; this.pos = this.start
    while (true) {
      const st = this.findToAny('[', '('); if (st === -1) { this.pushRemainingSegments(end); return this.rule }
      if (st > end) return this.pushSegmentsAndRecurseNext(end, st)
      this.pos = st; const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        this.pos = st + 1
        continue
      }
      if (end <= this.pos) { this.start = this.pos; if (!this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.startX)); return this.rule } this.pos += this.step; return this.splitRuleNext() }
    }
  }

  private pushRemainingSegments(end: number): void { this.rule.push(this.queue.substring(this.startX, end)); this.pos = end + this.step; while (this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step } this.rule.push(this.queue.substring(this.pos)) }
  private pushSegmentsAndRecurse(end: number, st: number, split: string[]): string[] { this.rule.push(this.queue.substring(this.startX, end)); this.pos = end + this.step; while (this.consumeTo(this.elementsType) && this.pos < st) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step } if (this.pos > st) { this.startX = this.start; return this.splitRuleFirst(split) } this.rule.push(this.queue.substring(this.pos)); return this.rule }
  private pushSegmentsAndRecurseNext(end: number, st: number): string[] { this.rule.push(this.queue.substring(this.startX, end)); this.pos = end + this.step; while (this.consumeTo(this.elementsType) && this.pos < st) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step } if (this.pos > st) { this.startX = this.start; return this.splitRuleNext() } this.rule.push(this.queue.substring(this.pos)); return this.rule }

  splitRule(...split: string[]): string[] { this.rule = []; this.start = 0; this.startX = 0; this.pos = 0; return this.splitRuleFirst(split) }

  innerRule(startStr: string, fr: (inner: string) => string | null, startStep: number = 1, endStep: number = 1, endStr?: string): string {
    if (endStr) return this.innerRuleWithEnd(startStr, endStr, fr)
    const st: string[] = []; this.startX = 0; this.pos = 0
    while (this.consumeTo(startStr)) { const posPre = this.pos; if (this.chompCodeBalanced('{', '}')) { const frv = fr(this.queue.substring(posPre + startStep, this.pos - endStep)); if (frv !== null && frv !== undefined && frv !== '') { st.push(this.queue.substring(this.startX, posPre) + frv); this.startX = this.pos; continue } } this.pos += startStr.length }
    if (this.startX === 0) return this.queue; st.push(this.queue.substring(this.startX)); return st.join('')
  }

  private innerRuleWithEnd(startStr: string, endStr: string, fr: (inner: string) => string | null): string { const st: string[] = []; this.startX = 0; this.pos = 0; while (this.consumeTo(startStr)) { this.pos += startStr.length; const posPre = this.pos; if (this.consumeTo(endStr)) { const frv = fr(this.queue.substring(posPre, this.pos)); st.push(this.queue.substring(this.startX, posPre - startStr.length) + frv); this.pos += endStr.length; this.startX = this.pos } } if (this.startX === 0) return this.queue; st.push(this.queue.substring(this.startX)); return st.join('') }
}

function splitByHash(ruleFragment: string, mode: RuleMode, putMap: Record<string, string>): SourceRule[] {
  if (!ruleFragment.includes('##')) return [{ mode, rule: ruleFragment.trim(), putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined }]
  const parts = ruleFragment.split('##')
  return [{ mode, rule: parts[0].trim(), replaceRegex: parts[1] || undefined, replacement: parts[2] || undefined, replaceFirst: parts.length > 3 || undefined, putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined }]
}

function splitByNewline(ruleStr: string): string[] {
  const lines = ruleStr.split('\n').filter(l => l.trim()); const result: string[] = []; let current = ''
  for (const line of lines) { const trimmed = line.trim(); if (current && (trimmed.startsWith('@js:') || trimmed.startsWith('<js>'))) { result.push(current); current = trimmed } else if (current && trimmed.startsWith('@@') && !trimmed.toLowerCase().startsWith('@css:')) { result.push(current); current = trimmed } else { current = current ? current + '\n' + trimmed : trimmed } }
  if (current) result.push(current); return result
}

function detectMode(ruleStr: string, isJson: boolean): { mode: RuleMode; remaining: string } {
  let remaining = ruleStr
  if (remaining.startsWith('@CSS:') || remaining.toLowerCase().startsWith('@css:')) return { mode: 'css', remaining }
  if (remaining.startsWith('@@')) return { mode: 'css', remaining: remaining.substring(2) }
  if (remaining.toLowerCase().startsWith('@xpath:')) return { mode: 'xpath', remaining: remaining.substring(7) }
  if (remaining.toLowerCase().startsWith('@json:')) return { mode: 'json', remaining: remaining.substring(6) }
  if (remaining.startsWith('/')) return { mode: 'xpath', remaining }
  if (remaining.startsWith(':')) return { mode: 'regex', remaining: remaining.substring(1) }
  if (isJson || remaining.startsWith('$.') || remaining.startsWith('$[')) return { mode: 'json', remaining }
  return { mode: 'css', remaining }
}

export function parseRule(ruleStr: string, isJson: boolean = false): SourceRule[] {
  if (!ruleStr) return []
  const { cleanedRule, putMap } = extractPutRule(ruleStr); let remaining = cleanedRule.trim(); if (!remaining) return []
  // 如果剩余字符串包含 @put: 但 extractPutRule 没清理干净，手动再清理一次
  if (remaining.includes('@put:')) {
    remaining = remaining.replace(/@put:\s*\{[^{}]*\}/g, '').trim()
  }
  const analyzer = new RuleAnalyzer(remaining); const segments = analyzer.splitRule('&&', '||', '%%'); const elementTypes = analyzer.elementsType
  if (segments.length > 1) { const allRules: SourceRule[] = []; for (let i = 0; i < segments.length; i++) { const seg = segments[i]; const subRules = parseRule(seg, isJson); for (const sr of subRules) { if (elementTypes && i < segments.length - 1) allRules.push({ ...sr, _combineType: elementTypes as any }); else allRules.push(sr) } } return allRules }
  const lineSegments = splitByNewline(remaining); if (lineSegments.length > 1) { const allRules: SourceRule[] = []; for (const seg of lineSegments) allRules.push(...parseRule(seg, isJson)); return allRules }
  const { mode: defaultMode, remaining: afterMode } = detectMode(remaining, isJson); remaining = afterMode
  const rules: SourceRule[] = []; let start = 0; const jsRe = new RegExp(JS_PATTERN.source, 'gi'); let jsMatch: RegExpExecArray | null
  while ((jsMatch = jsRe.exec(remaining)) !== null) { if (jsMatch.index > start) { const tmp = remaining.substring(start, jsMatch.index).trim(); if (tmp) rules.push(...splitByHash(tmp, defaultMode, putMap)) } rules.push({ mode: 'js', rule: (jsMatch[2] || jsMatch[1]).trim(), putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined }); start = jsRe.lastIndex }
  if (remaining.length > start) { const tmp = remaining.substring(start).trim(); if (tmp) rules.push(...splitByHash(tmp, defaultMode, putMap)) }
  return rules
}

function getCachedRules(rule: string, isJson: boolean): SourceRule[] { let rules = ruleCache.get(rule); if (!rules) { rules = parseRule(rule, isJson); if (ruleCache.size >= MAX_RULE_CACHE) { const firstKey = ruleCache.keys().next().value; if (firstKey) ruleCache.delete(firstKey) } ruleCache.set(rule, rules) } return rules }

const EVAL_PATTERN = /@get:\{([^}]+)\}|\{\{([^}]+)\}\}/gi
const REGEX_REF_PATTERN = /\$\d{1,2}/

function resolveValue(value: string, context: ParseContext, lastResult: any): string {
  if (typeof value !== 'string') return String(value)
  let result = value.replace(EVAL_PATTERN, (_m, getKey?: string, jsExpr?: string) => {
    if (getKey) { const sourceKey = (context.source as any)?.bookSourceUrl || (context.source as any)?.url || 'default'; return getContext(sourceKey, getKey.trim()) || '' }
    if (jsExpr) { const trimmed = jsExpr.trim(); if (REGEX_REF_PATTERN.test(trimmed) && Array.isArray(lastResult)) { const idx = parseInt(trimmed.substring(1), 10); return idx < lastResult.length ? String(lastResult[idx] || '') : '' } try { const fn = new Function('result', 'src', 'book', 'source', 'chapter', 'baseUrl', 'page', 'key', 'var $ = result; return (' + trimmed + ')'); const val = fn(lastResult, context.src, context.book, context.source, context.chapter, context.baseUrl, context.page, context.key); return val !== null && val !== undefined ? String(val) : '' } catch { return '' } }
    return ''
  })
  return result
}

function applyReplace(result: string, pattern: string, replacement: string, replaceFirst?: boolean): string { if (!pattern || typeof result !== 'string') return result; try { if (replaceFirst) { const m = result.match(new RegExp(pattern, 's')); if (m) return m[0].replace(new RegExp(pattern, 's'), replacement); return replacement } return result.replace(new RegExp(pattern, 'gs'), replacement) } catch { return result } }

function executePut(putMap: Record<string, string> | undefined, context: ParseContext, data: any): void { if (!putMap) return; const sourceKey = (context.source as any)?.bookSourceUrl || (context.source as any)?.url || 'default'; for (const [key, value] of Object.entries(putMap)) putContext(sourceKey, key, resolveValue(value, context, data)) }

function resolveInnerRules(ruleStr: string, context: ParseContext, data: any): string { const analyzer = new RuleAnalyzer(ruleStr, true); return analyzer.innerRule('{$.', (inner) => { try { const result = executeJsonPath(data, '$.' + inner); if (result === null || result === undefined) return ''; if (typeof result === 'string') return result; if (Array.isArray(result)) return result.length === 1 ? String(result[0]) : JSON.stringify(result); return String(result) } catch { return '' } }) }

async function executeSingleRule(data: any, sourceRule: SourceRule, context: ParseContext, lastResult: any): Promise<any> {
  const { mode, rule: rawRule, replaceRegex, replacement, replaceFirst, putMap } = sourceRule
  executePut(putMap, context, lastResult)
  const resolvedRule = rawRule ? resolveValue(rawRule, context, lastResult) : ''
  const ruleWithInner = resolvedRule ? resolveInnerRules(resolvedRule, context, lastResult) : resolvedRule
  if (!ruleWithInner) { if (replaceRegex !== undefined && lastResult !== null && lastResult !== undefined && typeof lastResult === 'string') return applyReplace(lastResult, replaceRegex, replacement || '', replaceFirst); return lastResult }
  if (ruleWithInner.includes('||')) { const options = ruleWithInner.split('||').map(s => s.trim()); for (const option of options) { const val = await executeSingleRule(data, { mode, rule: option }, context, lastResult); if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) return val } return null }
  if (ruleWithInner.includes('&&')) { const options = ruleWithInner.split('&&').map(s => s.trim()); const results: string[] = []; for (const option of options) { const val = await executeSingleRule(data, { mode, rule: option }, context, lastResult); if (val !== null && val !== undefined) results.push(String(val)) } return results.length > 0 ? results.join(',') : null }
  const input = lastResult !== undefined ? lastResult : data; let stepResult: any
  if (input && typeof input === 'object' && !Array.isArray(input) && !(input.type === 'tag') && ruleWithInner in input) { stepResult = input[ruleWithInner] }
  else {
    switch (mode) {
      case 'js': stepResult = await executeJs(input, ruleWithInner, context); break
      case 'webjs': {
        const escapedRule = ruleWithInner.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const jsCode = 'java.webJsExecute(String(result), `' + escapedRule + '`)';
        stepResult = await executeJs(input, jsCode, context); break
      }
      case 'json': { let jsonRule = ruleWithInner; if (!jsonRule.startsWith('$')) jsonRule = '$.' + jsonRule; stepResult = executeJsonPath(input, jsonRule); break }
      case 'xpath': stepResult = executeXPath(input, ruleWithInner); break
      case 'regex': stepResult = executeRegex(input, ruleWithInner); break
      default: { if (typeof input === 'string') { const el = new DOMParser().parseFromString(input, 'text/html').body?.firstElementChild; if (ruleWithInner === 'text') { stepResult = el?.textContent?.trim() || input; break } if (ruleWithInner === 'href' || ruleWithInner === 'src' || ruleWithInner === 'class' || ruleWithInner === 'id') { stepResult = el?.getAttribute(ruleWithInner) || ''; break } } let cssRule = ruleWithInner; if (cssRule.startsWith('@') && !cssRule.startsWith('@CSS:') && !cssRule.startsWith('@css:')) cssRule = cssRule.substring(1); const parsed = parseCss(cssRule); stepResult = executeCss(input, parsed.expression, parsed.attribute) }
    }
  }
  if (replaceRegex !== undefined && stepResult !== null && stepResult !== undefined) { if (typeof stepResult === 'string') stepResult = applyReplace(stepResult, replaceRegex, replacement || '', replaceFirst); else if (Array.isArray(stepResult)) stepResult = stepResult.map((item: any) => typeof item === 'string' ? applyReplace(item, replaceRegex, replacement || '', replaceFirst) : item) }
  return stepResult
}

async function executeRulesWithCombine(data: any, rules: SourceRule[], context: ParseContext): Promise<{ result: any; isElements: boolean }> {
  const combinedResults: any[] = []; let combineType = ''; let isElements = false
  for (let i = 0; i < rules.length; i++) { const sr = rules[i]; const ct = (sr as any)._combineType || ''; const step = await executeSingleRule(data, sr, context, i > 0 ? combinedResults[combinedResults.length - 1] : data)
    if (ct === '&&' || ct === '%%') { if (Array.isArray(step)) { combinedResults.push(...step); isElements = true } else if (step !== null && step !== undefined && step !== '') combinedResults.push(step); combineType = ct }
    else if (ct === '||') { if (step !== null && step !== undefined && step !== '' && !(Array.isArray(step) && step.length === 0)) { combinedResults.push(step); combineType = ct; break } }
    else { if (i === rules.length - 1 && combineType === '') return { result: step, isElements: false }; if (step !== null && step !== undefined && step !== '') { if (Array.isArray(step)) { combinedResults.push(...step); isElements = true } else combinedResults.push(step) } }
  }
  if (isElements || combinedResults.length > 1) return { result: combinedResults, isElements: true }
  return { result: combinedResults.length === 1 ? combinedResults[0] : null, isElements: false }
}

export async function getString(data: any, rule: string, context: ParseContext = {}): Promise<string> {
  if (!rule || rule === 'null' || rule === 'undefined') return ''
  const isJson = isJsonContent(data); const parsedData = isJson && typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data
  const rules = getCachedRules(rule, isJson); if (rules.length === 0) return ''
  const { result } = await executeRulesWithCombine(parsedData, rules, context)
  let final: string; if (typeof result === 'string') final = result; else if (result && typeof result === 'object' && typeof result.text === 'function') final = result.text() || ''; else if (Array.isArray(result) && result.length > 0) final = String(result[0]); else if (result !== null && result !== undefined) { try { final = JSON.stringify(result) } catch { final = String(result) } } else return ''
  if (final.indexOf('&') > -1) final = final.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  if (context.isUrl && final && !final.startsWith('http')) { const base = context.baseUrl || (context.source as any)?.bookSourceUrl || ''; if (base) { if (final.startsWith('/')) { try { const u = new URL(base); final = u.origin + final } catch {} } else final = base.replace(/\/+$/, '') + '/' + final.replace(/^\/+/, '') } }
  return final
}

export async function getElements(data: any, rule: string, context: ParseContext = {}): Promise<any[]> {
  if (!rule) return []; const isJson = isJsonContent(data); const parsedData = isJson && typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data; const rules = getCachedRules(rule, isJson); if (rules.length === 0) return []
  const { result, isElements } = await executeRulesWithCombine(parsedData, rules, context); if (isElements && Array.isArray(result)) return result; if (Array.isArray(result)) return result
  const finalResult = result !== null && result !== undefined ? [result] : []; try { JSON.stringify(finalResult) } catch { return [] }; return finalResult
}

export async function getElement(data: any, rule: string, context: ParseContext = {}): Promise<any> { const elements = await getElements(data, rule, context); return elements.length > 0 ? elements[0] : null }
export async function parseAndExecute(data: any, rule: string, context: ParseContext = {}): Promise<any> { if (data === undefined || !rule) return null; return getString(data, rule, context) }
export async function parseFallbackRule(data: any, rule: string, fallback: string, context: ParseContext = {}): Promise<any> { const result = await parseAndExecute(data, rule, context); if (result !== null && result !== undefined && result !== '') return result; return parseAndExecute(data, fallback, context) }
export { RuleAnalyzer }


