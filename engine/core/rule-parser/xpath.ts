// ============================================
// XPath 规则解析（对齐 Legado AnalyzeByXPath）
// ============================================

export function executeXPath(source: any, expression: string, attribute?: string): any {
  if (!source || !expression) return null

  // 非 HTML/XML 内容或对象，XPath 无法解析，直接返回表达式（对齐 Legado）
  if (typeof source !== 'string') return expression
  if (!source.trim().startsWith('<')) return expression

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')

    let xpathExpr = expression
    if (attribute) xpathExpr = expression + '/@' + attribute

    const result = document.evaluate(
      xpathExpr,
      doc,
      null,
      XPathResult.ANY_TYPE,
      null
    )

    const values: string[] = []
    let node = result.iterateNext()
    while (node) {
      if (node.nodeType === Node.ATTRIBUTE_NODE) {
        values.push((node as Attr).value)
      } else if (node.nodeType === Node.TEXT_NODE) {
        values.push(node.textContent?.trim() || '')
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        values.push(node.textContent?.trim() || '')
      }
      node = result.iterateNext()
    }

    if (values.length === 0) return null
    return values.length === 1 ? values[0] : values
  } catch (err: any) {
    console.warn('[XPath] 执行失败:', err.message, expression)
    return null
  }
}

