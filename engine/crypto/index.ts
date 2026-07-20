// ============================================
// 加密模块 — crypto-js
// ============================================

import CryptoJS from 'crypto-js'

// ─── MD5 ───
export function md5(str: string): string {
  return CryptoJS.MD5(String(str)).toString()
}

export function md5Short(str: string): string {
  return md5(str).substring(8, 24)
}

// ─── SHA ───
export function sha1(str: string): string {
  return CryptoJS.SHA1(str).toString()
}

export function sha256(str: string): string {
  return CryptoJS.SHA256(str).toString()
}

export function sha512(str: string): string {
  return CryptoJS.SHA512(str).toString()
}

// ─── HMAC ───
export function hmacSha256(str: string, key: string): string {
  return CryptoJS.HmacSHA256(str, key).toString()
}

export function hmacHex(str: string, key: string, algorithm: string = 'sha256'): string {
  const map: Record<string, any> = { sha1: CryptoJS.HmacSHA1, sha256: CryptoJS.HmacSHA256, sha384: CryptoJS.HmacSHA384, sha512: CryptoJS.HmacSHA512, md5: CryptoJS.HmacMD5 }
  const algo = map[algorithm.toLowerCase()]
  if (!algo) return CryptoJS.HmacSHA256(str, key).toString()
  return algo(str, key).toString()
}

export function digestHex(str: string, algorithm: string = 'sha256'): string {
  const map: Record<string, any> = { sha1: CryptoJS.SHA1, sha256: CryptoJS.SHA256, sha384: CryptoJS.SHA384, sha512: CryptoJS.SHA512, md5: CryptoJS.MD5 }
  const algo = map[algorithm.toLowerCase()]
  if (!algo) return CryptoJS.SHA256(str).toString()
  return algo(str).toString()
}

// ─── Base64 ───
export function base64Encode(str: string): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str))
}

export function base64Decode(str: string): string {
  const parsed = CryptoJS.enc.Base64.parse(str)
  return CryptoJS.enc.Utf8.stringify(parsed)
}

export function base64DecodeToBytes(str: string): Uint8Array {
  const parsed = CryptoJS.enc.Base64.parse(str)
  const words = parsed.words
  const len = words.length * 4
  const bytes = new Uint8Array(len)
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    bytes[i * 4] = (word >> 24) & 0xff
    bytes[i * 4 + 1] = (word >> 16) & 0xff
    bytes[i * 4 + 2] = (word >> 8) & 0xff
    bytes[i * 4 + 3] = word & 0xff
  }
  return bytes
}

// ─── AES ───
export function aesEncrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
  return CryptoJS.AES.encrypt(data, keyWord, { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7, iv: ivWord }).toString()
}

export function aesDecrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
  return CryptoJS.AES.decrypt(data, keyWord, { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7, iv: ivWord }).toString(CryptoJS.enc.Utf8)
}

export function aesBase64DecodeToString(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  return aesDecrypt(data, key, mode, iv)
}

// ─── DES ───
export function desEncrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
  return CryptoJS.DES.encrypt(data, keyWord, { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7, iv: ivWord }).toString()
}

export function desDecrypt(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  const keyWord = CryptoJS.enc.Utf8.parse(key)
  const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
  return CryptoJS.DES.decrypt(data, keyWord, { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7, iv: ivWord }).toString(CryptoJS.enc.Utf8)
}

export function desEncodeToBase64String(data: string, key: string, mode: 'CBC' | 'ECB' = 'CBC', iv?: string): string {
  return desEncrypt(data, key, mode, iv)
}

// ─── Hex ───
export function hexEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hexDecode(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return new TextDecoder().decode(bytes)
}

// ─── RSA ───
export interface RsaProvider {
  encrypt(publicKey: string, data: string): string
  decrypt(privateKey: string, data: string): string
}

let rsaProvider: RsaProvider | null = null

export function setRsaProvider(p: RsaProvider): void { rsaProvider = p }

export function rsaEncrypt(publicKey: string, data: string): string {
  if (!rsaProvider) throw new Error('RSA provider not set')
  return rsaProvider.encrypt(publicKey, data)
}

export function rsaDecrypt(privateKey: string, data: string): string {
  if (!rsaProvider) throw new Error('RSA provider not set')
  return rsaProvider.decrypt(privateKey, data)
}

// ─── UUID ───
export function randomUUID(): string {
  return CryptoJS.lib.WordArray.random(16).toString()
}

// ─── 工具 ───
export function strToBytes(str: string): Uint8Array { return new TextEncoder().encode(str) }
export function bytesToStr(bytes: Uint8Array): string { return new TextDecoder().decode(bytes) }
