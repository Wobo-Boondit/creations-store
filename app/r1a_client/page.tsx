'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface LogEntry {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
}

export default function R1AClientPage() {
  const [apiKey, setApiKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statusText, setStatusText] = useState('Enter your API key');
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Load saved API key on mount
  useEffect(() => {
    const saved = localStorage.getItem('boondit_r1_api_key');
    if (saved) {
      setApiKey(saved);
      // Auto-connect if key found
      connect(saved);
    }
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    setLogs(prev => [...prev.slice(-99), { message, level, timestamp: new Date().toISOString() }]);
  }, []);

  const connect = useCallback((key: string) => {
    if (!key || !key.startsWith('boondit_r1_')) {
      addLog('Invalid API key format', 'error');
      return;
    }

    // Disconnect existing
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnecting(true);
    addLog('Connecting to Boondit R1A server...');

    const socket = io({
      path: '/socket.io/',
      transports: ['polling'], // R1 WebView only supports polling
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      auth: { apiKey: key },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      addLog('Socket.IO connected');
      setConnected(true);
      setConnecting(false);
      setStatusText('Connected');
      localStorage.setItem('boondit_r1_api_key', key);

      // Start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (socket.connected) {
          socket.emit('ping', { timestamp: Date.now() });
        }
      }, 30000);
    });

    socket.on('connected', (data: any) => {
      addLog(`Server: ${data.message}`);
    });

    socket.on('disconnect', () => {
      addLog('Disconnected from server', 'warn');
      setConnected(false);
      setStatusText('Disconnected');
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    });

    socket.on('connect_error', (error: Error) => {
      addLog(`Connection error: ${error.message}`, 'error');
      setConnecting(false);
      setStatusText(`Error: ${error.message}`);
    });

    socket.on('pong', (data: any) => {
      const latency = Date.now() - data.timestamp;
      if (Math.random() < 0.1) addLog(`Heartbeat: ${latency}ms`);
    });

    // ─── Chat Completion Handler ─────────────────────────────
    socket.on('chat_completion', (data: any) => {
      const msgData = data.data || data;
      const requestId = msgData.requestId;
      const message = msgData.message || '';
      const imageBase64 = msgData.imageBase64;
      const pluginId = msgData.pluginId;

      addLog(`Chat request received (${requestId})`);

      // Check for R1 SDK (injected by R1 WebView)
      const r1Create = (window as any).r1Create;

      if (r1Create && r1Create.messaging) {
        try {
          const options: any = {
            useLLM: true,
            wantsR1Response: false,
            wantsJournalEntry: true,
            requestId,
          };

          if (imageBase64) {
            options.imageBase64 = imageBase64;
            addLog('Image data included');
          }

          if (pluginId) {
            options.pluginId = pluginId;
            addLog(`Plugin: ${pluginId}`);
          }

          // Use vision API for images, regular messaging otherwise
          if (imageBase64 && (r1Create.vision || r1Create.image)) {
            addLog('Using vision API');
            const visionAPI = r1Create.vision || r1Create.image;
            visionAPI.analyzeImage(imageBase64, { message, ...options });
          } else {
            addLog('Sending to R1 LLM');
            r1Create.messaging.sendMessage(message, options);
          }

          // Acknowledge receipt
          socket.emit('message_received', { requestId, timestamp: new Date().toISOString() });
        } catch (err: any) {
          addLog(`R1 SDK error: ${err.message}`, 'error');
          socket.emit('device_error', { requestId, error: err.message });
        }
      } else {
        // No R1 SDK — send simulated response (for testing in browser)
        addLog('R1 SDK not available, sending simulated response', 'warn');
        const simulated = `R1 response: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`;
        setTimeout(() => {
          if (socket.connected) {
            socket.emit('response', {
              requestId,
              response: simulated,
              originalMessage: message,
              model: 'r1-simulated',
              timestamp: new Date().toISOString(),
            });
            addLog('Simulated response sent');
          }
        }, 1000);
      }
    });

    // ─── TTS Handler ─────────────────────────────────────────
    socket.on('text_to_speech', (data: any) => {
      const msgData = data.data || data;
      const requestId = msgData.requestId;
      const text = msgData.text || msgData.input || '';

      addLog(`TTS request received (${requestId})`);

      const r1Create = (window as any).r1Create;
      if (r1Create && r1Create.tts) {
        try {
          r1Create.tts.synthesize(text, { requestId });
        } catch (err: any) {
          addLog(`TTS error: ${err.message}`, 'error');
          socket.emit('device_error', { requestId, error: err.message });
        }
      } else {
        // Simulated TTS
        addLog('TTS SDK not available, sending empty audio', 'warn');
        setTimeout(() => {
          if (socket.connected) {
            socket.emit('tts_response', {
              requestId,
              audioData: Buffer.from([0xFF, 0xFB, 0x10, 0x00]).toString('base64'),
              audioFormat: 'mp3',
            });
          }
        }, 500);
      }
    });

    socket.on('error', (data: any) => {
      addLog(`Server error: ${data.message || JSON.stringify(data)}`, 'error');
    });
  }, [addLog]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setConnected(false);
    setStatusText('Disconnected');
  }, []);

  const handleClearKey = useCallback(() => {
    localStorage.removeItem('boondit_r1_api_key');
    setApiKey('');
    disconnect();
    setStatusText('Enter your API key');
    setLogs([]);
  }, [disconnect]);

  return (
    <div style={{
      fontFamily: 'monospace',
      background: '#0a0a0a',
      color: '#e0e0e0',
      minHeight: '100vh',
      padding: '20px',
      margin: 0,
      maxWidth: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px', color: '#FE5F00' }}>
          R1A Client
        </h1>
        <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
          Status: <span style={{
            color: connected ? '#4ade80' : connecting ? '#fbbf24' : '#f87171',
          }}>
            {connecting ? 'Connecting...' : statusText}
          </span>
        </div>
      </div>

      {!connected && (
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="boondit_r1_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#e0e0e0',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              marginBottom: '8px',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={() => connect(apiKey)}
            disabled={!apiKey.startsWith('boondit_r1_') || connecting}
            style={{
              width: '100%',
              padding: '12px',
              background: apiKey.startsWith('boondit_r1_') ? '#FE5F00' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: apiKey.startsWith('boondit_r1_') ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              fontWeight: 'bold',
            }}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}

      {connected && (
        <button
          onClick={handleClearKey}
          style={{
            width: '100%',
            padding: '10px',
            background: '#333',
            color: '#e0e0e0',
            border: '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            marginBottom: '20px',
          }}
        >
          Disconnect &amp; Clear Key
        </button>
      )}

      <div
        ref={logContainerRef}
        style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: '4px',
          padding: '12px',
          height: '300px',
          overflowY: 'auto',
          fontSize: '0.75rem',
          lineHeight: '1.5',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ opacity: 0.4 }}>Logs will appear here...</div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} style={{
              color: entry.level === 'error' ? '#f87171'
                : entry.level === 'warn' ? '#fbbf24'
                : '#9ca3af',
              marginBottom: '2px',
            }}>
              <span style={{ opacity: 0.5 }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>{' '}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
