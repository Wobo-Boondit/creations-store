import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/r1a/store';

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request.headers.get('authorization'));
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: { message: auth.error || 'Authentication failed', type: 'authentication_failed' } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    object: 'list',
    data: [
      {
        id: 'r1-command',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'rabbit-r1',
      },
    ],
  });
}
