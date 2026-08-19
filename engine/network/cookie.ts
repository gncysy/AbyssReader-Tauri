// ============================================
// Cookie 管理
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
    return cookies.map((c: Cookie) => c.toString()).join('; ')
  }

  async getCookies(url: string): Promise<Cookie[]> {
    return this.jar.getCookies(url)
  }

  async getCookieValue(url: string, key: string): Promise<string> {
    const cookies = await this.jar.getCookies(url)
    const found = cookies.find((c: Cookie) => c.key === key)
    return found?.value || ''
  }

  clear(): void {
    this.jar = new CookieJar()
  }

  getJar(): CookieJar {
    return this.jar
  }
}
