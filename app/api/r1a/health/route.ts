import { NextResponse } from 'next/server';
import { getR1A } from '@/lib/r1a/store';

export async function GET() {
  const r1a = getR1A();
  if (!r1a) {
    return NextResponse.json({ status: 'error', message: 'R1A server not initialized' }, { status: 503 });
  }

  return NextResponse.json({
    status: 'ok',
    connectedDevices: r1a.connectedDevices.size,
    pendingRequests: r1a.pendingRequests.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
