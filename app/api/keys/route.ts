import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { generateApiKey } from '@/lib/auth/api-key'

/**
 * GET /api/keys
 * List the current user's API keys (without hashes).
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('api_keys')
      .select('key_id, key_preview, device_id, name, created_at, last_used, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('keys list error:', error)
      return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    }

    return NextResponse.json({ keys: data || [] })
  } catch (err) {
    console.error('GET /api/keys error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/**
 * POST /api/keys
 * Create a new API key for a specific linked device.
 *
 * Body: { deviceId: string, name?: string }
 * Returns: { keyId, key, preview } — plaintext key shown ONCE.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { deviceId, name } = await req.json()
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ error: 'deviceId required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify the user owns a link with this device
    const { data: link } = await supabase
      .from('creation_links')
      .select('id, client_id')
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .eq('is_active', true)
      .limit(1)

    if (!link || link.length === 0) {
      return NextResponse.json({ error: 'device_not_linked' }, { status: 404 })
    }

    // Generate the key
    const apiKey = generateApiKey()

    const { error } = await supabase.from('api_keys').insert({
      key_id: apiKey.keyId,
      key_hash: apiKey.hash,
      key_preview: apiKey.preview,
      user_id: user.id,
      device_id: deviceId,
      name: name || 'Default',
    })

    if (error) {
      console.error('keys insert error:', error)
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
    }

    // Return plaintext ONCE
    return NextResponse.json({
      keyId: apiKey.keyId,
      key: apiKey.plaintext,
      preview: apiKey.preview,
    })
  } catch (err) {
    console.error('POST /api/keys error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
