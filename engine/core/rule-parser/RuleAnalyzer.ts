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

  constructor(data: string, code: boolean = false) {
    this.queue = data
    this.code = code
  }

  trim(): void {
    if (this.queue[this.pos] === '@' || this.queue[this.pos] < '!') {
      this.pos++
      while (this.pos < this.queue.length && (this.queue[this.pos] === '@' || this.queue[this.pos] < '!')) this.pos++
      this.start = this.pos
      this.startX = this.pos
    }
  }

  reSetPos(): void { this.pos = 0; this.startX = 0 }

  private consumeTo(seq: string): boolean {
    this.start = this.pos
    const offset = this.queue.indexOf(seq, this.pos)
    if (offset !== -1) { this.pos = offset; return true }
    return false
  }

  private consumeToAny(...seq: string[]): boolean {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) {
        if (this.queue.substring(pos, pos + s.length) === s) { this.step = s.length; this.pos = pos; return true }
      }
      pos++
    }
    return false
  }

  private findToAny(...seq: string[]): number {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) { if (this.queue[pos] === s) return pos }
      pos++
    }
    return -1
  }

  private chompCodeBalanced(open: string, close: string): boolean {
    let pos = this.pos; let depth = 0; let otherDepth = 0
    let inSQ = false; let inDQ = false
    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c !== ESC) {
        if (c === "'" && !inDQ) inSQ = !inSQ
        else if (c === '"' && !inSQ) inDQ = !inDQ
        if (inSQ || inDQ) continue
        if (c === '[') depth++
        else if (c === ']') depth--
        else if (depth === 0) {
          if (c === open) otherDepth++
          else if (c === close) otherDepth--
        }
      } else pos++
    } while (depth > 0 || otherDepth > 0)
    if (depth > 0 || otherDepth > 0) return false
    this.pos = pos; return true
  }

  private chompRuleBalanced(open: string, close: string): boolean {
    let pos = this.pos; let depth = 0
    let inSQ = false; let inDQ = false
    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c === "'" && !inDQ) inSQ = !inSQ
      else if (c === '"' && !inSQ) inDQ = !inDQ
      if (inSQ || inDQ) continue
      else if (c === '\\') { pos++; continue }
      if (c === open) depth++
      else if (c === close) depth--
    } while (depth > 0)
    if (depth > 0) return false
    this.pos = pos; return true
  }

  private get chompBalanced(): (open: string, close: string) => boolean {
    return this.code ? this.chompCodeBalanced.bind(this) : this.chompRuleBalanced.bind(this)
  }

  splitRule(...split: string[]): string[] {
    this.rule = []
    if (split.length === 1) {
      this.elementsType = split[0]
      if (!this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.startX)); return this.rule }
      this.step = this.elementsType.length; return this.splitRuleNext()
    }
    if (!this.consumeToAny(...split)) { this.rule.push(this.queue.substring(this.startX)); return this.rule }
    const end = this.pos; this.pos = this.start
    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule = [this.queue.substring(this.startX, end)]
        this.elementsType = this.queue.substring(end, end + this.step); this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step }
        this.rule.push(this.queue.substring(this.pos)); return this.rule
      }
      if (st > end) {
        this.rule = [this.queue.substring(this.startX, end)]
        this.elementsType = this.queue.substring(end, end + this.step); this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step }
        if (this.pos > st) { this.startX = this.start; return this.splitRuleNext() }
        this.rule.push(this.queue.substring(this.pos)); return this.rule
      }
      this.pos = st
      const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) throw new Error(this.queue.substring(0, this.start) + '后未平衡')
    } while (end > this.pos)
    this.start = this.pos; return this.splitRule(...split)
  }

  private splitRuleNext(): string[] {
    const end = this.pos; this.pos = this.start
    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule.push(this.queue.substring(this.startX, end)); this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step }
        this.rule.push(this.queue.substring(this.pos)); return this.rule
      }
      if (st > end) {
        this.rule.push(this.queue.substring(this.startX, end)); this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) { this.rule.push(this.queue.substring(this.start, this.pos)); this.pos += this.step }
        if (this.pos > st) { this.startX = this.start; return this.splitRuleNext() }
        this.rule.push(this.queue.substring(this.pos)); return this.rule
      }
      this.pos = st
      const next = this.queue[this.pos] === '[' ? ']' : ')'
      if (!this.chompBalanced(this.queue[this.pos], next)) throw new Error(this.queue.substring(0, this.start) + '后未平衡')
    } while (end > this.pos)
    this.start = this.pos
    if (!this.consumeTo(this.elementsType)) { this.rule.push(this.queue.substring(this.startX)); return this.rule }
    return this.splitRuleNext()
  }

  innerRule(inner: string, startStep: number = 1, endStep: number = 1, fr: (inner: string) => string | null | undefined): string {
    const st: string[] = []
    while (this.consumeTo(inner)) {
      const posPre = this.pos
      if (this.chompCodeBalanced('{', '}')) {
        const innerRule = this.queue.substring(posPre + startStep, this.pos - endStep)
        const frv = fr(innerRule)
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
}
