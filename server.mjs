import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3245', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

// ─── Socket.IO Server ──────────────────────────────────────────
// Compatible with ancient Android WebView: polling only, permissive CORS
const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Allow polling transport (R1 WebView doesn't support WebSocket)
  transports: ['polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
});

// ─── In-Memory State (shared via globalThis for API routes) ────
// connectedDevices: apiKeyHash → { socket, userId, linkId, connectedAt }
// pendingRequests:  requestId → { resolve, reject, timeout, createdAt }
// requestDeviceMap: requestId → apiKeyHash (security: verify response from correct device)

const connectedDevices = new Map();
const pendingRequests = new Map();
const requestDeviceMap = new Map();

// Expose globally so Next.js API route handlers can access the same Maps
globalThis.__r1a = { io, connectedDevices, pendingRequests, requestDeviceMap };

// ─── Supabase Admin Client (service role, bypasses RLS) ─────────
// server.mjs is plain ESM and can't import the TS helper, so create directly.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Helpers ───────────────────────────────────────────────────

function hashApiKey(apiKey) {
  // Must match lib/auth/api-key.ts hashApiKey() — uses PLATFORM_SIGNING_SECRET as salt
  const secret = process.env.PLATFORM_SIGNING_SECRET || '';
  return createHash('sha256').update(apiKey).update(secret).digest('hex');
}

function generateRequestId() {
  return `req-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

// ─── R1A Pairing Token (must mirror lib/r1a/pair-token.ts) ───────
const PAIR_PREFIX = 'r1pair';

function verifyPairToken(token) {
  if (!token || !token.startsWith(PAIR_PREFIX + '.')) return null;
  const rest = token.slice(PAIR_PREFIX.length + 1);
  const lastDot = rest.lastIndexOf('.');
  if (lastDot === -1) return null;

  const encoded = rest.slice(0, lastDot);
  const sig = rest.slice(lastDot + 1);
  const secret = process.env.PLATFORM_SIGNING_SECRET || '';
  const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (decoded.type !== 'r1pair') return null;
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) return null;
    if (!decoded.userId || !decoded.clientId) return null;
    return { userId: decoded.userId, clientId: decoded.clientId };
  } catch {
    return null;
  }
}

// ─── API Key Generation (must mirror lib/auth/api-key.ts) ────────
function generateApiKey() {
  const random = randomBytes(24).toString('base64url');
  const plaintext = 'boondit_r1_' + random;
  const hash = hashApiKey(plaintext);
  const keyId = 'boondit_r1_' + random.slice(0, 8) + '_' + Date.now().toString(36);
  const preview = plaintext.slice(0, 16) + '...' + plaintext.slice(-6);
  return { keyId, plaintext, hash, preview };
}

// ─── Pairing Handler ────────────────────────────────────────────
// A device connects with auth.pairToken (from a scanned QR). We verify the
// signed token, create the creation_link + an API key, and hand the API key
// back so the device can reconnect as a normal authenticated client.
async function handlePairing(socket, pairToken) {
  const pair = verifyPairToken(pairToken);
  if (!pair) {
    socket.emit('error', {
      type: 'pair_error',
      message: 'Invalid or expired pairing token',
    });
    socket.disconnect(true);
    return;
  }

  const deviceId = randomBytes(8).toString('hex');
  const nowIso = new Date().toISOString();

  // Create / reactivate the device link
  const { error: linkErr } = await supabase
    .from('creation_links')
    .upsert(
      {
        user_id: pair.userId,
        client_id: pair.clientId,
        device_id: deviceId,
        device_name: 'R1A Device',
        is_active: true,
        linked_at: nowIso,
        last_seen: nowIso,
      },
      { onConflict: 'user_id,client_id,device_id' }
    );

  // Issue a fresh API key for the newly linked device
  const newKey = generateApiKey();
  const { error: keyErr } = await supabase.from('api_keys').insert({
    key_id: newKey.keyId,
    key_hash: newKey.hash,
    key_preview: newKey.preview,
    user_id: pair.userId,
    device_id: deviceId,
    name: 'R1A',
    is_active: true,
    created_at: nowIso,
  });

  if (linkErr || keyErr) {
    console.error('[R1A] Pairing DB error:', linkErr || keyErr);
    socket.emit('error', {
      type: 'pair_error',
      message: 'Failed to create device link',
    });
    socket.disconnect(true);
    return;
  }

  console.log(
    `[R1A] Device paired for user ${pair.userId.substring(0, 8)}... (device ${deviceId})`
  );

  // The DB write triggers Supabase Realtime on creation_links, which the
  // settings page subscribes to — so the web UI flips to "Linked" on its own.
  socket.emit('paired', {
    message: 'Device linked successfully',
    apiKey: newKey.plaintext,
    deviceId,
    timestamp: nowIso,
  });
}

// ─── Socket.IO Connection Handler ──────────────────────────────

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};

  // ─── Pairing flow: device connects with a signed pair token ────
  // The R1 loaded /r1a_client?pair=<token> and connects using
  // auth.pairToken instead of an API key. We verify + create the link,
  // then hand back an API key so the device can reconnect normally.
  if (auth.pairToken) {
    handlePairing(socket, auth.pairToken);
    return;
  }

  const apiKey = auth.apiKey;

  // Require API key for authentication
  if (!apiKey || !apiKey.startsWith('boondit_r1_')) {
    socket.emit('error', {
      type: 'auth_error',
      message: 'Valid API key required in auth payload',
    });
    socket.disconnect(true);
    return;
  }

  const apiKeyHash = hashApiKey(apiKey);

  // Check if this key hash is already connected
  const existing = connectedDevices.get(apiKeyHash);
  if (existing && existing.socket.connected) {
    // Disconnect the old connection (allow reconnection from same device)
    existing.socket.disconnect(true);
  }

  // Register the device
  connectedDevices.set(apiKeyHash, {
    socket,
    apiKeyHash,
    userId: null, // Will be populated by verifyApiKey
    linkId: null,
    connectedAt: new Date().toISOString(),
    userAgent: socket.handshake.headers['user-agent'] || 'unknown',
  });

  console.log(`[R1A] Device connected (${apiKeyHash.substring(0, 12)}...)`);
  console.log(`[R1A] Total connected devices: ${connectedDevices.size}`);

  // Send connection confirmation
  socket.emit('connected', {
    message: 'Connected to Boondit R1A server',
    timestamp: new Date().toISOString(),
  });

  // ─── Heartbeat ───────────────────────────────────────────────
  socket.on('ping', () => {
    socket.emit('pong', {
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
    });
  });

  // ─── Chat Response from Device ───────────────────────────────
  socket.on('response', (data) => {
    const { requestId, response, originalMessage, model, timestamp } = data;

    if (!requestId || !pendingRequests.has(requestId)) {
      console.log(`[R1A] Response with no matching request: ${requestId}`);
      return;
    }

    // Security: verify response came from the right device
    const expectedHash = requestDeviceMap.get(requestId);
    if (expectedHash !== apiKeyHash) {
      console.log(`[R1A] Security violation: response from wrong device`);
      return;
    }

    const pending = pendingRequests.get(requestId);
    clearTimeout(pending.timeout);
    pendingRequests.delete(requestId);
    requestDeviceMap.delete(requestId);

    pending.resolve({
      response,
      originalMessage,
      model,
      timestamp,
    });

    console.log(`[R1A] Request ${requestId} completed`);
  });

  // ─── TTS Response from Device ────────────────────────────────
  socket.on('tts_response', (data) => {
    const { requestId, audioData, audioFormat } = data;

    if (!requestId || !pendingRequests.has(requestId)) {
      console.log(`[R1A] TTS response with no matching request: ${requestId}`);
      return;
    }

    const expectedHash = requestDeviceMap.get(requestId);
    if (expectedHash !== apiKeyHash) {
      console.log(`[R1A] Security violation: TTS response from wrong device`);
      return;
    }

    const pending = pendingRequests.get(requestId);
    clearTimeout(pending.timeout);
    pendingRequests.delete(requestId);
    requestDeviceMap.delete(requestId);

    pending.resolve({
      audioData,
      audioFormat: audioFormat || 'mp3',
      isTTS: true,
    });

    console.log(`[R1A] TTS request ${requestId} completed`);
  });

  // ─── Error from Device ───────────────────────────────────────
  socket.on('device_error', (data) => {
    const { requestId, error } = data;

    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId);
      clearTimeout(pending.timeout);
      pendingRequests.delete(requestId);
      requestDeviceMap.delete(requestId);
      pending.reject(new Error(error || 'Device error'));
    }

    console.error(`[R1A] Device error: ${error}`);
  });

  // ─── System Info ─────────────────────────────────────────────
  socket.on('system_info', (data) => {
    console.log(`[R1A] System info received from device`);
    const device = connectedDevices.get(apiKeyHash);
    if (device) {
      device.systemInfo = data;
      device.lastSystemInfoAt = new Date().toISOString();
    }
  });

  // ─── Disconnect ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Clean up pending requests for this device
    const toClean = [];
    for (const [reqId, hash] of requestDeviceMap.entries()) {
      if (hash === apiKeyHash) toClean.push(reqId);
    }

    for (const reqId of toClean) {
      const pending = pendingRequests.get(reqId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingRequests.delete(reqId);
        requestDeviceMap.delete(reqId);
        pending.reject(new Error('Device disconnected'));
      }
    }

    // Remove from connected devices
    connectedDevices.delete(apiKeyHash);
    console.log(`[R1A] Device disconnected (${apiKeyHash.substring(0, 12)}...)`);
    console.log(`[R1A] Total connected devices: ${connectedDevices.size}`);
  });
});

// ─── Export helpers for API routes ─────────────────────────────
// API routes access these via globalThis.__r1a
globalThis.__r1a.hashApiKey = hashApiKey;
globalThis.__r1a.generateRequestId = generateRequestId;

httpServer.listen(port, hostname, () => {
  console.log(`[R1A] Boondit Creations server ready on http://${hostname}:${port}`);
  console.log(`[R1A] Socket.IO path: /socket.io/`);
  console.log(`[R1A] Mode: ${dev ? 'development' : 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[R1A] SIGTERM received, shutting down...');
  io.close();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[R1A] SIGINT received, shutting down...');
  io.close();
  httpServer.close(() => process.exit(0));
});
