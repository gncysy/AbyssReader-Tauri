// ============================================
// JS 规则执行（转发到 sandbox）
// ============================================

import { executeJs as sandboxExecuteJs } from '../../sandbox/index.js'
import type { ParseContext } from '../../types.js'

export function executeJs(source: any, rule: string, context: ParseContext): any {
  return sandboxExecuteJs(rule, {
    result: source,
    src: context.src || source,
    source: context.source,
    book: context.book,
    chapter: context.chapter,
    baseUrl: context.baseUrl,
    nextChapterUrl: context.nextChapterUrl,
  })
}
