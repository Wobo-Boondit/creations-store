import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the creation exists
  const { data: creation, error: creationError } = await supabase
    .from('creations')
    .select('client_id, name')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single();

  if (creationError || !creation) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 });
  }

  // Check if already linked
  const { data: existingLink } = await supabase
    .from('device_links')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();

  if (existingLink) {
    return NextResponse.json({ error: 'Already linked' }, { status: 409 });
  }

  // Create device link directly (no QR/pair code needed)
  const deviceId = randomBytes(8).toString('hex');
  const { data: link, error: linkError } = await supabase
    .from('device_links')
    .insert({
      user_id: user.id,
      client_id: clientId,
      device_id: deviceId,
      device_name: `${creation.name} Device`,
      is_active: true,
      linked_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (linkError) {
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }

  return NextResponse.json({ link, message: 'Linked successfully' });
}
