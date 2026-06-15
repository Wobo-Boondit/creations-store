import { createHmac, randomBytes } from 'crypto'

/**
 * HMAC-signed pairing token for R1A device linking.
 *
 * Flow:
 *   1. User clicks "Link R1A" → POST /api/r1a/pair-token → receives { token, expiresAt }
 *   2. QR code encodes { token, endpoint } → R1 scans → loads /r1a_client?pair=token
 *   3. r1a_client connects via Socket.IO with auth.pairToken
 *   4. server.mjs verifyPairToken() verifies signature + expiry, creates link + API key
 *
 * The token is stateless — no DB row needed. The HMAC prevents tampering.
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
