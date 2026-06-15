import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * DELETE /api/keys/[id]
 * Revoke an API key.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('key_id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('keys revoke error:', error)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ revoked: true })
  } catch (err) {
    console.error('DELETE /api/keys error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/**
 * PATCH /api/keys/[id]
 * Rename an API key.
 *
 * Body: { name: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { name } = await req.json()

    if (!name || typeof name !== 'string' || name.length > 64) {
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('api_keys')
      .update({ name })
      .eq('key_id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ updated: true })
  } catch (err) {
    console.error('PATCH /api/keys error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
