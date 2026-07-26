import { emitLog } from '../event/index.js'
// ============================================
// 目录解析（对齐 Legado BookChapterList）
// ============================================

import { getGlobalHttpClient } from '../network/client.js'
import { getString, getElements } from '../core/rule-parser/index.js'
import { executeJsonPath } from '../core/rule-parser/jsonpath.js'
import { parseRule } from '../core/rule-parser/index.js'
import { resolveUrl } from '../core/url/index.js'
import type { BookSource, Chapter } from '../../src/shared/types.js'
import type { TocOptions } from '../types.js'

const tocCache = new Map<string, { chapters: Chapter[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

function isJsonString(str: string): boolean { const t = str.trim(); return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']')) }
function safeParseJson(str: string): any { try { return JSON.parse(str) } catch { return null } }

export async function parseHeader(source: BookSource, book: any): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try { if (source.header) { if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) { const { executeJs } = await import('../core/rule-parser/js.js'); const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: book || {} }; const headerResult = await executeJs('', source.header, ctx); emitLog('debug', '[目录] header结果: ' + (headerResult ? headerResult.substring(0, 200) : '空')); try { const parsed = JSON.parse(headerResult); Object.assign(result, parsed); } catch { try { const parsed = JSON.parse(headerResult.replace(/'/g, '"')); Object.assign(result, parsed); } catch {} } } else { try { Object.assign(result, JSON.parse(source.header)) } catch { try { Object.assign(result, JSON.parse((source.header || '{}').replace(/'/g, '"'))) } catch {} } } } } catch {}
  return result
}

export async function getToc(source: BookSource, tocUrl: string, options: TocOptions = {}): Promise<Chapter[]> {
  emitLog('info', '[目录] 开始 url=' + tocUrl.substring(0, 100))
  if (!tocUrl) return []
  const cacheKey = (source.bookSourceUrl || '') + '::' + tocUrl; const cached = tocCache.get(cacheKey); if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.chapters
  const httpClient = getGlobalHttpClient(); const rule = source.ruleToc; if (!rule || !rule.chapterList) return []
  let html = options.cachedHtml || null; let finalRedirectUrl = options.redirectUrl || tocUrl
  const headers = await parseHeader(source, options.book || {})
  if (!html) {
    try { const { analyzeUrl } = await import('../core/url/index.js'); const book = options.book || {}; const bookForUrl = { ...book, kind: (book as any).kind || (options as any).bookKind || (book as any).resourceID || '' }; const urlAnalysis = await analyzeUrl(tocUrl, { source, book: bookForUrl, baseUrl: source.bookSourceUrl || '', headerMap: headers }); let requestBody: string | undefined = undefined; if (urlAnalysis.method === 'POST' && urlAnalysis.body) { if (typeof urlAnalysis.body === 'string') { requestBody = urlAnalysis.body } else if (typeof urlAnalysis.body === 'object') { requestBody = JSON.stringify(urlAnalysis.body) } }; const response = await httpClient.request({ url: urlAnalysis.url, method: urlAnalysis.method, headers: urlAnalysis.headers, body: requestBody, timeout: 30000, useWebView: urlAnalysis.useWebView, webJs: urlAnalysis.webJs, sourceType: source.bookSourceType ?? 0 }); if (response.status < 200 || response.status >= 300) return []; html = response.data as string; if (response.url && response.url !== tocUrl) finalRedirectUrl = response.url }
    catch (err) { console.warn('[Toc] 请求失败:', err); return [] }
  }
  if (!html || typeof html !== 'string') return []
  emitLog('debug', '[目录] HTML长度=' + html.length + ' 有chapter-items=' + html.includes('chapter-items'))
  const contextBook = options.book || {}
  let listRule = rule.chapterList || ''; let reverse = false; if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) } if (listRule.startsWith('+')) { listRule = listRule.substring(1) }
  const isJson = isJsonString(html); const parsedData = isJson ? safeParseJson(html) : html
  const ctx = { source, baseUrl: source.bookSourceUrl, result: parsedData, book: contextBook }
  let elements = await getElements(parsedData, listRule, ctx); if (elements && typeof elements === 'object' && typeof elements.size === 'function' && !Array.isArray(elements)) { const arr: any[] = []; for (let i = 0; i < elements.size(); i++) { arr.push(elements.get(i)) } elements = arr }
  if (!Array.isArray(elements) || elements.length === 0) { if (isJson && parsedData?.data?.list) { return parseJsonChapters(parsedData.data.list, rule, source, finalRedirectUrl, reverse) } return [] }
  const nameRule = rule.chapterName || ''; const urlRule = rule.chapterUrl || ''; const vipRule = rule.isVip || ''; const payRule = rule.isPay || ''
  const urlRuleHasJs = urlRule.includes('@js:') || urlRule.includes('<js>'); let urlRulesCache: SourceRule[] | null = null; if (urlRuleHasJs) { try { urlRulesCache = parseRule(urlRule, false) } catch {} }
  const chapters: Chapter[] = []
  for (const item of elements) { let safeItem: any = item; if (item === null || item === undefined) continue; try { safeItem = JSON.parse(JSON.stringify(item)) } catch {}; const itemCtx = { ...ctx, result: safeItem, book: contextBook }; const title = await getString(safeItem, nameRule, itemCtx) || ''; let url = ''; let deferredJs: string | undefined; let deferredResult: any; if (urlRuleHasJs && urlRulesCache) { let tempResult: any = safeItem; const jsRules: any[] = []; for (const sr of urlRulesCache) { if (sr.mode === 'js') { jsRules.push(sr) } else { tempResult = await getString(tempResult, sr.rule, { ...itemCtx, result: tempResult }) || tempResult } } if (jsRules.length > 0) { deferredResult = tempResult; deferredJs = jsRules.map(sr => sr.rule).join('\n') } else { url = typeof tempResult === 'string' ? tempResult : '' } } else { url = await getString(safeItem, urlRule, itemCtx) || '' }; if (title) { const isVip = vipRule ? await getString(safeItem, vipRule, itemCtx) === 'true' : false; const isPay = payRule ? await getString(safeItem, payRule, itemCtx) === 'true' : false; if (!url) url = finalRedirectUrl; chapters.push({ id: chapters.length, title: String(title), url: resolveUrl(String(url), finalRedirectUrl), index: chapters.length, isVip, isPay, _deferredJs: deferredJs, _deferredResult: deferredResult } as Chapter) } }
  if (reverse) chapters.reverse(); chapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx }); tocCache.set(cacheKey, { chapters, timestamp: Date.now() }); return chapters
}

function parseJsonChapters(list: any[], rule: any, source: BookSource, baseUrl: string, reverse: boolean): Chapter[] { const chapters: Chapter[] = []; for (const item of list) { const title = item.chapterName || item.title || item.name || ''; const url = item.chapterId ? `/chapter/${item.chapterId}` : item.url || item.path || ''; if (title) { chapters.push({ id: chapters.length, title: String(title), url: resolveUrl(String(url), baseUrl), index: chapters.length, isVip: !!(item.isFree === 0 || item.isVip), isPay: !!(item.isChapterBuy || item.isPay) } as Chapter) } } if (reverse) chapters.reverse(); chapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx }); return chapters }

interface SourceRule { mode: string; rule: string; replaceRegex?: string; replacement?: string; replaceFirst?: boolean; putMap?: Record<string, string> }


