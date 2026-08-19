// ============================================
// 解析器统一导出
// ============================================

export { AnalyzeRule } from './analyze-rule.js'
export { RuleAnalyzer } from './rule-analyzer.js'
export { SourceRule } from './source-rule.js'
export { AnalyzeByCSS, normalizeCssSelector, elementsSingle, getResultLast, getResultList, getElementsRecursive } from './dom/css.js'
export { AnalyzeByXPath } from './dom/xpath.js'
export { AnalyzeByJSONPath } from './json/jsonpath.js'
export { setJsRuntime, getJsRuntime, clearJsCache } from './js-executor.js'
export { toDomNode } from './dom/to-dom-node.js'

import { AnalyzeRule } from './analyze-rule.js'

type WebJsExecutor = (html: string, jsCode: string, baseUrl: string) => Promise<string>

let globalWebJsExecutor: WebJsExecutor | null = null

export function setWebJsExecutor(executor: WebJsExecutor): void {
  globalWebJsExecutor = executor
}

function getAnalyzer(html: any, baseCtx?: any): AnalyzeRule {
  const analyzer = new AnalyzeRule(baseCtx?.source)
  analyzer.setContent(html, baseCtx?.baseUrl)
  if (baseCtx?.redirectUrl) analyzer.setRedirectUrl(baseCtx.redirectUrl)
  if (globalWebJsExecutor) {
    analyzer.setWebJsExecutor(globalWebJsExecutor)
  }
  return analyzer
}

export async function getElements(html: any, rule: string, context?: any): Promise<any[]> {
  if (!rule) return []
  return getAnalyzer(html, context).getElements(rule, context)
}

export async function getString(content: any, rule: string, context?: any): Promise<string> {
  console.error('[DEBUG getString] rule=', rule, ', content type=', typeof content, ', content tag=', (content as any)?.tag)
  if (!rule) {
    if (typeof content === 'string') return content
    if (content && typeof content === 'object' && typeof content.textContent === 'string') return content.textContent
    if (content && typeof content === 'object' && typeof content.text === 'function') return content.text()
    return String(content)
  }
  return getAnalyzer(content, context).getString(rule, context)
}

export async function getStringList(content: any, rule: string, context?: any): Promise<string[]> {
  if (!rule) return []
  return getAnalyzer(content, context).getStringList(rule, context)
}

export function createAnalyzer(source?: any): AnalyzeRule {
  const analyzer = new AnalyzeRule(source)
  if (globalWebJsExecutor) {
    analyzer.setWebJsExecutor(globalWebJsExecutor)
  }
  return analyzer
}


