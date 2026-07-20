// ============================================
// T9 - Cookie 管理
// ============================================

import { CookieJar, Cookie } from 'tough-cookie'

export class CookieManager {
  private jar: CookieJar

  constructor(jar?: CookieJar) {
    this.jar = jar || new CookieJar()
  }

  async setCookie(cookie: string | Cookie, url: string): Promise<void> {
    await this.jar.setCookie(cookie, url)
  }

  async getCookieString(url: string): Promise<string> {
    const cookies = await this.jar.getCookies(url)
    return cookies.map(c => c.toString()).join('; ')
  }

  async getCookies(url: string): Promise<Cookie[]> {
    return this.jar.getCookies(url)
  }

  async getCookieValue(url: string, key: string): Promise<string> {
    const cookies = await this.jar.getCookies(url)
    const found = cookies.find(c => c.key === key)
    return found?.value || ''
  }

  async removeCookie(key: string, url: string): Promise<void> {
    const cookies = await this.jar.getCookies(url)
    const filtered = cookies.filter(c => c.key !== key)
    if (filtered.length === cookies.length) return
    const serialized = await this.jar.serialize()
    const newSerialized = { ...serialized, cookies: serialized.cookies.filter((c: any) => c.key !== key) }
    this.jar = await CookieJar.deserialize(newSerialized) as CookieJar
  }

  clear(): void {
    this.jar = new CookieJar()
  }

  async export(): Promise<any> {
    return this.jar.serialize()
  }

  async import(data: any): Promise<void> {
    this.jar = await CookieJar.deserialize(data) as CookieJar
  }

  getJar(): CookieJar {
    return this.jar
  }
}
