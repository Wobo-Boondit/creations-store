import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * DELETE /api/creations/[id]/links/[linkId]
 * Unlink a device from a creation.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { id, linkId } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('creation_links')
      .update({ is_active: false })
      .eq('id', linkId)
      .eq('client_id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('unlink error:', error)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    // Also revoke any API keys for this device
    await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('device_id', linkId)
      .eq('user_id', user.id)

    return NextResponse.json({ unlinked: true })
  } catch (err) {
    console.error('DELETE link error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
