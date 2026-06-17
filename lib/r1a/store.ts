import { createAdminClient } from '@/lib/supabase/admin';
import { hashBearerForLookup } from '@/lib/auth/api-key';

// ─── Types ─────────────────────────────────────────────────────

interface ConnectedDevice {
  socket: any; // Socket.IO socket
  apiKeyHash: string;
  userId: string | null;
  deviceId?: string | null;
  linkId: string | null;
  connectedAt: string;
  userAgent: string;
  systemInfo?: any;
  lastSystemInfoAt?: string;
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  createdAt: number;
}

interface R1AGlobal {
  io: any;
  connectedDevices: Map<string, ConnectedDevice>;
  pendingRequests: Map<string, PendingRequest>;
  requestDeviceMap: Map<string, string>;
  hashApiKey: (key: string) => string;
  generateRequestId: () => string;
}

// ─── Accessor ──────────────────────────────────────────────────

export function getR1A(): R1AGlobal | null {
  const store = (globalThis as any).__r1a;
  if (!store || !store.io) return null;
  return store as R1AGlobal;
}

// ─── API Key Auth ──────────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  apiKeyHash?: string;
  userId?: string;
  deviceId?: string;
}

export async function authenticateApiKey(
  authHeader: string | null,
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'API key required. Use Authorization: Bearer <api-key>' };
  }

  const apiKey = authHeader.substring(7);
  if (!apiKey.startsWith('boondit_r1_')) {
    return { authenticated: false, error: 'Invalid API key format' };
  }

  const apiKeyHash = hashBearerForLookup(apiKey);
  if (!apiKeyHash) {
    return { authenticated: false, error: 'Invalid API key' };
  }

  // Look up in Supabase
  const supabase = createAdminClient();
  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('user_id, device_id, name')
    .eq('key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();

  if (error || !keyRecord) {
    return { authenticated: false, error: 'Invalid or revoked API key' };
  }

  return {
    authenticated: true,
    apiKeyHash,
    userId: keyRecord.user_id,
    deviceId: keyRecord.device_id,
  };
}

// ─── Device Lookup ─────────────────────────────────────────────

export function getConnectedDevice(apiKeyHash: string): ConnectedDevice | null {
  const r1a = getR1A();
  if (!r1a) return null;
  return r1a.connectedDevices.get(apiKeyHash) || null;
}

// ─── Chat Proxy ────────────────────────────────────────────────

export interface ChatProxyResult {
  response: string;
  model: string;
}

export async function proxyChatCompletion(
  apiKeyHash: string,
  payload: {
    message: string;
    originalMessage?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: any;
    imageBase64?: string;
    pluginId?: string;
  },
): Promise<ChatProxyResult> {
  const r1a = getR1A();
  if (!r1a) throw new Error('R1A server not initialized');

  const device = r1a.connectedDevices.get(apiKeyHash);
  if (!device || !device.socket.connected) {
    throw new Error('Device not connected');
  }

  // Check for existing pending request on this device
  const entries = Array.from(r1a.requestDeviceMap.entries());
  for (const [reqId, hash] of entries) {
    if (hash === apiKeyHash && r1a.pendingRequests.has(reqId)) {
      const pending = r1a.pendingRequests.get(reqId)!;
      // If older than 30s, clean it up
      if (Date.now() - pending.createdAt > 30000) {
        clearTimeout(pending.timeout);
        r1a.pendingRequests.delete(reqId);
        r1a.requestDeviceMap.delete(reqId);
      } else {
        throw new Error('Device is currently processing another request');
      }
    }
  }

  const requestId = r1a.generateRequestId();

  // Create promise that resolves when device responds
  const responsePromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      r1a.pendingRequests.delete(requestId);
      r1a.requestDeviceMap.delete(requestId);
      reject(new Error('Request timeout - R1 device did not respond within 30 seconds'));
    }, 30000);

    r1a.pendingRequests.set(requestId, {
      resolve,
      reject,
      timeout,
      createdAt: Date.now(),
    });
    r1a.requestDeviceMap.set(requestId, apiKeyHash);
  });

  // Emit to device
  device.socket.emit('chat_completion', {
    type: 'chat_completion',
    data: {
      ...payload,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });

  const result = await responsePromise;

  // Log the exchange so usage stats/graphs reflect real traffic. This is the
  // single choke point for ALL chat requests (OpenAI-compatible API + the
  // dashboard test chat), so logging here keeps every path counted. Best-effort
  // — a logging failure must never fail the user's request.
  if (device.userId) {
    logConversation(device.userId, device.deviceId ?? 'unknown', [
      { role: 'user', content: payload.originalMessage ?? payload.message },
      { role: 'assistant', content: result.response ?? '' },
    ]);
  }

  return {
    response: result.response,
    model: result.model || payload.model || 'r1-command',
  };
}

// Fire-and-forget insert of conversation turns into r1a_conversations.
function logConversation(
  userId: string,
  deviceId: string,
  turns: { role: string; content: string }[],
): void {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  supabase
    .from('r1a_conversations')
    .insert(
      turns.map((t) => ({
        user_id: userId,
        device_id: deviceId,
        role: t.role,
        content: t.content,
        created_at: nowIso,
      })),
    )
    .then(({ error }) => {
      if (error) console.error('[R1A] conversation log failed:', error.message);
    });
}

// ─── TTS Proxy ─────────────────────────────────────────────────

export async function proxyTTS(
  apiKeyHash: string,
  payload: {
    text: string;
    voice?: string;
    response_format?: string;
  },
): Promise<{ audioData: any; audioFormat: string }> {
  const r1a = getR1A();
  if (!r1a) throw new Error('R1A server not initialized');

  const device = r1a.connectedDevices.get(apiKeyHash);
  if (!device || !device.socket.connected) {
    throw new Error('Device not connected');
  }

  const requestId = r1a.generateRequestId();

  const responsePromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      r1a.pendingRequests.delete(requestId);
      r1a.requestDeviceMap.delete(requestId);
      reject(new Error('TTS timeout - R1 device did not respond within 30 seconds'));
    }, 30000);

    r1a.pendingRequests.set(requestId, { resolve, reject, timeout, createdAt: Date.now() });
    r1a.requestDeviceMap.set(requestId, apiKeyHash);
  });

  device.socket.emit('text_to_speech', {
    type: 'text_to_speech',
    data: {
      ...payload,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });

  const result = await responsePromise;
  return {
    audioData: result.audioData,
    audioFormat: result.audioFormat || 'mp3',
  };
}
