// ============================================
// useBase64Content — base64 内容解码（UTF-8 安全）
// ============================================

export function useBase64Content() {
  function decodeBase64(base64: string): string {
    try {
      // 使用 fetch + Blob 方式，正确处理 UTF-8
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      // 使用 TextDecoder 正确处理多字节字符
      return new TextDecoder('utf-8').decode(bytes)
    } catch {
      return ''
    }
  }

  return { decodeBase64 }
}
