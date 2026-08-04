function normalizeCssSelector(expression: string): string {
  return expression
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
    .replace(/@tag\.?/g, '')
    .replace(/@class\.([\w-]+)/g, '.$1')
    .replace(/@id\.([\w-]+)/g, '#$1')
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    .replace(/\btag\.(\w[\w-]*)/g, '$1')
    .replace(/\bid\.([\w-]+)/g, '#$1')
    .replace(/^@+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function elementsSingle(parent: Element, rule: string): Element[] {
  const rus = rule.trim()
  if (!rus) return []

  let split = '.'
  let beforeRule = ''
  const indexDefault: number[] = []
  const indexes: any[] = []
  const head = rus.endsWith(']')

  if (head) {
    let len = rus.length - 1
    const curList: (number | null)[] = []
    let l = ''
    let curMinus = false
    let curInt: number | null = null

    while (len-- >= 0) {
      const rl = rus[len]
      if (rl === ' ') continue
      if (rl >= '0' && rl <= '9') { l = rl + l; continue }
      if (rl === '-') { curMinus = true; continue }

      curInt = l ? (curMinus ? -parseInt(l) : parseInt(l)) : null

      if (rl === ':') {
        curList.push(curInt)
      } else {
        if (curList.length === 0) {
          if (curInt === null) break
          indexes.push(curInt)
        } else {
          indexes.push([curInt, curList[curList.length - 1], curList.length === 2 ? curList[0] : 1])
          curList.length = 0
        }
        if (rl === '!') {
          split = '!'
          while (len > 0 && rus[len - 1] === ' ') len--
        }
        if (rl === '[') {
          beforeRule = rus.substring(0, len)
          break
        }
        if (rl !== ',') break
      }
      l = ''
      curMinus = false
    }
    if (beforeRule === '') beforeRule = rus.substring(0, Math.max(0, rus.lastIndexOf('[')))
  } else {
    let len = rus.length
    let l = ''
    let curMinus = false

    while (len-- >= 0) {
      const rl = rus[len]
      if (rl === ' ') continue
      if (rl >= '0' && rl <= '9') { l = rl + l; continue }
      if (rl === '-') { curMinus = true; continue }

      if (rl === '!' || rl === '.' || rl === ':') {
        const idx = curMinus ? -parseInt(l) : parseInt(l)
        if (!isNaN(idx)) {
          // l 是有效数字：添加索引，设置 beforeRule 为选择器部分，break
          indexDefault.push(idx)
          if (rl !== ':') {
            split = rl
            beforeRule = rus.substring(0, len)
            break
          }
        } else {
          // l 不是数字（如 .item）：这是普通 CSS 选择器的一部分
          // 设置 beforeRule 为选择器部分，但继续循环
          if (rl !== ':') {
            split = rl
            beforeRule = rus.substring(0, len)
          }
        }
      } else {
        // 非分隔符非数字：完整规则，break
        beforeRule = rus
        break
      }
      l = ''
      curMinus = false
    }
    // 对齐阅读：循环正常结束（无索引）时，重置 beforeRule
    if (len < 0 && indexDefault.length === 0 && indexes.length === 0) {
      split = ' '
      beforeRule = rus
    }
  }

  return finishSelect(parent, beforeRule, split, indexDefault, indexes)
}

function finishSelect(
  parent: Element,
  beforeRule: string,
  split: string,
  indexDefault: number[],
  indexes: any[]
): Element[] {
  let elements: Element[]

  if (!beforeRule) {
    elements = Array.from(parent.children)
  } else {
    const dotIdx = beforeRule.indexOf('.')
    const firstKey = dotIdx === -1 ? beforeRule : beforeRule.substring(0, dotIdx)
    const rest = dotIdx === -1 ? '' : beforeRule.substring(dotIdx + 1)

    switch (firstKey) {
      case 'children':
        elements = Array.from(parent.children)
        break
      case 'class':
        elements = Array.from(parent.getElementsByClassName(rest))
        break
      case 'tag':
        elements = Array.from(parent.getElementsByTagName(rest))
        break
      case 'id': {
        const el = parent.querySelector('#' + CSS.escape(rest))
        elements = el ? [el] : []
        break
      }
      case 'text':
        {
          const searchText = rest
          const all = Array.from(parent.querySelectorAll('*'))
          elements = all.filter(e => {
            if (e.children.length > 0) return false
            let ownText = ''
            e.childNodes.forEach(n => {
              if (n.nodeType === Node.TEXT_NODE) ownText += n.textContent || ''
            })
            return ownText.includes(searchText)
          })
        }
        break
      default:
        try {
          const sel = normalizeCssSelector(beforeRule)
          console.log('[elementsSingle] default select sel=' + sel + ' on tagName=' + (parent?.tagName || 'N/A') + ' parent.children=' + (parent?.children?.length || 0))
          elements = Array.from(parent.querySelectorAll(sel))
          console.log('[elementsSingle] default select result count=' + elements.length)
        }
        catch { elements = [] }
    }
  }

  const len = elements.length

  if (indexDefault.length === 0 && indexes.length === 0) return elements

  const indexSet = new Set<number>()
  const lastIndexes = indexes.length > 0 ? indexes.length - 1 : indexDefault.length - 1

  if (indexes.length === 0) {
    for (let ix = lastIndexes; ix >= 0; ix--) {
      const it = indexDefault[ix]
      if (it >= 0 && it < len) indexSet.add(it)
      else if (it < 0 && len >= -it) indexSet.add(it + len)
    }
  } else {
    for (let ix = lastIndexes; ix >= 0; ix--) {
      const item = indexes[ix]
      if (Array.isArray(item)) {
        const [startX, endX, stepX] = item as [number | null, number | null, number]
        let start = startX ?? 0
        if (start < 0) start += len
        let end = endX ?? len - 1
        if (end < 0) end += len
        if ((start < 0 && end < 0) || (start >= len && end >= len)) continue
        if (start >= len) start = len - 1
        else if (start < 0) start = 0
        if (end >= len) end = len - 1
        else if (end < 0) end = 0
        if (start === end || stepX >= len) { indexSet.add(start); continue }
        const step = stepX > 0 ? stepX : (-stepX < len ? stepX + len : 1)
        if (end > start) for (let i = start; i <= end; i += step) indexSet.add(i)
        else for (let i = start; i >= end; i -= step) indexSet.add(i)
      } else {
        const it = item as number
        if (it >= 0 && it < len) indexSet.add(it)
        else if (it < 0 && len >= -it) indexSet.add(it + len)
      }
    }
  }

  if (split === '!') {
    return elements.filter((_, i) => !indexSet.has(i))
  }

  const result: Element[] = []
  for (const i of indexSet) { if (i < len && elements[i]) result.push(elements[i]) }
  return result
}

