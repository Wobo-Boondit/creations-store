import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const KEY_PREFIX = 'boondit_r1_'

export interface ApiKeyData {
  keyId: string
  plaintext: string
  hash: string
  preview: string
}

export interface VerifiedApiKey {
  userId: string
  deviceId: string
  keyId: string
  name: string
}

/**
 * Generate a new API key.
 * Format: boondit_r1_<32-char-base62>
 * Returns plaintext (shown once) + hash (stored) + preview (for display).
 */
export function generateApiKey(): ApiKeyData {
  const random = randomBytes(24).toString('base64url')
  const plaintext = `${KEY_PREFIX}${random}`
  const hash = hashApiKey(plaintext)
  const keyId = `${KEY_PREFIX}${random.slice(0, 8)}_${Date.now().toString(36)}`
  const preview = `${plaintext.slice(0, 16)}...${plaintext.slice(-6)}`

  return { keyId, plaintext, hash, preview }
}

/**
 * Hash an API key with SHA-256.
 * Only the hash is stored in the database.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).update(process.env.PLATFORM_SIGNING_SECRET || '').digest('hex')
}

/**
 * Extract bearer token from Authorization header.
 */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Check if a string looks like a Boondit R1 API key.
 */
export function isApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX)
}

/**
 * Hash an incoming bearer token for database lookup.
 * Returns null if the token doesn't look like an API key.
 */
export function hashBearerForLookup(bearer: string): string | null {
  if (!isApiKey(bearer)) return null
  return hashApiKey(bearer)
}
