// ============================================
// XPath 规则解析
// ============================================

export function executeXPath(source: any, expression: string, attribute?: string): any {
  if (!source || !expression) return null

  try {
    const html = typeof source === 'string' ? source : String(source)
    const doc = new DOMParser().parseFromString(html, 'text/html')

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
