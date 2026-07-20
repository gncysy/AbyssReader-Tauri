// ============================================
// 规则解析主入口 — 完全对齐 legado AnalyzeRule
// ============================================

import { executeCss, parseCss } from './css.js'
import { executeXPath } from './xpath.js'
import { executeJsonPath } from './jsonpath.js'
import { executeRegex } from './regex.js'
import { executeJs } from './js.js'
import { putContext, getContext } from '../../context/store.js'
import type { ParseContext, SourceRule, RuleMode } from '../../types.js'

const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:\s*([^\s,{]+)/gi
const ruleCache = new Map<string, SourceRule[]>()
const MAX_RULE_CACHE = 64

function isJsonContent(content: any): boolean {
  if (content && typeof content === 'object' && (content as any).type === 'tag') return false
  if (typeof content === 'object' && content !== null) return true
  if (typeof content === 'string') {
    const t = content.trim()
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
  }
  return false
}

const PUT_PATTERN = /@put:\s*\{([^}]+)\}/gi
function extractPutRule(ruleStr: string): { cleanedRule: string; putMap: Record<string, string> } {
  const putMap: Record<string, string> = {}
  let cleanedRule = ruleStr.replace(PUT_PATTERN, (_m, jsonStr: string) => {
    try { Object.assign(putMap, JSON.parse(jsonStr)) } catch {
      const pairs = jsonStr.replace(/'/g, '"').split(',').map((s: string) => s.trim())
      for (const pair of pairs) {
        const idx = pair.indexOf(':')
        if (idx > 0) putMap[pair.substring(0, idx).trim().replace(/["']/g, '')] = pair.substring(idx + 1).trim().replace(/["']/g, '')
      }
    }
    return ''
  })
  return { cleanedRule, putMap }
}

function splitByHash(ruleFragment: string, mode: RuleMode, putMap: Record<string, string>): SourceRule[] {
  if (!ruleFragment.includes('##')) {
    return [{ mode, rule: ruleFragment.trim(), putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined }]
  }
  const parts = ruleFragment.split('##')
  return [{
    mode, rule: parts[0].trim(),
    replaceRegex: parts[1] || undefined,
    replacement: parts[2] || undefined,
    replaceFirst: parts.length > 3 || undefined,
    putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined,
  }]
}

export function parseRule(ruleStr: string, isJson: boolean = false): SourceRule[] {
  if (!ruleStr) return []

  const { cleanedRule, putMap } = extractPutRule(ruleStr)
  let remaining = cleanedRule.trim()
  if (!remaining) return []

  let defaultMode: RuleMode = 'css'
  if (isJson || remaining.startsWith('$.')) defaultMode = 'json'
  else if (remaining.startsWith('/')) defaultMode = 'xpath'
  else if (remaining.toLowerCase().startsWith('@xpath:')) { defaultMode = 'xpath'; remaining = remaining.substring(7) }
  else if (remaining.toLowerCase().startsWith('@json')) { defaultMode = 'json'; remaining = remaining.substring(remaining.indexOf(':') > 0 ? remaining.indexOf(':') + 1 : 6) }
  else if (remaining.toLowerCase().startsWith('@css:')) { defaultMode = 'css'; remaining = remaining.substring(5) }
  else if (remaining.startsWith('@@')) { defaultMode = 'css'; remaining = remaining.substring(2) }
  else if (remaining.startsWith(':')) { defaultMode = 'regex'; remaining = remaining.substring(1) }

  const rules: SourceRule[] = []
  let start = 0
  const jsRe = new RegExp(JS_PATTERN.source, 'gi')
  let jsMatch: RegExpExecArray | null

  while ((jsMatch = jsRe.exec(remaining)) !== null) {
    if (jsMatch.index > start) {
      const tmp = remaining.substring(start, jsMatch.index).trim()
      if (tmp) rules.push(...splitByHash(tmp, defaultMode, putMap))
    }
    rules.push({ mode: 'js', rule: (jsMatch[2] || jsMatch[1]).trim(), putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined })
    start = jsRe.lastIndex
  }

  if (remaining.length > start) {
    const tmp = remaining.substring(start).trim()
    if (tmp) rules.push(...splitByHash(tmp, defaultMode, putMap))
  }

  return rules
}

function getCachedRules(rule: string, isJson: boolean): SourceRule[] {
  let rules = ruleCache.get(rule)
  if (!rules) {
    rules = parseRule(rule, isJson)
    if (ruleCache.size >= MAX_RULE_CACHE) {
      const firstKey = ruleCache.keys().next().value
      if (firstKey) ruleCache.delete(firstKey)
    }
    ruleCache.set(rule, rules)
  }
  return rules
}

const EVAL_PATTERN = /@get:\{([^}]+)\}|\{\{([^}]+)\}\}/gi
const REGEX_REF_PATTERN = /\$\d{1,2}/

function resolveValue(value: string, context: ParseContext, lastResult: any): string {
  if (typeof value !== 'string') return String(value)

  let result = value.replace(EVAL_PATTERN, (_m, getKey?: string, jsExpr?: string) => {
    if (getKey) {
      const sourceKey = (context.source as any)?.bookSourceUrl || (context.source as any)?.url || 'default'
      return getContext(sourceKey, getKey.trim()) || ''
    }
    if (jsExpr) {
      const trimmed = jsExpr.trim()
      if (REGEX_REF_PATTERN.test(trimmed) && Array.isArray(lastResult)) {
        const idx = parseInt(trimmed.substring(1), 10)
        return idx < lastResult.length ? String(lastResult[idx] || '') : ''
      }
      try {
        const fn = new Function('result', 'src', 'book', 'source', 'chapter', 'baseUrl', 'page', 'key', 'return (' + trimmed + ')')
        const val = fn(lastResult, context.src, context.book, context.source, context.chapter, context.baseUrl, context.page, context.key)
        return val !== null && val !== undefined ? String(val) : ''
      } catch { return '' }
    }
    return ''
  })

  return result
}

function applyReplace(result: string, pattern: string, replacement: string, replaceFirst?: boolean): string {
  if (!pattern || typeof result !== 'string') return result
  try {
    if (replaceFirst) {
      const m = result.match(new RegExp(pattern))
      if (m) return m[0].replace(new RegExp(pattern), replacement)
      return replacement
    }
    return result.replace(new RegExp(pattern, 'g'), replacement)
  } catch { return result }
}

function executePut(putMap: Record<string, string> | undefined, context: ParseContext, data: any): void {
  if (!putMap) return
  const sourceKey = (context.source as any)?.bookSourceUrl || (context.source as any)?.url || 'default'
  for (const [key, value] of Object.entries(putMap)) {
    putContext(sourceKey, key, resolveValue(value, context, data))
  }
}

function executeSingleRule(data: any, sourceRule: SourceRule, context: ParseContext, lastResult: any): any {
  const { mode, rule: rawRule, replaceRegex, replacement, replaceFirst, putMap } = sourceRule
  executePut(putMap, context, lastResult)
  const resolvedRule = rawRule ? resolveValue(rawRule, context, lastResult) : ''
  if (!resolvedRule) {
    if (replaceRegex !== undefined && lastResult !== null && lastResult !== undefined && typeof lastResult === 'string') {
      return applyReplace(lastResult, replaceRegex, replacement || '', replaceFirst)
    }
    return lastResult
  }
  if (resolvedRule.includes('||')) {
    const options = resolvedRule.split('||').map(s => s.trim())
    for (const option of options) {
      const val = executeSingleRule(data, { mode, rule: option }, context, lastResult)
      if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) return val
    }
    return null
  }
  const input = lastResult !== undefined ? lastResult : data
  let stepResult: any
  if (input && typeof input === 'object' && !Array.isArray(input) && !(input.type === 'tag') && resolvedRule in input) {
    stepResult = input[resolvedRule]
  } else {
    switch (mode) {
      case 'js': stepResult = executeJs(input, resolvedRule, context); break
      case 'json': stepResult = executeJsonPath(input, resolvedRule); break
      case 'xpath': stepResult = executeXPath(input, resolvedRule); break
      case 'regex': stepResult = executeRegex(input, resolvedRule); break
      default: {
        let cssRule = resolvedRule
        if (cssRule.startsWith('@') && !cssRule.startsWith('@CSS:') && !cssRule.startsWith('@css:')) {
          cssRule = cssRule.substring(1)
        }
        const parsed = parseCss(cssRule)
        stepResult = executeCss(input, parsed.expression, parsed.attribute)
      }
    }
  }
  if (replaceRegex !== undefined && stepResult !== null && stepResult !== undefined) {
    if (typeof stepResult === 'string') {
      stepResult = applyReplace(stepResult, replaceRegex, replacement || '', replaceFirst)
    } else if (Array.isArray(stepResult)) {
      stepResult = stepResult.map((item: any) =>
        typeof item === 'string' ? applyReplace(item, replaceRegex, replacement || '', replaceFirst) : item
      )
    }
  }
  return stepResult
}

export function getString(data: any, rule: string, context: ParseContext = {}): string {
  if (!rule || rule === 'null' || rule === 'undefined') return ''

  const isJson = isJsonContent(data)
  const parsedData = isJson && typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data

  const rules = getCachedRules(rule, isJson)
  if (rules.length === 0) return ''

  let result: any = parsedData

  for (const sr of rules) {
    const step = executeSingleRule(parsedData, sr, context, result)
    if (step === null || step === undefined) return ''
    result = step
  }

  let final: string
  if (typeof result === 'string') final = result
  else if (result && typeof result === 'object' && typeof result.text === 'function') final = result.text() || ''
  else if (Array.isArray(result) && result.length > 0) final = String(result[0])
  else if (result !== null && result !== undefined) {
    try { final = JSON.stringify(result) } catch { final = String(result) }
  }
  else return ''

  if (final.indexOf('&') > -1) {
    final = final.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  }

  if (context.isUrl && final && !final.startsWith('http')) {
    const base = context.baseUrl || (context.source as any)?.bookSourceUrl || ''
    if (base) {
      if (final.startsWith('/')) { try { const u = new URL(base); final = u.origin + final } catch {} }
      else final = base.replace(/\/+$/, '') + '/' + final.replace(/^\/+/, '')
    }
  }

  return final
}

export function getElements(data: any, rule: string, context: ParseContext = {}): any[] {
  if (!rule) return []
  const isJson = isJsonContent(data)
  const parsedData = isJson && typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data
  const rules = getCachedRules(rule, isJson)
  if (rules.length === 0) return []

  let result: any = parsedData
  for (const sr of rules) {
    const step = executeSingleRule(parsedData, sr, context, result)
    if (step === null || step === undefined) return []
    result = step
  }

  const finalResult = Array.isArray(result) ? result : [result]
  try { JSON.stringify(finalResult) } catch { return [] }
  return finalResult
}

export function getElement(data: any, rule: string, context: ParseContext = {}): any {
  const elements = getElements(data, rule, context)
  return elements.length > 0 ? elements[0] : null
}

export function parseAndExecute(data: any, rule: string, context: ParseContext = {}): any {
  if (data === undefined || !rule) return null
  return getString(data, rule, context)
}

export function parseFallbackRule(data: any, rule: string, fallback: string, context: ParseContext = {}): any {
  const result = parseAndExecute(data, rule, context)
  if (result !== null && result !== undefined && result !== '') return result
  return parseAndExecute(data, fallback, context)
}
