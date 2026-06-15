import { NextRequest, NextResponse } from 'next/server'
import { verifyCreationToken } from '@/lib/auth/creation-token'

/**
 * GET /api/oauth/verify
 * For 3rd party creations to verify a creation token.
 * First-party creations verify locally with the shared secret.
 *
 * Headers: Authorization: Bearer <ctk-token>
 * Returns: { valid, clientId?, deviceId?, userId? }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token = match ? match[1].trim() : null

  if (!token) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }

  const decoded = verifyCreationToken(token)
  if (!decoded) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }

  return NextResponse.json({
    valid: true,
    clientId: decoded.clientId,
    deviceId: decoded.deviceId,
    userId: decoded.userId,
  })
}
