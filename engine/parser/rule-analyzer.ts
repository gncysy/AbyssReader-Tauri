// ============================================
// RuleAnalyzer — 规则字符串拆分（对齐 Legado）
// ============================================

const ESC = '\\'

export class RuleAnalyzer {
  private queue: string
  private pos = 0
  private start = 0
  private startX = 0
  private rule: string[] = []
  private step = 0
  elementsType = ''
  private code: boolean

  constructor(data: string, code = false) {
    this.queue = data
    this.code = code
  }

  trim(): void {
    if (this.pos >= this.queue.length) return
    if (this.queue[this.pos] === '@' || this.queue[this.pos] < '!') {
      this.pos++
      while (this.pos < this.queue.length && (this.queue[this.pos] === '@' || this.queue[this.pos] < '!')) this.pos++
      this.start = this.pos
      this.startX = this.pos
    }
  }

  reSetPos(): void {
    this.pos = 0
    this.startX = 0
  }

  private consumeTo(seq: string): boolean {
    this.start = this.pos
    const offset = this.queue.indexOf(seq, this.pos)
    if (offset !== -1) {
      this.pos = offset
      return true
    }
    return false
  }

  private consumeToAny(...seq: string[]): boolean {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) {
        if (this.queue.substring(pos, pos + s.length) === s) {
          this.step = s.length
          this.pos = pos
          return true
        }
      }
      pos++
    }
    return false
  }

  private findToAny(...seq: string[]): number {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) {
        if (this.queue[pos] === s) return pos
      }
      pos++
    }
    return -1
  }

  private chompCodeBalanced(open: string, close: string): boolean {
    let pos = this.pos
    let depth = 0
    let otherDepth = 0
    let inSingleQuote = false
    let inDoubleQuote = false

    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c !== ESC) {
        if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
        else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

        if (inSingleQuote || inDoubleQuote) continue

        if (c === '[') depth++
        else if (c === ']') depth--
        else if (depth === 0) {
          if (c === open) otherDepth++
          else if (c === close) otherDepth--
        }
      } else pos++
    } while (depth > 0 || otherDepth > 0)

    if (depth > 0 || otherDepth > 0) return false
    this.pos = pos
    return true
  }

  private chompRuleBalanced(open: string, close: string): boolean {
    let pos = this.pos
    let depth = 0
    let inSingleQuote = false
    let inDoubleQuote = false

    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
      else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

      if (inSingleQuote || inDoubleQuote) continue
      else if (c === '\\') {
        pos++
        continue
      }

      if (c === open) depth++
      else if (c === close) depth--
    } while (depth > 0)

    if (depth > 0) return false
    this.pos = pos
    return true
  }

  private get chompBalanced() {
    return this.code
      ? (open: string, close: string) => this.chompCodeBalanced(open, close)
      : (open: string, close: string) => this.chompRuleBalanced(open, close)
  }

  /**
   * 公开入口：splitRule("&&", "||", "%%")
   * 或 splitRule("@")
   */
  splitRule(...split: string[]): string[] {
    this.rule = []

    // DIFF-6 修复：拆之前先调用 trim()，跳过开头的空白和 @ 字符
    this.trim()

    // 单分隔符：直接进入二段匹配
    if (split.length === 1) {
      this.elementsType = split[0]
      if (!this.consumeTo(this.elementsType)) {
        this.rule.push(this.queue.substring(this.startX))
        return this.rule
      }
      this.step = this.elementsType.length
      return this.splitRuleNext()
    }

    // 多分隔符：先找到第一个分隔符
    if (!this.consumeToAny(...split)) {
      this.rule.push(this.queue.substring(this.startX))
      return this.rule
    }

    const end = this.pos
    this.pos = this.start

    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule = [this.queue.substring(this.startX, end)]
        this.elementsType = this.queue.substring(end, end + this.step)
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      if (st > end) {
        this.rule = [this.queue.substring(this.startX, end)]
        this.elementsType = this.queue.substring(end, end + this.step)
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        if (this.pos > st) {
          this.startX = this.start
          return this.splitRuleNext()
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      this.pos = st
      const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        throw new Error(this.queue.substring(0, this.start) + '后未平衡')
      }
    } while (end > this.pos)

    this.start = this.pos
    return this.splitRule(...split)
  }

  /**
   * 二段匹配：elementsType 已确定，按 elementsType 继续切分
   */
  private splitRuleNext(): string[] {
    const end = this.pos
    this.pos = this.start

    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule.push(this.queue.substring(this.startX, end))
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      if (st > end) {
        this.rule.push(this.queue.substring(this.startX, end))
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        if (this.pos > st) {
          this.startX = this.start
          return this.splitRuleNext()
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      this.pos = st
      const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        throw new Error(this.queue.substring(0, this.start) + '后未平衡')
      }
    } while (end > this.pos)

    this.start = this.pos
    if (!this.consumeTo(this.elementsType)) {
      this.rule.push(this.queue.substring(this.startX))
      return this.rule
    }
    return this.splitRuleNext()
  }

  innerRule(
    inner: string,
    startStep = 1,
    endStep = 1,
    fr: (inner: string) => string | null | undefined,
  ): string {
    const st: string[] = []
    while (this.consumeTo(inner)) {
      const posPre = this.pos
      if (this.chompCodeBalanced('{', '}')) {
        const innerRuleStr = this.queue.substring(posPre + startStep, this.pos - endStep)
        const frv = fr(innerRuleStr)
        if (frv) {
          st.push(this.queue.substring(this.startX, posPre) + frv)
          this.startX = this.pos
          continue
        }
      }
      this.pos += inner.length
    }
    if (this.startX === 0) return ''
    st.push(this.queue.substring(this.startX))
    return st.join('')
  }

  innerRuleWithBounds(
    startStr: string,
    endStr: string,
    fr: (inner: string) => string | null | undefined,
  ): string {
    const st: string[] = []
    while (this.consumeTo(startStr)) {
      this.pos += startStr.length
      const posPre = this.pos
      if (this.consumeTo(endStr)) {
        const frv = fr(this.queue.substring(posPre, this.pos))
        st.push(
          this.queue.substring(this.startX, posPre - startStr.length) + (frv || '')
        )
        this.pos += endStr.length
        this.startX = this.pos
      }
    }
    if (this.startX === 0) return this.queue
    st.push(this.queue.substring(this.startX))
    return st.join('')
  }
}
