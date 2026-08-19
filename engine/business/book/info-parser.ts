// ============================================
// 书籍详情解析 — 纯函数（对齐 Legado BookInfo）
// ============================================

import { getString, getStringList, resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource } from '../../types.js'

const INTRO_MAX_LENGTH = 500

function cleanIntro(intro: string, maxLength: number = INTRO_MAX_LENGTH): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

function isHtmlContent(str: string): boolean {
  return str.startsWith('<') && str.includes('>') && str.length > 100
}

export async function parseBookInfo(
  source: EngineBookSource,
  html: string,
  finalRedirectUrl: string,
  canReName = true,
): Promise<Partial<EngineBook>> {
  const rule = source.ruleBookInfo
  if (!rule) return {}

  const bookPlaceholder: Partial<EngineBook> = {}
  const ctx = { source, baseUrl: finalRedirectUrl, result: html, book: bookPlaceholder }
  let workingHtml = html

  if (rule.init) {
    try {
      const { getElement } = await import('../../parser/index.js')
      const initResult = await getElement(workingHtml, rule.init, ctx)
      if (initResult) {
        const initHtml =
          typeof initResult === 'string'
            ? initResult
            : initResult.outerHTML || initResult.html || initResult
        if (initHtml && typeof initHtml === 'string') {
          workingHtml = initHtml
          ctx.result = initHtml
        }
      }
    } catch {
      // 忽略 init 失败，继续用原始 HTML
    }
  }

  const mCanReName = canReName && !!(rule as any).canReName

  const rawName = (await getString(workingHtml, rule.name || '', ctx)) || ''
  const name = rawName.trim()
  if (name && (mCanReName || !bookPlaceholder.name)) {
    bookPlaceholder.name = name
  }

  const rawAuthor = (await getString(workingHtml, rule.author || '', ctx)) || ''
  const author = rawAuthor.replace(/^\s*作\s*者[:：\s]+|\s+著$/g, '').trim()
  if (author && (mCanReName || !bookPlaceholder.author)) {
    bookPlaceholder.author = author
  }

  let kind = ''
  try {
    const kindList = await getStringList(workingHtml, rule.kind || '', ctx)
    if (kindList && kindList.length > 0) {
      kind = kindList.join(',')
      bookPlaceholder.kind = kind
    }
  } catch {
    // ignore
  }

  let wordCount = ''
  try {
    const rawWordCount = (await getString(workingHtml, (rule as any).wordCount || '', ctx)) || ''
    if (rawWordCount && !isHtmlContent(rawWordCount)) {
      wordCount = rawWordCount
    }
  } catch {
    // ignore
  }

  const lastChapter = (await getString(workingHtml, rule.lastChapter || '', ctx)) || ''

  let intro = ''
  try {
    const rawIntro = (await getString(workingHtml, rule.intro || '', ctx)) || ''
    const introTrimS = rawIntro.trimStart()
    if (
      introTrimS.startsWith('<usehtml>') ||
      introTrimS.startsWith('<md>') ||
      introTrimS.startsWith('<useweb>')
    ) {
      intro = introTrimS
    } else {
      intro = cleanIntro(rawIntro)
    }
  } catch {
    // ignore
  }

  let coverUrl: string | null = null
  try {
    const rawCover = (await getString(workingHtml, rule.coverUrl || '', ctx)) || ''
    if (rawCover && !isHtmlContent(rawCover)) {
      coverUrl = resolveUrl(rawCover, finalRedirectUrl)
    }
  } catch {
    // ignore
  }

  let tocUrl = finalRedirectUrl
  if (rule.tocUrl && rule.tocUrl !== '{{baseUrl}}') {
    try {
      const parsedTocUrl = (await getString(workingHtml, rule.tocUrl, ctx)) || ''
      if (parsedTocUrl && !parsedTocUrl.startsWith('<') && parsedTocUrl !== workingHtml) {
        tocUrl = parsedTocUrl
      }
    } catch {
      // ignore
    }
  }

  const resolvedTocUrl =
    tocUrl === finalRedirectUrl
      ? finalRedirectUrl
      : resolveUrl(String(tocUrl), finalRedirectUrl)

  return {
    name: bookPlaceholder.name ? String(bookPlaceholder.name).trim() : (name || '未命名'),
    author: bookPlaceholder.author ? String(bookPlaceholder.author).trim() : (author || '未知作者'),
    coverUrl,
    intro: intro || null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount: wordCount || null,
    tocUrl: resolvedTocUrl || null,
  }
}
