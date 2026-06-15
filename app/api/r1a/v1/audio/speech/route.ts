import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, proxyTTS } from '@/lib/r1a/store';

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request.headers.get('authorization'));
  if (!auth.authenticated || !auth.apiKeyHash) {
    return NextResponse.json(
      { error: { message: auth.error || 'Authentication failed', type: 'authentication_failed' } },
      { status: 401 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', type: 'invalid_request' } },
      { status: 400 },
    );
  }

  const { input, voice = 'alloy', response_format = 'mp3' } = body;

  if (!input || typeof input !== 'string') {
    return NextResponse.json(
      { error: { message: 'input (text) is required', type: 'invalid_request' } },
      { status: 400 },
    );
  }

  try {
    const result = await proxyTTS(auth.apiKeyHash, {
      text: input,
      voice,
      response_format,
    });

    // Return audio data as binary response
    const audioBuffer = typeof result.audioData === 'string'
      ? Buffer.from(result.audioData, 'base64')
      : Buffer.isBuffer(result.audioData)
        ? result.audioData
        : Buffer.from(result.audioData);

    const contentType = result.audioFormat === 'mp3' ? 'audio/mpeg'
      : result.audioFormat === 'wav' ? 'audio/wav'
      : result.audioFormat === 'opus' ? 'audio/opus'
      : 'audio/mpeg';

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="speech.${result.audioFormat}"`,
      },
    });
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    const status = message.includes('not connected') ? 503
      : message.includes('timeout') ? 504
      : 500;

    return NextResponse.json(
      { error: { message, type: 'server_error' } },
      { status },
    );
  }
}
