// ============================================
// DomProvider — DOM 操作接口 + 注入机制
// ============================================

export interface DomNode {
    tag: string
    attrs: Record<string, string>
    children: DomNode[]
    textContent: string | null
    innerHTML: string
    outerHTML: string
    getAttribute(name: string): string | null
    setAttribute(name: string, value: string): void
    querySelector(selector: string): DomNode | null
    querySelectorAll(selector: string): DomNode[]
    getElementsByTagName(name: string): DomNode[]
    getElementsByClassName(name: string): DomNode[]
    parentNode: DomNode | null
    nextSibling: DomNode | null
    previousSibling: DomNode | null
    remove(): void
    ownText(): string
    textNodes(): string[]
    evaluateXPath(xpath: string): DomNode[]
}

export interface DomDocument {
    querySelector(selector: string): DomNode | null
    querySelectorAll(selector: string): DomNode[]
    getElementById(id: string): DomNode | null
    getElementsByTagName(name: string): DomNode[]
    getElementsByClassName(name: string): DomNode[]
    body: DomNode | null
    head: DomNode | null
    documentElement: DomNode | null
    createElement(tag: string): DomNode
    createTextNode(text: string): DomNode
    textContent: string | null
    innerHTML: string
    outerHTML: string
    evaluateXPath(xpath: string): DomNode[]
}

export interface DomProvider {
    parseHTML(html: string, baseUrl?: string): DomDocument
    createDocument(): DomDocument
    parseXML(xml: string, baseUrl?: string): DomDocument
}

let globalDomProvider: DomProvider | null = null

export function setDomProvider(provider: DomProvider): void {
    globalDomProvider = provider
}

export function getDomProvider(): DomProvider {
    if (!globalDomProvider) {
        throw new Error('[DomProvider] 未注入，请先调用 setDomProvider()')
    }
    return globalDomProvider
}
