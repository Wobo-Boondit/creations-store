import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getR1A, proxyChatCompletion } from '@/lib/r1a/store';

/**
 * POST /api/r1a/test-chat
 *
 * Session-authenticated test harness for the R1A bridge. The dashboard user
 * has a Supabase session but NOT the plaintext API key (only its hash is
 * stored), so the OpenAI-compatible /v1/chat/completions route — which expects
 * a Bearer key — can't be driven from the browser. This route authenticates by
 * session, finds the user's currently-connected device, and reuses the same
 * proxyChatCompletion path so it tests the real end-to-end bridge.
 *
 * Body: { messages: { role, content }[] }
 * Returns: { response: string, model: string }
 */
export const runtime = 'nodejs';
export const maxDuration = 35;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userMessage = (lastUser?.content || '').trim();
  if (!userMessage) {
    return NextResponse.json({ error: 'empty_message' }, { status: 400 });
  }

  // Find which of this user's active keys belongs to a currently-connected
  // device. The socket registers under hashApiKey(plaintext), which equals the
  // key_hash column — so we can match the in-memory map directly.
  const r1a = getR1A();
  if (!r1a) {
    return NextResponse.json({ error: 'bridge_unavailable' }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: userKeys } = await supabase
    .from('api_keys')
    .select('key_hash')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const connectedHash = (userKeys || [])
    .map((k) => k.key_hash as string)
    .find((hash) => {
      const dev = r1a.connectedDevices.get(hash);
      return dev && dev.socket?.connected;
    });

  if (!connectedHash) {
    return NextResponse.json({ error: 'device_offline' }, { status: 503 });
  }

  // Build conversation context from history, matching the /v1 route's format
  // so the device sees the same prompt shape.
  let conversationContext = '';
  if (messages.length > 1) {
    conversationContext = '## CONVERSATION HISTORY\n\n';
    for (const msg of messages.slice(0, -1)) {
      if (msg.role === 'user') conversationContext += `User: ${msg.content}\n\n`;
      else if (msg.role === 'assistant')
        conversationContext += `Assistant: ${msg.content}\n\n`;
    }
    conversationContext += '## CURRENT MESSAGE\n\n';
  }
  const messageText = conversationContext
    ? `${conversationContext}User: ${userMessage}`
    : userMessage;

  try {
    const result = await proxyChatCompletion(connectedHash, {
      message: messageText,
      originalMessage: userMessage,
      model: 'r1-command',
    });
    return NextResponse.json({ response: result.response, model: result.model });
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    const status = message.includes('not connected')
      ? 503
      : message.includes('timeout')
        ? 504
        : message.includes('processing another')
          ? 429
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
