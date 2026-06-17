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

    // A "request" is one user turn (each exchange logs a user + assistant row),
    // so we count/track role='user' rows to avoid double-counting the reply.
    const { data: convData, error: convError } = await supabase
      .from('r1a_conversations')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1);

    let totalRequests = 0;
    let lastActivity: string | null = null;

    if (!convError) {
      // Cheap count via head request
      const { count } = await supabase
        .from('r1a_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user');
      totalRequests = count || 0;
      lastActivity = convData && convData.length > 0 ? convData[0].created_at : null;
    }

    // Daily request counts for the last 14 days (for the usage graph). Pre-seed
    // every day with 0 so the chart has a continuous x-axis.
    const DAYS = 14;
    const since = new Date(Date.now() - (DAYS - 1) * 86400000);
    since.setUTCHours(0, 0, 0, 0);
    const buckets = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    const { data: recentRows } = await supabase
      .from('r1a_conversations')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', since.toISOString());
    for (const row of recentRows || []) {
      const key = String(row.created_at).slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const daily = Array.from(buckets, ([date, requests]) => ({ date, requests }));

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
      daily,
    });
  } catch (err) {
    console.error('GET /api/r1a/stats error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
