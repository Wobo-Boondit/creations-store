import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPairToken } from '@/lib/r1a/pair-token'
import { generateApiKey } from '@/lib/auth/api-key'

/**
 * POST /api/r1a/link
 *
 * Public route (device is not yet authenticated). The R1 creation scans a QR
 * containing { v: 1, token, endpoint }, then POSTs here with { token, device_id }.
 *
 * Mirrors rhythm's /api/link-r1 flow exactly.
 */
export const runtime = 'nodejs'
export const maxDuration = 5

// Simple in-memory rate limit (per server instance)
const rateMap = new Map<string, { count: number; resetAt: number }>()

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const now = Date.now()
  const entry = rateMap.get(ip)
  if (entry && now < entry.resetAt) {
    entry.count += 1
    if (entry.count > 30) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  } else {
    rateMap.set(ip, { count: 1, resetAt: now + 3600_000 })
  }

  const body = await req.json().catch(() => ({}))
  const { token, device_id } = body as { token?: string; device_id?: string }

  if (!token || !device_id) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  // Verify the HMAC-signed pairing token
  const pair = verifyPairToken(token)
  if (!pair) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  // Create or reactivate the device link
  const { error: linkErr } = await supabase
    .from('creation_links')
    .upsert(
      {
        user_id: pair.userId,
        client_id: pair.clientId,
        device_id,
        device_name: 'R1A Device',
        is_active: true,
        linked_at: nowIso,
        last_seen: nowIso,
      },
      { onConflict: 'user_id,client_id,device_id' }
    )

  if (linkErr) {
    console.error('[R1A] Link DB error:', linkErr)
    return NextResponse.json({ error: 'link_failed' }, { status: 500 })
  }

  // Generate a fresh API key for this device
  const newKey = generateApiKey()
  const { error: keyErr } = await supabase.from('api_keys').insert({
    key_id: newKey.keyId,
    key_hash: newKey.hash,
    key_preview: newKey.preview,
    user_id: pair.userId,
    client_id: pair.clientId,
    device_id,
    name: 'R1A',
    is_active: true,
    created_at: nowIso,
  })

  if (keyErr) {
    console.error('[R1A] API key DB error:', keyErr)
    return NextResponse.json({ error: 'key_creation_failed' }, { status: 500 })
  }

  console.log(
    `[R1A] Device linked via HTTP for user ${pair.userId.substring(0, 8)}... (device ${device_id})`
  )

  // The creation_links upsert triggers Supabase Realtime, which the settings
  // page subscribes to -- so the web UI flips to "Linked" automatically.
  return NextResponse.json({ ok: true, apiKey: newKey.plaintext, deviceId: device_id })
}
