import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * GET /api/creations
 * List all available creations + the user's link status for each.
 *
 * Query params: ?status=active (filter by status)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()

    const supabase = createAdminClient()

    // Get all active creations
    const { data: creations, error: cError } = await supabase
      .from('creation_clients')
      .select('*')
      .eq('status', 'active')
      .order('sort_order', { ascending: true })

    if (cError) {
      console.error('creations list error:', cError)
      return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    }

    // If logged in, get link status
    let links: Record<string, any[]> = {}
    if (user) {
      const { data: userLinks } = await supabase
        .from('creation_links')
        .select('id, client_id, device_id, device_name, linked_at, last_seen, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (userLinks) {
        for (const link of userLinks) {
          if (!links[link.client_id]) links[link.client_id] = []
          links[link.client_id].push(link)
        }
      }
    }

    const result = (creations || []).map((c) => ({
      ...c,
      links: links[c.client_id] || [],
      isLinked: (links[c.client_id] || []).length > 0,
    }))

    return NextResponse.json({ creations: result })
  } catch (err) {
    console.error('GET /api/creations error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
