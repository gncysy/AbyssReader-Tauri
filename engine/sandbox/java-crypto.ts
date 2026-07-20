// ============================================
// 沙箱加密 API
// ============================================

import CryptoJS from 'crypto-js'
import {
  md5, md5Short, base64Encode, base64Decode, base64DecodeToBytes,
  hexEncode, hexDecode, aesBase64DecodeToString, desEncodeToBase64String,
  randomUUID, digestHex, hmacHex
} from '../crypto/index.js'

export function createCryptoApi(): Record<string, any> {
  return {
    base64Encode,
    base64Decode,
    base64DecodeToByteArray: base64DecodeToBytes,
    getByteArray: (data: any): Uint8Array => {
      if (typeof data === 'string') return new TextEncoder().encode(data)
      return new Uint8Array()
    },
    hexDecodeToString: hexDecode,
    hexEncode,
    hexEncodeToString: hexEncode,
    md5Encode: md5,
    md5Encode16: md5Short,
    digestHex,
    HMacHex: hmacHex,
    aesBase64DecodeToString,
    desEncodeToBase64String,
    createSymmetricCrypto: (algorithm: string, key: string, iv?: string) => {
      const alg = algorithm.toLowerCase()
      const isDes = alg.includes('des')
      const isEcb = alg.includes('ecb')
      const mode = isEcb ? CryptoJS.mode.ECB : CryptoJS.mode.CBC
      const padding = CryptoJS.pad.Pkcs7

      return {
        encryptStr: (data: string) => {
          const keyWord = CryptoJS.enc.Utf8.parse(key)
          const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
          const cipher = isDes ? CryptoJS.DES : CryptoJS.AES
          return cipher.encrypt(data, keyWord, { mode, padding, iv: ivWord }).toString()
        },
        decryptStr: (data: string) => {
          const keyWord = CryptoJS.enc.Utf8.parse(key)
          const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
          const cipher = isDes ? CryptoJS.DES : CryptoJS.AES
          return cipher.decrypt(data, keyWord, { mode, padding, iv: ivWord }).toString(CryptoJS.enc.Utf8)
        },
      }
    },
    createAsymmetricCrypto: () => {
      let publicKey: string | null = null
      let privateKey: string | null = null
      return {
        setPublicKey: (key: string) => { publicKey = key },
        setPrivateKey: (key: string) => { privateKey = key },
        encryptStr: (_data: string) => {
          if (!publicKey) throw new Error('RSA public key not set')
          throw new Error('RSA not available in browser')
        },
        decryptStr: (_data: string) => {
          if (!privateKey) throw new Error('RSA private key not set')
          throw new Error('RSA not available in browser')
        },
      }
    },
    randomUUID,
  }
}
