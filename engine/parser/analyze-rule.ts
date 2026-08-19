// ============================================
// AnalyzeRule — 主规则解析器（门面，对齐 Legado）
// ============================================

import { RuleParser } from './rule-parser.js'
import { RuleExecutor } from './rule-executor.js'
import { RuleCache } from './rule-cache.js'
import { SourceRule } from './source-rule.js'
import type { ParseContext } from '../types.js'

export class AnalyzeRule {
  private parser: RuleParser
  private executor: RuleExecutor
  private cache: RuleCache

  private content: any
  private baseUrl: string | null = null

  constructor(source?: any) {
    this.cache = new RuleCache()
    this.parser = new RuleParser()
    this.executor = new RuleExecutor(source, this.cache)
  }

  setContent(content: any, baseUrl?: string): this {
    this.content = content
    this.executor.setContent(content, baseUrl)
    if (baseUrl) this.baseUrl = baseUrl
    return this
  }

  setBaseUrl(url: string): this {
    this.baseUrl = url
    this.executor.setBaseUrl(url)
    return this
  }

  setRedirectUrl(url: string): this {
    this.executor.setRedirectUrl(url)
    return this
  }

  setVariableProvider(provider: (key: string) => string): this {
    this.executor.setVariableProvider(provider)
    return this
  }

  setVariableSetter(setter: (key: string, value: string) => void): this {
    this.executor.setVariableSetter(setter)
    return this
  }

  setWebJsExecutor(executor: (html: string, jsCode: string, baseUrl: string) => Promise<string>): this {
    this.executor.setWebJsExecutor(executor)
    return this
  }

  async getString(ruleStr: string | null, context?: ParseContext): Promise<string> {
    return this.executor.getString(ruleStr, context)
  }

  async getStringList(ruleStr: string | null, context?: ParseContext): Promise<string[]> {
    return this.executor.getStringList(ruleStr, context)
  }

  async getElements(ruleStr: string | null, context?: ParseContext): Promise<any[]> {
    return this.executor.getElements(ruleStr, context)
  }

  async getElement(ruleStr: string | null, context?: ParseContext): Promise<any | null> {
    return this.executor.getElement(ruleStr, context)
  }

  async evalJS(jsStr: string, result: any = null, context?: ParseContext): Promise<any> {
    return this.executor.evalJS(jsStr, result, context)
  }

  put(key: string, value: string): void {
    this.cache.putVariable(key, value)
  }

  get(key: string): string {
    return this.cache.getVariable(key)
  }

  splitSourceRule(ruleStr: string, allInOne = false): SourceRule[] {
    return this.parser.splitSourceRule(ruleStr, allInOne)
  }

  clearCache(): void {
    this.cache.clearAll()
  }

  isJsonString(str: string): boolean {
    return this.parser.isJsonString(str)
  }

  isHtmlString(str: string): boolean {
    return this.parser.isHtmlString(str)
  }
}
