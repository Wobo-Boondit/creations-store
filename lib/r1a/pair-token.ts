import { createHmac, timingSafeEqual } from 'crypto'

/**
 * HMAC-signed pairing token for R1A device linking.
 *
 * Flow (matches rhythm's QR-based linking):
 *   1. User clicks "Pair R1A" in settings -> POST /api/r1a/pair-token -> receives { token, expiresAt }
 *   2. Settings shows QR containing { v: 1, token, endpoint: ".../api/r1a/link" }
 *   3. R1 creation opens camera, scans the QR, POSTs { token, device_id } to endpoint
 *   4. /api/r1a/link verifies token, creates link + API key, returns { ok, apiKey }
 *   5. R1 creation saves API key to localStorage, connects via Socket.IO
 *
 * The token is stateless -- no DB row needed. The HMAC prevents tampering.
 */

const PAIR_PREFIX = 'r1pair'
const PAIR_TTL_SECONDS = 300 // 5 minutes

function getSecret(): string {
  const secret = process.env.PLATFORM_SIGNING_SECRET
  if (!secret) throw new Error('PLATFORM_SIGNING_SECRET not configured')
  return secret
}

export function signPairToken(userId: string, clientId: string): {
  token: string
  expiresAt: string
  expiresIn: number
} {
  const exp = Math.floor(Date.now() / 1000) + PAIR_TTL_SECONDS
  const payload = {
    type: 'r1pair',
    userId,
    clientId,
    exp,
  }

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(encoded).digest('base64url')

  return {
    token: `${PAIR_PREFIX}.${encoded}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresIn: PAIR_TTL_SECONDS,
  }
}

export interface PairTokenPayload {
  userId: string
  clientId: string
}

/**
 * Verify a pairing token's HMAC signature and expiry.
 * Returns null if invalid or expired.
 */
export function verifyPairToken(token: string): PairTokenPayload | null {
  if (!token || !token.startsWith(PAIR_PREFIX + '.')) return null

  const rest = token.slice(PAIR_PREFIX.length + 1)
  const lastDot = rest.lastIndexOf('.')
  if (lastDot === -1) return null

  const encoded = rest.slice(0, lastDot)
  const sig = rest.slice(lastDot + 1)

  const expectedSig = createHmac('sha256', getSecret()).update(encoded).digest('base64url')

  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  try {
    if (!timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (decoded.type !== 'r1pair') return null
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) return null
    if (!decoded.userId || !decoded.clientId) return null
    return { userId: decoded.userId, clientId: decoded.clientId }
  } catch {
    return null
  }
}
