import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { signPairToken } from '@/lib/r1a/pair-token'

/**
 * POST /api/r1a/pair-token
 *
 * Authenticated endpoint that mints a short-lived (5 min) HMAC-signed pairing
 * token for the R1A device linking flow. The token is embedded in a QR code
 * shown on the settings page; the R1 device loads /r1a_client?pair=<token>,
 * connects via Socket.IO with `auth.pairToken`, and server.mjs verifies it.
 *
 * No DB row is created here — the token is self-contained and verified
 * statelessly by server.mjs.
 */
const PAIR_CLIENT_ID = 'r1a'
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10

// In-memory per-user rate limit (per server instance)
const rateMap = new Map<string, { count: number; resetAt: number }>()

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Rate limit: prevent token-spamming
  const now = Date.now()
  const entry = rateMap.get(user.id)
  if (entry && now < entry.resetAt) {
    entry.count += 1
    if (entry.count > RATE_MAX) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  } else {
    rateMap.set(user.id, { count: 1, resetAt: now + RATE_WINDOW_MS })
  }

  const { token, expiresAt, expiresIn } = signPairToken(user.id, PAIR_CLIENT_ID)
  return NextResponse.json({ token, expiresAt, expiresIn, clientId: PAIR_CLIENT_ID })
}
