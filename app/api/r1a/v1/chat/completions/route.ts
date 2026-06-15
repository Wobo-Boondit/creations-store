import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, proxyChatCompletion } from '@/lib/r1a/store';

export async function POST(request: NextRequest) {
  // Authenticate
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

  const { messages, model = 'r1-command', temperature = 0.7, max_tokens = 150, stream = false, response_format } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: 'messages array is required', type: 'invalid_request' } },
      { status: 400 },
    );
  }

  // Extract last user message
  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content || '';

  // Build conversation context from history
  let conversationContext = '';
  if (messages.length > 1) {
    conversationContext = '## CONVERSATION HISTORY\n\n';
    for (const msg of messages.slice(0, -1)) {
      if (msg.role === 'user') conversationContext += `User: ${msg.content}\n\n`;
      else if (msg.role === 'assistant') conversationContext += `Assistant: ${msg.content}\n\n`;
    }
    conversationContext += '## CURRENT MESSAGE\n\n';
  }

  let messageText = userMessage;
  if (conversationContext) {
    messageText = `${conversationContext}User: ${userMessage}`;
  }

  // JSON format instruction
  if (response_format?.type === 'json_object') {
    messageText += '\n\nIMPORTANT: Respond with ONLY a valid JSON object. No markdown or extra text.';
  }

  try {
    const result = await proxyChatCompletion(auth.apiKeyHash, {
      message: messageText,
      originalMessage: userMessage,
      model,
      temperature,
      max_tokens,
      response_format,
      imageBase64: lastMessage?.imageBase64,
      pluginId: lastMessage?.pluginId,
    });

    // Return OpenAI-compatible response
    if (response_format?.type === 'json_object') {
      // Try to parse response as JSON for clean output
      try {
        const cleanResponse = result.response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        JSON.parse(cleanResponse);
        return NextResponse.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: result.model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: cleanResponse },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      } catch {
        // JSON parse failed, return raw
      }
    }

    return NextResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: result.response },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    const status = message.includes('not connected') ? 503
      : message.includes('timeout') ? 504
      : message.includes('processing another') ? 429
      : 500;

    return NextResponse.json(
      { error: { message, type: status === 504 ? 'timeout' : status === 429 ? 'device_busy' : 'server_error' } },
      { status },
    );
  }
}
