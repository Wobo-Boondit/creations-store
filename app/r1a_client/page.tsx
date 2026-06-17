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
  // Everything is authored in device-pixels for the R1's 240×282 canvas
  // (see layout.tsx). The scanning view is full-bleed; every other view is
  // a centered Screen. Mirrors rhythm's creation-app.tsx.

  const statusColor =
    state.kind === "linked" && connected
      ? "text-green-400"
      : state.kind === "scanning" || state.kind === "linking"
        ? "text-amber-400"
        : "text-red-400";

  const statusText =
    state.kind === "booting"
      ? "Booting…"
      : state.kind === "unlinked"
        ? "Not linked"
        : state.kind === "scanning"
          ? "Scanning…"
          : state.kind === "linking"
            ? "Linking…"
            : state.kind === "error"
              ? "Error"
              : connected
                ? "Connected"
                : "Connecting…";

  // ─── Scanning: full-bleed camera ───
  if (state.kind === "scanning") {
    return (
      <div className="relative h-full w-full bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          controls={false}
        />
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5">
          <p className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
            Point camera at QR
          </p>
          <button
            onClick={cancelScan}
            className="rounded bg-white/10 px-3 py-1 text-[10px] text-white active:scale-95"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background p-2.5 font-mono text-foreground">
      {/* Header */}
      <div className="mb-2 flex shrink-0 items-baseline justify-between">
        <h1 className="text-sm font-bold text-primary">R1A Client</h1>
        <span className={`text-[10px] ${statusColor}`}>{statusText}</span>
      </div>

      {/* ─── Booting ─── */}
      {state.kind === "booting" && (
        <div className="flex flex-1 items-center justify-center text-[11px] opacity-50">
          Loading…
        </div>
      )}

      {/* ─── Unlinked: Link button ─── */}
      {state.kind === "unlinked" && (
        <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
          <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
            Scan a pairing QR from your settings to link this device.
          </p>
          <button
            onClick={startScan}
            className="rounded bg-primary px-4 py-1.5 text-[11px] font-semibold text-primary-foreground active:scale-95"
          >
            Link Device
          </button>
        </div>
      )}

      {/* ─── Linking ─── */}
      {state.kind === "linking" && (
        <div className="flex flex-1 items-center justify-center text-[11px] opacity-60">
          Linking device…
        </div>
      )}

      {/* ─── Error ─── */}
      {state.kind === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
          <p className="mb-1 text-[11px] font-semibold text-destructive">Error</p>
          <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
            {state.message}
          </p>
          <button
            onClick={() => setState({ kind: "unlinked" })}
            className="rounded bg-muted px-3 py-1 text-[10px] text-foreground active:scale-95"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ─── Linked: disconnect + logs ─── */}
      {state.kind === "linked" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            onClick={handleDisconnect}
            className="mb-2 shrink-0 rounded bg-muted px-3 py-1.5 text-[10px] text-foreground active:scale-95"
          >
            Disconnect &amp; Unlink
          </button>
          <div
            ref={logContainerRef}
            className="min-h-0 flex-1 overflow-y-auto rounded border border-border bg-black/40 p-2 text-[9px] leading-snug scrollbar-hide"
          >
            {logs.length === 0 ? (
              <div className="opacity-40">Logs will appear here…</div>
            ) : (
              logs.map((entry, i) => (
                <div
                  key={i}
                  className={
                    entry.level === "error"
                      ? "text-red-400"
                      : entry.level === "warn"
                        ? "text-amber-400"
                        : "text-muted-foreground"
                  }
                >
                  <span className="opacity-50">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  {entry.message}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
