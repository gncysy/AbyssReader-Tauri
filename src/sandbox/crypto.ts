// ============================================
// 前端加密 API（CryptoJS 同步）
// ============================================

import CryptoJS from 'crypto-js'

export function createCryptoApi(): Record<string, any> {
  return {
    base64Encode: (str: string) => btoa(String(str)),
    base64Decode: (str: string) => atob(String(str)),
    base64DecodeToByteArray: (str: string) => new TextEncoder().encode(atob(String(str))),
    hexEncode: (str: string) => {
      const b = new TextEncoder().encode(String(str))
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
    },
    hexEncodeToString: (str: string) => {
      const b = new TextEncoder().encode(String(str))
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
    },
    hexDecodeToString: (hex: string) => {
      const b = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
      return new TextDecoder().decode(b)
    },
    md5Encode: (str: string) => CryptoJS.MD5(String(str)).toString(),
    md5Encode16: (str: string) => CryptoJS.MD5(String(str)).toString().substring(8, 24),
    digestHex: (str: string, algorithm: string = 'sha256') => {
      const map: Record<string, any> = { sha1: CryptoJS.SHA1, sha256: CryptoJS.SHA256, sha384: CryptoJS.SHA384, sha512: CryptoJS.SHA512, md5: CryptoJS.MD5 }
      const algo = map[algorithm.toLowerCase()]
      if (!algo) return CryptoJS.SHA256(String(str)).toString()
      return algo(String(str)).toString()
    },
    HMacHex: (str: string, key: string, algorithm: string = 'sha256') => {
      const map: Record<string, any> = { sha1: CryptoJS.HmacSHA1, sha256: CryptoJS.HmacSHA256, sha384: CryptoJS.HmacSHA384, sha512: CryptoJS.HmacSHA512, md5: CryptoJS.HmacMD5 }
      const algo = map[algorithm.toLowerCase()]
      if (!algo) return CryptoJS.HmacSHA256(String(str), String(key)).toString()
      return algo(String(str), String(key)).toString()
    },
    aesBase64DecodeToString: (data: string, key: string) => {
      return CryptoJS.AES.decrypt(String(data), CryptoJS.enc.Utf8.parse(String(key)), {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: CryptoJS.enc.Utf8.parse(String(key).substring(0, 16))
      }).toString(CryptoJS.enc.Utf8)
    },
    desEncodeToBase64String: (data: string, key: string) => {
      return CryptoJS.DES.encrypt(String(data), CryptoJS.enc.Utf8.parse(String(key)), {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      }).toString()
    },
    createSymmetricCrypto: (algorithm: string, key: string, iv?: string) => {
      const alg = algorithm.toLowerCase()
      const isDes = alg.includes('des')
      const isEcb = alg.includes('ecb')
      const mode = isEcb ? CryptoJS.mode.ECB : CryptoJS.mode.CBC
      const padding = CryptoJS.pad.Pkcs7
      const keyWord = CryptoJS.enc.Utf8.parse(String(key))
      let ivWord: CryptoJS.lib.WordArray | undefined
      if (iv && !isEcb) {
        ivWord = CryptoJS.enc.Utf8.parse(String(iv).substring(0, isDes ? 8 : 16))
      }
      const cipher = isDes ? CryptoJS.DES : CryptoJS.AES
      return {
        encryptStr: (data: string) => cipher.encrypt(String(data), keyWord, { mode, padding, iv: ivWord }).toString(),
        decryptStr: (data: string) => cipher.decrypt(String(data), keyWord, { mode, padding, iv: ivWord }).toString(CryptoJS.enc.Utf8),
      }
    },
    createAsymmetricCrypto: () => ({
      setPublicKey: () => {},
      setPrivateKey: () => {},
      encryptStr: () => { throw new Error('RSA not available in browser') },
      decryptStr: () => { throw new Error('RSA not available in browser') },
    }),
    randomUUID: () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16) }),
  }
}
