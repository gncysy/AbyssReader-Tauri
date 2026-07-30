// ============================================
// 段落重排（完整对齐 Legado ContentHelp.kt）
// ============================================

const MARK_SENTENCES_END = '？。！?!~'
const MARK_SENTENCES_END_P = '.？。！?!~'
const MARK_SENTENCES_MID = '.,，、\u2014\u2026'
const MARK_SENTENCES_SAY = '问说喊唱叫骂道着答'
const MARK_QUOTATION_BEFORE = '，：,:'
const MARK_QUOTATION = '"' + "'" + '\u201C\u201D'
const MARK_QUOTATION_RIGHT = '"' + '\u201D'
const WORD_MAX_LENGTH = 16

function match(rule: string, chr: string): boolean {
  return rule.indexOf(chr) !== -1
}

function seekLast(str: string, key: string, from: number, to: number): number {
  if (str.length - from < 1) return -1
  let i = str.length - 1
  if (from < i && i > 0) i = from
  let t = 0
  if (to > 0) t = to
  while (i > t) {
    const c = str[i]
    if (key.indexOf(c) !== -1) return i
    i--
  }
  return -1
}

function seekIndex(str: string, key: string, from: number, to: number, inOrder: boolean): number {
  if (str.length - from < 1) return -1
  let i = 0
  if (from > 0) i = from
  const t = Math.min(str.length, to > 0 ? to : str.length)
  while (i < t) {
    const c = inOrder ? str[i] : str[str.length - i - 1]
    if (key.indexOf(c) !== -1) return i
    i++
  }
  return -1
}

function seekIndexes(str: string, key: string, from: number, to: number, inOrder: boolean): number[] {
  const list: number[] = []
  if (str.length - from < 1) return list
  let i = from > 0 ? from : 0
  const t = Math.min(str.length, to > 0 ? to : str.length)
  while (i < t) {
    const c = inOrder ? str[i] : str[str.length - i - 1]
    if (key.indexOf(c) !== -1) {
      if (list.length > 0 && i - list[list.length - 1] === 1) {
        list[list.length - 1] = i
      } else {
        list.push(i)
      }
    }
    i++
  }
  return list
}

function makeDict(str: string): string[] {
  const patten = new RegExp('(?<=["' + "'" + '\u201C\u201D])([^\\n\\p{P}]{1,' + WORD_MAX_LENGTH + '})(?=["' + "'" + '\u201C\u201D])', 'gu')
  const cache: string[] = []
  const dict: string[] = []
  let matcher: RegExpExecArray | null
  while ((matcher = patten.exec(str)) !== null) {
    const word = matcher[0]
    if (cache.includes(word)) {
      if (!dict.includes(word)) dict.push(word)
    } else {
      cache.push(word)
    }
  }
  return dict
}

function forceSplit(str: string, offset: number, min: number, gain: number, trigger: number): number[] {
  const result: number[] = []
  const arrayEnd = seekIndexes(str, MARK_SENTENCES_END_P, 0, str.length - 2, true)
  const arrayMid = seekIndexes(str, MARK_SENTENCES_MID, 0, str.length - 2, true)
  if (arrayEnd.length < trigger && arrayMid.length < trigger * 3) return result
  let j = 0
  let i = min
  while (i < arrayEnd.length) {
    let k = 0
    while (j < arrayMid.length) {
      if (arrayMid[j] < arrayEnd[i]) k++
      j++
    }
    if (Math.random() * gain < 0.8 + k / 2.5) {
      result.push(arrayEnd[i] + offset)
      i = Math.max(i + min, i)
    }
    i++
  }
  return result
}

const PARAGRAPH_DIAGLOG = /^["\u201C\u201D][^"\u201C\u201D]+["\u201C\u201D]$/

function splitQuote(str: string): string {
  const length = str.length
  if (length < 3) return str
  if (match(MARK_QUOTATION, str[0])) {
    const i = seekIndex(str, MARK_QUOTATION, 1, length - 2, true) + 1
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, str[i - 1])) {
      return str.substring(0, i) + '\n' + str.substring(i)
    }
  } else if (match(MARK_QUOTATION, str[length - 1])) {
    const i = length - 1 - seekIndex(str, MARK_QUOTATION, 1, length - 2, false)
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, str[i - 1])) {
      return str.substring(0, i) + '\n' + str.substring(i)
    }
  }
  return str
}

function reduceLength(str: StringBuilder): StringBuilder {
  const p = str.toString().split('\n')
  const l = p.length
  const b: boolean[] = new Array(l)
  for (let i = 0; i < l; i++) {
    b[i] = PARAGRAPH_DIAGLOG.test(p[i])
  }
  let dialogue = 0
  for (let i = 0; i < l; i++) {
    if (b[i]) {
      if (dialogue < 0) dialogue = 1
      else if (dialogue < 2) dialogue++
    } else {
      if (dialogue > 1) {
        p[i] = splitQuote(p[i])
        dialogue--
      } else if (dialogue > 0 && i < l - 2) {
        if (b[i + 1]) p[i] = splitQuote(p[i])
      }
    }
  }
  const string = new StringBuilder()
  for (let i = 0; i < l; i++) {
    string.append('\n')
    string.append(p[i])
  }
  return string
}

// ─── StringBuilder 简化实现 ───
class StringBuilder {
  private parts: string[] = []
  append(s: string): void { this.parts.push(s) }
  charAt(index: number): string { return this.toString()[index] || '' }
  setCharAt(index: number, ch: string): void {
    const s = this.toString()
    this.parts = [s.substring(0, index) + ch + s.substring(index + 1)]
  }
  toString(): string { return this.parts.join('') }
  get length(): number { return this.toString().length }
  last(): string { const s = this.toString(); return s[s.length - 1] || '' }
}

function findNewLines(str: string, dict: string[]): string {
  const string = new StringBuilder()
  string.append(str)
  const arrayQuote: number[] = []
  let insN: number[] = []
  const mod: number[] = new Array(str.length).fill(0)
  let waitClose = false

  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (match(MARK_QUOTATION, c)) {
      const size = arrayQuote.length
      if (size > 0) {
        const quotePre = arrayQuote[size - 1]
        if (i - quotePre === 2) {
          let remove = false
          if (waitClose) {
            if (match(',，、/', str[i - 1])) remove = true
          } else if (match(',，、/和与或', str[i - 1])) {
            remove = true
          }
          if (remove) {
            string.setCharAt(i, '\u201C')
            string.setCharAt(i - 2, '\u201D')
            arrayQuote.splice(size - 1, 1)
            mod[size - 1] = 1
            mod[size] = -1
            continue
          }
        }
      }
      arrayQuote.push(i)
      if (i > 1) {
        const charB1 = str[i - 1]
        let charB2 = '\x00'
        if (match(MARK_QUOTATION_BEFORE, charB1)) {
          if (arrayQuote.length > 1) {
            const lastQuote = arrayQuote[arrayQuote.length - 2]
            let p = 0
            if (charB1 === ',' || charB1 === '，') {
              if (arrayQuote.length > 2) {
                p = arrayQuote[arrayQuote.length - 3]
                if (p > 0) charB2 = str[p - 1]
              }
            }
            if (match(MARK_SENTENCES_END_P, charB2)) {
              insN.push(p - 1)
            } else if (!match('的', charB2)) {
              const lastEnd = seekLast(str, MARK_SENTENCES_END, i, lastQuote)
              if (lastEnd > 0) insN.push(lastEnd)
              else insN.push(lastQuote)
            }
          }
          waitClose = true
          mod[size] = 1
          if (size > 0) {
            mod[size - 1] = -1
            if (size > 1) mod[size - 2] = 1
          }
        } else if (waitClose) {
          waitClose = false
          insN.push(i)
        }
      }
    }
  }
  const size = arrayQuote.length
  let opend = false
  if (size > 0) {
    for (let i = 0; i < size; i++) {
      if (mod[i] > 0) opend = true
      else if (mod[i] < 0) {
        if (!opend && i > 0) mod[i] = 3
        opend = false
      } else {
        opend = !opend
        mod[i] = opend ? 2 : -2
      }
    }
    if (opend) {
      if (arrayQuote[size - 1] - string.length > -3) {
        if (size > 1) mod[size - 2] = 4
        mod[size - 1] = -4
      } else if (!match(MARK_SENTENCES_SAY, string.toString()[string.length - 2])) {
        string.append('\u201D')
      }
    }
    let loop2Mod1 = -1
    let loop2Mod2: number
    let i = 0
    let j = arrayQuote[0] - 1
    if (j < 0) { i = 1; loop2Mod1 = 0 }
    while (i < size) {
      j = arrayQuote[i] - 1
      loop2Mod2 = mod[i]
      if (loop2Mod1 < 0 && loop2Mod2 > 0) {
        if (match(MARK_SENTENCES_END, string.toString()[j])) insN.push(j)
      }
      loop2Mod1 = loop2Mod2
      i++
    }
  }

  // 字典验证
  const insN1: number[] = []
  for (const n of insN) {
    if (match('"\'"\u201C\u201D', string.toString()[n])) {
      const start = seekLast(str, '"' + "'" + '\u201C\u201D', n - 1, n - WORD_MAX_LENGTH)
      if (start > 0) {
        const word = str.substring(start + 1, n)
        if (dict.includes(word)) continue
        if (match('的地得', str[start])) continue
      }
    }
    insN1.push(n)
  }
  insN = [...new Set(insN1)].sort((a, b) => a - b)

  // 随机断句
  const s = string.toString()
  let j = 0
  let progress = 0
  let nextLine = -1
  if (insN.length > 0) nextLine = insN[j]
  let gain = 3
  let min = 0
  let trigger = 2
  for (let ai = 0; ai < arrayQuote.length; ai++) {
    const qutoe = arrayQuote[ai]
    if (qutoe > 0) { gain = 4; min = 2; trigger = 4 }
    else { gain = 3; min = 0; trigger = 2 }

    while (j < insN.length) {
      if (nextLine >= qutoe) break
      nextLine = insN[j]
      if (progress < nextLine) {
        const subs = s.substring(progress, nextLine)
        insN.push(...forceSplit(subs, progress, min, gain, trigger))
        progress = nextLine + 1
      }
      j++
    }
    if (progress < qutoe) {
      const subs = s.substring(progress, qutoe + 1)
      insN.push(...forceSplit(subs, progress, min, gain, trigger))
      progress = qutoe + 1
    }
  }
  while (j < insN.length) {
    nextLine = insN[j]
    if (progress < nextLine) {
      const subs = s.substring(progress, nextLine)
      insN.push(...forceSplit(subs, progress, min, gain, trigger))
      progress = nextLine + 1
    }
    j++
  }
  if (progress < s.length) {
    const subs = s.substring(progress, s.length)
    insN.push(...forceSplit(subs, progress, min, gain, trigger))
  }

  // 修正引号方向
  const insQuote: boolean[] = new Array(size).fill(false)
  opend = false
  for (let i = 0; i < size; i++) {
    const p = arrayQuote[i]
    if (mod[i] > 0) {
      string.setCharAt(p, '\u201C')
      if (opend) insQuote[i] = true
      opend = true
    } else if (mod[i] < 0) {
      string.setCharAt(p, '\u201D')
      opend = false
    } else {
      opend = !opend
      string.setCharAt(p, opend ? '\u201C' : '\u201D')
    }
  }
  insN = [...new Set(insN)].sort((a, b) => a - b)

  // 拼接
  const buffer = new StringBuilder()
  j = 0
  progress = 0
  nextLine = -1
  if (insN.length > 0) nextLine = insN[j]
  for (let i = 0; i < arrayQuote.length; i++) {
    const quote = arrayQuote[i]
    while (j < insN.length) {
      if (nextLine >= quote) break
      nextLine = insN[j]
      buffer.append(string.toString().substring(progress, nextLine + 1))
      buffer.append('\n')
      progress = nextLine + 1
      j++
    }
    if (progress < quote) {
      buffer.append(string.toString().substring(progress, quote + 1))
      progress = quote + 1
    }
    if (insQuote[i] && buffer.length > 2) {
      const bufStr = buffer.toString()
      if (bufStr[bufStr.length - 1] === '\n') buffer.append('\u201C')
      else {
        buffer.parts = [bufStr.substring(0, bufStr.length - 1) + '\u201D\n' + bufStr[bufStr.length - 1]]
      }
    }
  }
  while (j < insN.length) {
    nextLine = insN[j]
    if (progress <= nextLine) {
      buffer.append(string.toString().substring(progress, nextLine + 1))
      buffer.append('\n')
      progress = nextLine + 1
    }
    j++
  }
  if (progress < string.length) {
    buffer.append(string.toString().substring(progress))
  }
  return buffer.toString()
}

export function reSegment(content: string, chapterName: string): string {
  if (!content) return content
  try {
    let content1 = content
    const dict = makeDict(content1)
    let p = content1
      .replace(/&quot;/g, '"')
      .replace(/[:：]['"'"\u201C\u201D]+/g, '："')
      .replace(/["\u201C\u201D]+\\s*["\u201C\u201D][\\s"\u201C\u201D]*/g, '"\n"')
      .split(/\n(\s*)/)

    let buffer = new StringBuilder()
    buffer.append('  ')
    if (chapterName.trim() !== (p[0] || '').trim()) {
      buffer.append(p[0].replace(/[\u3000\s]+/g, ''))
    }

    for (let i = 1; i < p.length; i++) {
      if (match(MARK_SENTENCES_END, buffer.last())
        || (match(MARK_QUOTATION_RIGHT, buffer.last())
            && buffer.length >= 2
            && match(MARK_SENTENCES_END, buffer.toString()[buffer.length - 2]))
      ) {
        buffer.append('\n')
      }
      buffer.append(p[i].replace(/[\u3000\s]+/g, ''))
    }

    p = buffer.toString()
      .replace(/["\u201C\u201D]+\s*["\u201C\u201D]+/g, '"\n"')
      .replace(/["\u201C\u201D]+(？。！?!~)["\u201C\u201D]+/g, '"$1\n"')
      .replace(/["\u201C\u201D]+(？。！?!~)([^"\u201C\u201D])/g, '"$1\n$2')
      .replace(/([问说喊唱叫骂道着答])[.。]/g, '$1。\n')
      .split('\n')

    buffer = new StringBuilder()
    for (const s of p) {
      buffer.append('\n')
      buffer.append(findNewLines(s, dict))
    }
    buffer = reduceLength(buffer)
    content1 = buffer.toString()
      .replace(/^\s+/, '')
      .replace(/\s*["\u201C\u201D]+\s*["\u201C\u201D][\s"\u201C\u201D]*/g, '"\n"')
      .replace(/[:：][\u201C\u201D"\s]+/g, '："')
      .replace(/\n(["'\u201C\u201D])([^\n"'\u201C\u201D]+)([,:，：]["\u201C\u201D])([^\n"'\u201C\u201D]+)/g, '\n$1："$4')
      .replace(/\n(\s*)/g, '\n')
    return content1
  } catch {
    return content
  }
}
