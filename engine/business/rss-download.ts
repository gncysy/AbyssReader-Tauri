// ============================================
// RSS 下载检测与导入
// ============================================

import { network, store, source as sourceApi } from '../../src/api/index.js'

export interface DownloadInfo {
  url: string
  resourceType: string
}

export async function executeDownloadImport(info: DownloadInfo): Promise<string> {
  switch (info.resourceType) {
    case 'bookSource': {
      const count = await installBookSources(info.url)
      return `已安装 ${count} 个书源`
    }
    case 'rssSource': {
      const existingSources = (await store.get('rssSources')) || []
      const count = await installRssSources(info.url, existingSources)
      await store.set('rssSources', existingSources)
      return `已安装 ${count} 个订阅源`
    }
    case 'replaceRule': {
      const count = await installReplaceRules(info.url)
      return `已导入 ${count} 条替换规则`
    }
    case 'txtTocRule': {
      const count = await installTxtTocRules(info.url)
      return `已导入 ${count} 条目录规则`
    }
    case 'purifyRule': {
      await installPurifyRule(info.url)
      return '已导入净化规则'
    }
    default:
      return '文件已保存到下载目录'
  }
}

async function installBookSources(url: string): Promise<number> {
  const content = await network.fetch(url, { method: 'GET' })
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const data = JSON.parse(text)
  const items = Array.isArray(data) ? data : [data]
  for (const item of items) {
    await sourceApi.add(JSON.stringify(item))
  }
  return items.length
}

async function installRssSources(url: string, existingSources: any[]): Promise<number> {
  const content = await network.fetch(url, { method: 'GET' })
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const data = JSON.parse(text)
  const items = Array.isArray(data) ? data : [data]
  let count = 0
  const existing = new Set(existingSources.map((s: any) => s.sourceUrl))
  for (const item of items) {
    if (item.sourceUrl && !existing.has(item.sourceUrl)) {
      existingSources.push(item)
      existing.add(item.sourceUrl)
      count++
    }
  }
  return count
}

async function installReplaceRules(url: string): Promise<number> {
  const content = await network.fetch(url, { method: 'GET' })
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const rules = JSON.parse(text)
  const existing: any[] = (await store.get('replaceRule')) || []
  const incoming = Array.isArray(rules) ? rules : [rules]
  let count = 0
  for (const rule of incoming) {
    if (!existing.find((r: any) => r.name === rule.name && r.pattern === rule.pattern)) {
      existing.push(rule)
      count++
    }
  }
  if (count > 0) await store.set('replaceRule', existing)
  return count
}

async function installTxtTocRules(url: string): Promise<number> {
  const content = await network.fetch(url, { method: 'GET' })
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const rules = JSON.parse(text)
  const items = Array.isArray(rules) ? rules : [rules]
  await store.set('txtTocRule', items)
  return items.length
}

async function installPurifyRule(url: string): Promise<void> {
  const content = await network.fetch(url, { method: 'GET' })
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  await store.set('purifyRule', text)
}
