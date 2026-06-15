"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import jsQR from "jsqr";

// ─── Types ──────────────────────────────────────────────────────

interface LogEntry {
  message: string;
  level: "info" | "warn" | "error";
  timestamp: string;
}

type LinkPayload = { v: number; token: string; endpoint: string };

type AppState =
  | { kind: "booting" }
  | { kind: "unlinked" }
  | { kind: "scanning" }
  | { kind: "linking" }
  | { kind: "linked"; apiKey: string }
  | { kind: "error"; message: string };

// ─── QR Scanner ─────────────────────────────────────────────────
// Continuously sample a video element and resolve when a QR with the
// link payload appears. Mirrors rhythm's scan-qr.ts exactly.

function scanLinkPayload(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<LinkPayload> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      reject(new Error("canvas_unsupported"));
      return;
    }

    let raf = 0;
    const stop = () => cancelAnimationFrame(raf);
    signal.addEventListener("abort", () => {
      stop();
      reject(new DOMException("aborted", "AbortError"));
    });

    const tick = () => {
      if (signal.aborted) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        raf = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, {
        inversionAttempts: "dontInvert",
      });
      if (code) {
        try {
          const parsed = JSON.parse(code.data) as LinkPayload;
          if (
            parsed &&
            parsed.v === 1 &&
            typeof parsed.token === "string" &&
            typeof parsed.endpoint === "string"
          ) {
            resolve(parsed);
            return;
          }
        } catch {
          // not our payload — keep scanning
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  });
}

// ─── Device ID ──────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("boondit_r1_device_id");
  if (!id) {
    id =
      "dev_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).substring(2, 10);
    localStorage.setItem("boondit_r1_device_id", id);
  }
  return id;
}

// ─── Main Component ─────────────────────────────────────────────

export default function R1AClientPage() {
  const [state, setState] = useState<AppState>({ kind: "booting" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setLogs((prev) => [
        ...prev.slice(-99),
        { message, level, timestamp: new Date().toISOString() },
      ]);
    },
    [],
  );

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // ─── Boot: check for saved API key ────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("boondit_r1_api_key");
    if (saved && saved.startsWith("boondit_r1_")) {
      setState({ kind: "linked", apiKey: saved });
    } else {
      setState({ kind: "unlinked" });
    }
  }, []);

  // ─── Connect via Socket.IO when we have an API key ────────────
  const connect = useCallback(
    (key: string) => {
      if (!key || !key.startsWith("boondit_r1_")) {
        addLog("Invalid API key format", "error");
        return;
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      addLog("Connecting to Boondit R1A server...");

      const socket = io({
        path: "/socket.io/",
        transports: ["polling"],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        auth: { apiKey: key },
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        addLog("Socket.IO connected");
        setConnected(true);
        localStorage.setItem("boondit_r1_api_key", key);

        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (socket.connected) {
            socket.emit("ping", { timestamp: Date.now() });
          }
        }, 30000);
      });

      socket.on("connected", (data: any) => {
        addLog(`Server: ${data.message}`);
      });

      socket.on("disconnect", () => {
        addLog("Disconnected from server", "warn");
        setConnected(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      });

      socket.on("connect_error", (error: Error) => {
        addLog(`Connection error: ${error.message}`, "error");
      });

      socket.on("pong", (data: any) => {
        const latency = Date.now() - data.timestamp;
        if (Math.random() < 0.1) addLog(`Heartbeat: ${latency}ms`);
      });

      // ─── Chat Completion Handler ─────────────────────────────
      socket.on("chat_completion", (data: any) => {
        const msgData = data.data || data;
        const requestId = msgData.requestId;
        const message = msgData.message || "";
        const imageBase64 = msgData.imageBase64;
        const pluginId = msgData.pluginId;

        addLog(`Chat request received (${requestId})`);

        const r1Create = (window as any).r1Create;

        if (r1Create && r1Create.messaging) {
          try {
            const options: any = {
              useLLM: true,
              wantsR1Response: false,
              wantsJournalEntry: true,
              requestId,
            };

            if (imageBase64) options.imageBase64 = imageBase64;
            if (pluginId) options.pluginId = pluginId;

            if (imageBase64 && (r1Create.vision || r1Create.image)) {
              const visionAPI = r1Create.vision || r1Create.image;
              visionAPI.analyzeImage(imageBase64, { message, ...options });
            } else {
              r1Create.messaging.sendMessage(message, options);
            }

            socket.emit("message_received", {
              requestId,
              timestamp: new Date().toISOString(),
            });
          } catch (err: any) {
            addLog(`R1 SDK error: ${err.message}`, "error");
            socket.emit("device_error", { requestId, error: err.message });
          }
        } else {
          addLog("R1 SDK not available", "warn");
          socket.emit("response", {
            requestId,
            response: `[R1A bridge: no R1 SDK available] message was: "${message.substring(0, 100)}"`,
            originalMessage: message,
            model: "r1a-bridge",
            timestamp: new Date().toISOString(),
          });
        }
      });

      // ─── TTS Handler ─────────────────────────────────────────
      socket.on("text_to_speech", (data: any) => {
        const msgData = data.data || data;
        const requestId = msgData.requestId;
        const text = msgData.text || msgData.input || "";

        addLog(`TTS request received (${requestId})`);

        const r1Create = (window as any).r1Create;
        if (r1Create && r1Create.tts) {
          try {
            r1Create.tts.synthesize(text, { requestId });
          } catch (err: any) {
            addLog(`TTS error: ${err.message}`, "error");
            socket.emit("device_error", { requestId, error: err.message });
          }
        }
      });

      socket.on("error", (data: any) => {
        addLog(`Server error: ${data.message || JSON.stringify(data)}`, "error");
      });
    },
    [addLog],
  );

  // Connect when state becomes linked
  useEffect(() => {
    if (state.kind === "linked" && state.apiKey && !socketRef.current) {
      connect(state.apiKey);
    }
  }, [state, connect]);

  // ─── Camera + QR Scan ─────────────────────────────────────────
  const stopCamera = useCallback(() => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startScan = useCallback(async () => {
    if (state.kind !== "unlinked") return;
    setState({ kind: "scanning" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch (e) {
      setState({
        kind: "error",
        message:
          e instanceof Error ? `Camera: ${e.message}` : "Camera permission denied",
      });
      return;
    }
    streamRef.current = stream;

    // Wait for video element to mount
    await new Promise((r) => requestAnimationFrame(r));
    const video = videoRef.current;
    if (!video) {
      stopCamera();
      setState({ kind: "error", message: "Video element missing" });
      return;
    }

    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    try {
      await video.play();
    } catch {
      // Some browsers reject .play() but stream still renders
    }

    const ac = new AbortController();
    scanAbortRef.current = ac;

    try {
      const payload = await scanLinkPayload(video, ac.signal);
      stopCamera();
      setState({ kind: "linking" });

      addLog(`Scanned QR, linking to ${payload.endpoint}...`);

      const deviceId = getOrCreateDeviceId();
      const res = await fetch(payload.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: payload.token, device_id: deviceId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message: body.error || `Link failed (${res.status})`,
        });
        return;
      }

      const data = await res.json();
      if (!data.ok || !data.apiKey) {
        setState({ kind: "error", message: "Server did not return API key" });
        return;
      }

      addLog("Device linked! Saving API key...");
      localStorage.setItem("boondit_r1_api_key", data.apiKey);
      setState({ kind: "linked", apiKey: data.apiKey });
    } catch (e) {
      stopCamera();
      if ((e as DOMException).name === "AbortError") {
        setState({ kind: "unlinked" });
        return;
      }
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Scan failed",
      });
    }
  }, [state, stopCamera, addLog]);

  const cancelScan = useCallback(() => {
    if (state.kind !== "scanning") return;
    stopCamera();
    setState({ kind: "unlinked" });
  }, [state, stopCamera]);

  const handleDisconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    localStorage.removeItem("boondit_r1_api_key");
    setConnected(false);
    setLogs([]);
    setState({ kind: "unlinked" });
  }, []);

  // ─── Render ───────────────────────────────────────────────────

  const statusText =
    state.kind === "booting"
      ? "Booting..."
      : state.kind === "unlinked"
        ? "Not linked"
        : state.kind === "scanning"
          ? "Scanning..."
          : state.kind === "linking"
            ? "Linking..."
            : state.kind === "error"
              ? "Error"
              : connected
                ? "Connected"
                : "Connecting...";

  return (
    <div
      style={{
        fontFamily: "monospace",
        background: "#0a0a0a",
        color: "#e0e0e0",
        minHeight: "100vh",
        padding: "20px",
        margin: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 8px", color: "#FE5F00" }}>
          R1A Client
        </h1>
        <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
          Status:{" "}
          <span
            style={{
              color:
                state.kind === "linked" && connected
                  ? "#4ade80"
                  : state.kind === "scanning" || state.kind === "linking"
                    ? "#fbbf24"
                    : "#f87171",
            }}
          >
            {statusText}
          </span>
        </div>
      </div>

      {/* ─── Booting ─── */}
      {state.kind === "booting" && (
        <div style={{ textAlign: "center", padding: "40px", opacity: 0.5 }}>
          Loading...
        </div>
      )}

      {/* ─── Unlinked: show Link button ─── */}
      {state.kind === "unlinked" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ fontSize: "0.9rem", opacity: 0.6, marginBottom: "20px" }}>
            Scan a pairing QR from your settings to link this device.
          </p>
          <button
            onClick={startScan}
            style={{
              padding: "14px 32px",
              background: "#FE5F00",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "1rem",
              fontWeight: "bold",
            }}
          >
            Link Device
          </button>
        </div>
      )}

      {/* ─── Scanning: camera view ─── */}
      {state.kind === "scanning" && (
        <div style={{ position: "relative", height: "400px", marginBottom: "20px" }}>
          <video
            ref={videoRef}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "4px",
            }}
            playsInline
            muted
            autoPlay
            controls={false}
          />
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <p
              style={{
                background: "rgba(0,0,0,0.6)",
                padding: "4px 12px",
                borderRadius: "4px",
                fontSize: "0.75rem",
              }}
            >
              Point camera at QR
            </p>
            <button
              onClick={cancelScan}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                padding: "6px 16px",
                borderRadius: "4px",
                color: "#fff",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Linking ─── */}
      {state.kind === "linking" && (
        <div style={{ textAlign: "center", padding: "40px", opacity: 0.6 }}>
          <p style={{ fontSize: "0.9rem" }}>Linking device...</p>
        </div>
      )}

      {/* ─── Error ─── */}
      {state.kind === "error" && (
        <div
          style={{
            padding: "20px",
            background: "#1a0a0a",
            border: "1px solid #f87171",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <p style={{ color: "#f87171", fontSize: "0.9rem", marginBottom: "12px" }}>
            {state.message}
          </p>
          <button
            onClick={() => setState({ kind: "unlinked" })}
            style={{
              padding: "8px 16px",
              background: "#333",
              border: "1px solid #444",
              borderRadius: "4px",
              color: "#e0e0e0",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "0.8rem",
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ─── Linked: disconnect button + logs ─── */}
      {state.kind === "linked" && (
        <>
          <button
            onClick={handleDisconnect}
            style={{
              width: "100%",
              padding: "10px",
              background: "#333",
              color: "#e0e0e0",
              border: "1px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "0.85rem",
              marginBottom: "20px",
            }}
          >
            Disconnect &amp; Unlink
          </button>
        </>
      )}

      {/* Logs (always visible when linked) */}
      {state.kind === "linked" && (
        <div
          ref={logContainerRef}
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: "4px",
            padding: "12px",
            height: "300px",
            overflowY: "auto",
            fontSize: "0.75rem",
            lineHeight: "1.5",
          }}
        >
          {logs.length === 0 ? (
            <div style={{ opacity: 0.4 }}>Logs will appear here...</div>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                style={{
                  color:
                    entry.level === "error"
                      ? "#f87171"
                      : entry.level === "warn"
                        ? "#fbbf24"
                        : "#9ca3af",
                  marginBottom: "2px",
                }}
              >
                <span style={{ opacity: 0.5 }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>{" "}
                {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
