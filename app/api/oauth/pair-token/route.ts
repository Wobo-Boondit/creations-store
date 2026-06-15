import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * POST /api/oauth/pair-token
 * Start the creation linking flow. Generates a one-time pairing token.
 *
 * Body: { clientId: string }
 * Returns: { token, expiresAt }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { clientId } = await req.json()
    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify the creation exists and is active
    const { data: client } = await supabase
      .from('creation_clients')
      .select('client_id, name')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .single()

    if (!client) {
      return NextResponse.json({ error: 'unknown_creation' }, { status: 404 })
    }

    // Create pairing token
    const { data, error } = await supabase
      .from('creation_pairing_tokens')
      .insert({
        user_id: user.id,
        client_id: clientId,
      })
      .select('token, expires_at')
      .single()

    if (error || !data) {
      console.error('pair-token insert error:', error)
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({
      token: data.token,
      expiresAt: data.expires_at,
      clientId,
    })
  } catch (err) {
    console.error('pair-token error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
