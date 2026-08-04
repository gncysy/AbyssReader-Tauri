export { AnalyzeRule } from './AnalyzeRule.js'
export { RuleAnalyzer } from './RuleAnalyzer.js'
export { SourceRule } from './SourceRule.js'
export { elementsSingle } from './ElementsSingle.js'
export { getResultLast, getResultList, getElementsRecursive } from './ResultExtractor.js'
export { AnalyzeByCSS } from './AnalyzeByCSS.js'
export { AnalyzeByXPath } from './AnalyzeByXPath.js'
export { AnalyzeByJSONPath } from './AnalyzeByJSONPath.js'

import { AnalyzeRule } from './AnalyzeRule.js'

function getAnalyzer(html: any, baseCtx?: any): AnalyzeRule {
  const analyzer = new AnalyzeRule(baseCtx?.source)
  analyzer.setContent(html, baseCtx?.baseUrl)
  if (baseCtx?.redirectUrl) analyzer.setRedirectUrl(baseCtx.redirectUrl)
  return analyzer
}

export async function getElements(html: any, rule: string, context?: any): Promise<any[]> {
  if (!rule) return []
  console.log('[getElements] rule=' + rule + ' htmlType=' + typeof html + ' htmlLen=' + (typeof html === 'string' ? html.length : 'N/A'))
  const result = await getAnalyzer(html, context).getElements(rule, context)
  console.log('[getElements] result length=' + (result ? result.length : 'null') + ' first=' + (result && result[0] ? (result[0].tagName || typeof result[0]) : 'null'))
  return result
}

export async function getString(content: any, rule: string, context?: any): Promise<string> {
  if (!rule) {
    if (typeof content === 'string') return content
    // Element 对象：取 textContent，而非 String(element) = '[object HTMLDivElement]'
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
  return new AnalyzeRule(source)
}

