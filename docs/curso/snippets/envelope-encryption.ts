// Envelope encryption AES-256-GCM · F7
// Lib lib/crypto/envelope.ts del proyecto Tendr.
//
// Patrón DEK + KEK:
// - DEK (Data Encryption Key): clave única por cada API key cifrada. 256 bits random.
// - KEK (Key Encryption Key): clave maestra del producto. 256 bits, vive en env var.
//
// Por qué envelope y no cifrado directo:
// - Rotar la KEK solo re-cifra los DEKs (32 bytes), no las API keys completas.
// - Auditabilidad separable: la DEK queda en BD junto a la API key cifrada;
//   la KEK en env var protegida.

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEK_HEX_LENGTH = 64  // 32 bytes en hex
const IV_LENGTH = 12       // 96 bits recomendado para GCM
const TAG_LENGTH = 16

function loadKek(): Buffer {
  const hex = process.env.AI_KEY_KEK
  if (!hex || hex.length !== KEK_HEX_LENGTH) {
    throw new Error('AI_KEY_KEK env var missing or invalid (expected 64 hex chars)')
  }
  return Buffer.from(hex, 'hex')
}

export type EncryptedEnvelope = {
  encryptedKey: string  // base64
  keyIv: string         // base64
  keyTag: string        // base64
  encryptedDek: string  // base64 con encryptedDek || dekTag || dekIv
}

export function encryptProviderKey(plaintextKey: string): EncryptedEnvelope {
  const kek = loadKek()

  // 1. Genera DEK aleatoria (256 bits).
  const dek = randomBytes(32)

  // 2. Cifra la API key con DEK.
  const keyIv = randomBytes(IV_LENGTH)
  const keyCipher = createCipheriv(ALGORITHM, dek, keyIv)
  const encryptedKey = Buffer.concat([
    keyCipher.update(plaintextKey, 'utf8'),
    keyCipher.final(),
  ])
  const keyTag = keyCipher.getAuthTag()

  // 3. Cifra la DEK con KEK.
  const dekIv = randomBytes(IV_LENGTH)
  const dekCipher = createCipheriv(ALGORITHM, kek, dekIv)
  const encryptedDekRaw = Buffer.concat([dekCipher.update(dek), dekCipher.final()])
  const dekTag = dekCipher.getAuthTag()

  return {
    encryptedKey: encryptedKey.toString('base64'),
    keyIv: keyIv.toString('base64'),
    keyTag: keyTag.toString('base64'),
    // encryptedDek empaqueta payload + tag + iv para guardar como un solo campo.
    encryptedDek: Buffer.concat([encryptedDekRaw, dekTag, dekIv]).toString('base64'),
  }
}

export function decryptProviderKey(row: EncryptedEnvelope): string {
  const kek = loadKek()

  // 1. Descifra DEK.
  const dekBuf = Buffer.from(row.encryptedDek, 'base64')
  const dekIv = dekBuf.subarray(dekBuf.length - IV_LENGTH)
  const dekTag = dekBuf.subarray(
    dekBuf.length - IV_LENGTH - TAG_LENGTH,
    dekBuf.length - IV_LENGTH,
  )
  const encryptedDek = dekBuf.subarray(0, dekBuf.length - IV_LENGTH - TAG_LENGTH)
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekIv)
  dekDecipher.setAuthTag(dekTag)
  const dek = Buffer.concat([dekDecipher.update(encryptedDek), dekDecipher.final()])

  // 2. Descifra API key con DEK.
  const decipher = createDecipheriv(ALGORITHM, dek, Buffer.from(row.keyIv, 'base64'))
  decipher.setAuthTag(Buffer.from(row.keyTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.encryptedKey, 'base64')),
    decipher.final(),
  ]).toString('utf8')

  return plaintext
}

// ============================================================================
// Tests sugeridos · db/__tests__/envelope.test.ts
// ============================================================================
//
// import { describe, expect, it } from 'vitest'
// import { encryptProviderKey, decryptProviderKey } from '@/lib/crypto/envelope'
//
// describe('envelope encryption', () => {
//   it('roundtrip preserves plaintext', () => {
//     const key = 'sk-test-fake-api-key-1234567890'
//     const env = encryptProviderKey(key)
//     expect(decryptProviderKey(env)).toBe(key)
//   })
//
//   it('roundtrip with random keys does not collide', () => {
//     for (let i = 0; i < 100; i++) {
//       const key = `sk-${randomBytes(32).toString('hex')}`
//       const env = encryptProviderKey(key)
//       expect(decryptProviderKey(env)).toBe(key)
//     }
//   })
//
//   it('tampered ciphertext fails auth tag', () => {
//     const env = encryptProviderKey('sk-test-key')
//     const tamperedBuf = Buffer.from(env.encryptedKey, 'base64')
//     tamperedBuf[0] ^= 0xff  // flip un byte
//     env.encryptedKey = tamperedBuf.toString('base64')
//     expect(() => decryptProviderKey(env)).toThrow()
//   })
//
//   it('missing KEK throws clear error', () => {
//     const prev = process.env.AI_KEY_KEK
//     delete process.env.AI_KEY_KEK
//     expect(() => encryptProviderKey('sk-test')).toThrow(/AI_KEY_KEK/)
//     process.env.AI_KEY_KEK = prev
//   })
// })
