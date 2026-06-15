import { NextRequest, NextResponse } from 'next/server'
import { refreshCreationTokens } from '@/lib/auth/creation-token'

/**
 * POST /api/oauth/refresh
 * Exchange a refresh token for new access + refresh tokens.
 *
 * Headers: Authorization: Bearer <rtk-token>
 * Returns: { accessToken, refreshToken, expiresIn }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token = match ? match[1].trim() : null

  if (!token) {
    return NextResponse.json({ error: 'refresh_token_required' }, { status: 401 })
  }

  const result = refreshCreationTokens(token)
  if (!result) {
    return NextResponse.json({ error: 'invalid_refresh_token' }, { status: 403 })
  }

  return NextResponse.json(result)
}
