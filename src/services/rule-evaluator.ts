// ============================================
// 规则执行调度器 — @get: 直接从 STORAGE 读取，不执行 JS 收集
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { getString } from '@engine/parser/index.js'
import { logError } from '@engine/log/index.js'
import { parseRuleSegments } from './rule-parser.js'
import { executeJsSegment } from './rule-js-executor.js'

export function shouldExecuteInDeno(rule: string): boolean {
  if (!rule) return false
  if (rule.includes('@js:')) return true
  if (rule.includes('@javascript:')) return true
  if (rule.includes('<js>')) return true
  if (rule.includes('JavaImporter')) return true
  if (rule.includes('org.jsoup')) return true
  return false
}

/**
 * 从 Rust STORAGE 读取单个变量值
 * 直接调用 op_java_get，不执行 JS 收集
 */
async function getVariableValue(key: string): Promise<string> {
  try {
    // 通过执行一个极简 JS 读取变量
    const code = `java.get(${JSON.stringify(key)})`
    const response: any = await invoke('execute_js_rule', {
      code,
      context: {},
      timeoutMs: 3000,
    })
    if (response?.success) return response.result || ''
    return ''
  } catch {
    return ''
  }
}

export async function evaluateRule(
  rule: string,
  data: any,
  context: Record<string, any>,
  options?: { forceDeno?: boolean; cacheKey?: string }
): Promise<any> {
  if (!rule) return data

  // @get:{key} 预处理：逐个读取，无副作用
  if (rule.includes('@get:')) {
    try {
      const getMatches = rule.match(/@get:\{([^}]+)\}/g)
      if (getMatches) {
        const uniqueKeys = new Set<string>()
        for (const m of getMatches) {
          const key = m.replace(/^@get:\{/, '').replace(/\}$/, '')
          uniqueKeys.add(key)
        }
        for (const key of uniqueKeys) {
          const val = await getVariableValue(key)
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          rule = rule.replace(new RegExp('@get:\\{' + escapedKey + '\\}', 'g'), String(val))
        }
      }
    } catch {
      // ignore
    }
  }

  const needDeno = options?.forceDeno ?? shouldExecuteInDeno(rule)

  if (!needDeno) {
    if (rule && !rule.includes('@') && !rule.includes('.') && !rule.includes('#') && !rule.includes('[') && !rule.includes(' ') && !rule.startsWith('//')) {
      return rule
    }
    return getString(data, rule, context)
  }

  const segments = parseRuleSegments(rule)
  if (segments.length === 0) return data

  const ruleTag = typeof context?.source?.bookSourceUrl === 'string'
    ? context.source.bookSourceUrl
    : rule.substring(0, 100)

  if (segments.length === 1) {
    const seg = segments[0]
    if (seg.type === 'pure') return getString(data, seg.rule, context)
    if (seg.type === 'js') return executeJsSegment(seg.code, data, context, ruleTag)
  }

  let prevResult: any = data

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'pure') {
      const input = i === 0 ? data : prevResult
      prevResult = await getString(input, seg.rule, context)
    } else if (seg.type === 'js') {
      prevResult = await executeJsSegment(seg.code, prevResult, context, ruleTag)
    }
  }

  return prevResult
}

export function clearRuleCache(): void {
  // 保留接口
}
