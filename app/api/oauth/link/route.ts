import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signCreationToken, signRefreshToken } from '@/lib/auth/creation-token'

/**
 * POST /api/oauth/link
 * Called by the R1 creation after scanning the QR code.
 * Consumes the pairing token and returns scoped access + refresh tokens.
 *
 * Body: { token: string, deviceId: string, deviceName?: string }
 * Returns: { accessToken, refreshToken, expiresIn, user: { username, avatarUrl } }
 *
 * No auth required — the pairing token IS the auth.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, deviceId, deviceName } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ error: 'deviceId required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Atomic consume via RPC — prevents race conditions
    const { data, error } = await supabase.rpc('consume_creation_pair', {
      p_token: token,
      p_device_id: deviceId,
      p_device_name: deviceName || null,
    })

    if (error) {
      console.error('consume_creation_pair error:', error)
      return NextResponse.json({ error: 'invalid_token' }, { status: 403 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 403 })
    }

    const result = data[0]

    // Sign tokens
    const access = signCreationToken(result.client_id, deviceId, result.user_id)
    const refresh = signRefreshToken(result.client_id, deviceId, result.user_id)

    return NextResponse.json({
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: access.expiresIn,
      user: {
        id: result.user_id,
        username: result.username,
        avatarUrl: result.avatar_url,
      },
    })
  } catch (err) {
    console.error('oauth/link error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
