import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getR1A } from '@/lib/r1a/store';

/**
 * GET /api/r1a/stats
 * Per-user R1A usage stats. Requires auth.
 *
 * Returns:
 *   - totalRequests: count of r1a_conversations rows for this user
 *   - deviceOnline:  true if any of the user's api_keys have an entry
 *                    in the in-memory connectedDevices map
 *   - lastActivity:  ISO timestamp of the most recent conversation row
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Total requests + last activity from r1a_conversations (scoped to this user)
    const { data: convData, error: convError } = await supabase
      .from('r1a_conversations')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    let totalRequests = 0;
    let lastActivity: string | null = null;

    if (!convError) {
      // Cheap count via head request
      const { count } = await supabase
        .from('r1a_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      totalRequests = count || 0;
      lastActivity = convData && convData.length > 0 ? convData[0].created_at : null;
    }

    // Device online status: check the in-memory connectedDevices map for any
    // apiKeyHash that belongs to this user.
    let deviceOnline = false;
    const r1a = getR1A();
    if (r1a && r1a.connectedDevices.size > 0) {
      const { data: userKeys } = await supabase
        .from('api_keys')
        .select('key_hash')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (userKeys) {
        for (const k of userKeys) {
          if (r1a.connectedDevices.has(k.key_hash)) {
            deviceOnline = true;
            break;
          }
        }
      }
    }

    return NextResponse.json({
      totalRequests,
      deviceOnline,
      lastActivity,
    });
  } catch (err) {
    console.error('GET /api/r1a/stats error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
