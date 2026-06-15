import { describe, it, expect } from 'vitest'
import {
  generateApiKey,
  hashApiKey,
  extractBearer,
  isApiKey,
  hashBearerForLookup,
} from '@/lib/auth/api-key'

describe('api-key', () => {
  describe('generateApiKey', () => {
    it('produces a key with boondit_r1_ prefix', () => {
      const { plaintext } = generateApiKey()
      expect(plaintext.startsWith('boondit_r1_')).toBe(true)
    })

    it('produces a hash (hex string)', () => {
      const { hash } = generateApiKey()
      expect(hash).toMatch(/^[0-9a-f]{64}$/) // SHA-256 hex
    })

    it('produces a keyId with boondit_r1_ prefix', () => {
      const { keyId } = generateApiKey()
      expect(keyId.startsWith('boondit_r1_')).toBe(true)
    })

    it('produces a preview that masks the middle', () => {
      const { plaintext, preview } = generateApiKey()
      expect(preview.startsWith(plaintext.slice(0, 16))).toBe(true)
      expect(preview.endsWith(plaintext.slice(-6))).toBe(true)
      expect(preview).toContain('...')
      expect(preview.length).toBeLessThan(plaintext.length)
    })

    it('generates unique keys each call', () => {
      const a = generateApiKey()
      const b = generateApiKey()
      expect(a.plaintext).not.toBe(b.plaintext)
      expect(a.hash).not.toBe(b.hash)
      expect(a.keyId).not.toBe(b.keyId)
    })

    it('hash is deterministic for the same key', () => {
      const { plaintext, hash } = generateApiKey()
      const reHashed = hashApiKey(plaintext)
      expect(reHashed).toBe(hash)
    })

    it('different keys produce different hashes', () => {
      const a = generateApiKey()
      const b = generateApiKey()
      expect(a.hash).not.toBe(b.hash)
    })
  })

  describe('extractBearer', () => {
    it('extracts token from "Bearer <token>"', () => {
      const token = extractBearer('Bearer boondit_r1_abc123')
      expect(token).toBe('boondit_r1_abc123')
    })

    it('extracts token from lowercase "bearer <token>"', () => {
      const token = extractBearer('bearer boondit_r1_abc123')
      expect(token).toBe('boondit_r1_abc123')
    })

    it('returns null for null input', () => {
      expect(extractBearer(null)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractBearer('')).toBeNull()
    })

    it('returns null for non-bearer header', () => {
      expect(extractBearer('Basic abc123')).toBeNull()
      expect(extractBearer('just-a-token')).toBeNull()
    })

    it('trims whitespace from token', () => {
      const token = extractBearer('Bearer   boondit_r1_abc123  ')
      expect(token).toBe('boondit_r1_abc123')
    })
  })

  describe('isApiKey', () => {
    it('returns true for keys with boondit_r1_ prefix', () => {
      expect(isApiKey('boondit_r1_abcdefgh')).toBe(true)
    })

    it('returns false for other prefixes', () => {
      expect(isApiKey('ak_abcdefgh')).toBe(false)
      expect(isApiKey('r1dt.token.here')).toBe(false)
      expect(isApiKey('random-string')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isApiKey('')).toBe(false)
    })
  })

  describe('hashBearerForLookup', () => {
    it('returns hash for valid API key format', () => {
      const { plaintext, hash } = generateApiKey()
      const lookup = hashBearerForLookup(plaintext)
      expect(lookup).toBe(hash)
    })

    it('returns null for non-API-key strings', () => {
      expect(hashBearerForLookup('random-string')).toBeNull()
      expect(hashBearerForLookup('')).toBeNull()
      expect(hashBearerForLookup('ak_something')).toBeNull()
    })

    it('produces consistent hashes for the same key', () => {
      const { plaintext } = generateApiKey()
      const h1 = hashBearerForLookup(plaintext)
      const h2 = hashBearerForLookup(plaintext)
      expect(h1).toBe(h2)
    })
  })
})
