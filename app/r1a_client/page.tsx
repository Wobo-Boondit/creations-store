"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";

// Where the user generates a pairing QR. The unlinked screen shows a QR to this
// page so a phone can jump straight to setup.
const SETTINGS_URL = "https://creations.boondit.site/dashboard/settings";

// ─── Types ──────────────────────────────────────────────────────

interface LogEntry {
  message: string;
  level: "info" | "warn" | "error";
  timestamp: string;
}

type LinkPayload = { v: number; token: string; endpoint: string };

// Minimal shape of the r1-create default export we rely on. The real types
// ship with the package; we keep a local alias so this file type-checks even
// where the dependency isn't installed (desktop dev / CI without the SDK).
type R1MessageResponse = { message?: string; content?: string; data?: string };
type R1Sdk = {
  messaging?: {
    sendMessage: (message: string, options?: Record<string, unknown>) => Promise<void>;
    onMessage: (handler: (response: R1MessageResponse) => void) => void;
  };
  llm?: {
    textToSpeechAudio?: (
      text: string,
      options?: { rate?: number; volume?: number },
    ) => Promise<Blob | null>;
  };
  vision?: { analyzeImage: (img: string, opts: Record<string, unknown>) => void };
  image?: { analyzeImage: (img: string, opts: Record<string, unknown>) => void };
};

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
  // The r1-create SDK instance (loaded lazily — it only exists in the R1
  // WebView). Same package rhythm and R-PlusPlus use.
  const r1Ref = useRef<R1Sdk | null>(null);
  // The chat request currently awaiting an LLM reply. The R1's onMessage
  // callback carries no request id, so we correlate by the single in-flight
  // request — the server (store.ts) only allows one chat per device at a time.
  const pendingChatRef = useRef<{ requestId: string; originalMessage: string } | null>(
    null,
  );

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

  // ─── Load the R1 SDK + register the LLM response listener (once) ──
  // r1-create is browser-only (it touches window/PluginMessageHandler), so we
  // import it dynamically — the static import would break SSR, and on desktop
  // the import simply yields an SDK whose messaging is a no-op. The onMessage
  // handler is the half that was missing before: without it, every chat
  // request sat unanswered until the server's 30s timeout.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const mod = await import("r1-create");
        if (disposed) return;
        const r1 = (mod.default ?? (mod as { r1?: R1Sdk }).r1) as R1Sdk;
        r1Ref.current = r1;
        if (r1?.messaging?.onMessage) {
          r1.messaging.onMessage((response) => {
            // The R1 replies with { message: "..." } and no request id, so we
            // pair it with the single in-flight chat request.
            const pending = pendingChatRef.current;
            const socket = socketRef.current;
            if (!pending || !socket?.connected) return;
            const text =
              response?.message || response?.content || "(empty response)";
            socket.emit("response", {
              requestId: pending.requestId,
              response: text,
              originalMessage: pending.originalMessage,
              model: "r1-llm",
              timestamp: new Date().toISOString(),
            });
            addLog(`Sent LLM response (${pending.requestId})`);
            pendingChatRef.current = null;
          });
          addLog("R1 SDK ready");
        } else {
          addLog("R1 SDK has no messaging API (desktop?)", "warn");
        }
      } catch {
        addLog("R1 SDK unavailable — running outside the R1 WebView", "warn");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [addLog]);

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
      // Hand the prompt to the R1 LLM and stash the request id. The reply
      // arrives asynchronously on the SDK's onMessage callback (registered
      // once, above), which emits the `response` the server is waiting on.
      socket.on("chat_completion", (data: any) => {
        const msgData = data.data || data;
        const requestId = msgData.requestId;
        const message = msgData.message || "";
        const imageBase64 = msgData.imageBase64;
        const pluginId = msgData.pluginId;

        addLog(`Chat request received (${requestId})`);

        const r1 = r1Ref.current;

        if (r1?.messaging?.sendMessage) {
          try {
            const options: Record<string, unknown> = {
              useLLM: true,
              wantsR1Response: false,
              wantsJournalEntry: true,
              requestId,
            };
            if (imageBase64) options.imageBase64 = imageBase64;
            if (pluginId) options.pluginId = pluginId;

            // Record the in-flight request so onMessage can route the reply.
            pendingChatRef.current = { requestId, originalMessage: message };

            if (imageBase64 && (r1.vision || r1.image)) {
              const visionAPI = (r1.vision || r1.image)!;
              visionAPI.analyzeImage(imageBase64, { message, ...options });
            } else {
              // sendMessage is async; the LLM text comes back via onMessage.
              Promise.resolve(r1.messaging.sendMessage(message, options)).catch(
                (err: Error) => {
                  pendingChatRef.current = null;
                  addLog(`R1 sendMessage failed: ${err.message}`, "error");
                  socket.emit("device_error", { requestId, error: err.message });
                },
              );
            }

            socket.emit("message_received", {
              requestId,
              timestamp: new Date().toISOString(),
            });
          } catch (err: any) {
            pendingChatRef.current = null;
            addLog(`R1 SDK error: ${err.message}`, "error");
            socket.emit("device_error", { requestId, error: err.message });
          }
        } else {
          addLog("R1 SDK not available", "warn");
          socket.emit("device_error", {
            requestId,
            error: "R1 SDK unavailable on this device",
          });
        }
      });

      // ─── TTS Handler ─────────────────────────────────────────
      // textToSpeechAudio returns a Blob; we base64-encode it and ship it back
      // as `tts_response`, which the /v1/audio/speech proxy decodes to binary.
      socket.on("text_to_speech", async (data: any) => {
        const msgData = data.data || data;
        const requestId = msgData.requestId;
        const text = msgData.text || msgData.input || "";
        const speed = typeof msgData.speed === "number" ? msgData.speed : 1.0;

        addLog(`TTS request received (${requestId})`);

        const r1 = r1Ref.current;
        if (!r1?.llm?.textToSpeechAudio) {
          addLog("R1 TTS API not available", "warn");
          socket.emit("device_error", {
            requestId,
            error: "R1 TTS unavailable on this device",
          });
          return;
        }

        try {
          const blob = await r1.llm.textToSpeechAudio(text, {
            rate: speed,
            volume: 0.8,
          });
          if (!blob) {
            socket.emit("device_error", {
              requestId,
              error: "TTS returned no audio",
            });
            return;
          }
          const buf = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < buf.length; i++) {
            binary += String.fromCharCode(buf[i]);
          }
          socket.emit("tts_response", {
            requestId,
            audioData: btoa(binary),
            audioFormat: "mp3",
            timestamp: new Date().toISOString(),
          });
          addLog(`Sent TTS audio (${requestId})`);
        } catch (err: any) {
          addLog(`TTS error: ${err.message}`, "error");
          socket.emit("device_error", { requestId, error: err.message });
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

      // SECURITY: never POST the pairing token to whatever URL the QR claims —
      // a malicious QR could set `endpoint` to an attacker origin and exfiltrate
      // the token. The link endpoint is always same-origin, so we ignore the
      // QR's endpoint and reject it if it points anywhere but our own
      // /api/r1a/link. Only the token is trusted from the payload.
      const LINK_PATH = "/api/r1a/link";
      let endpointOk = false;
      try {
        const u = new URL(payload.endpoint, window.location.origin);
        endpointOk =
          u.origin === window.location.origin && u.pathname === LINK_PATH;
      } catch {
        endpointOk = false;
      }
      if (!endpointOk) {
        setState({
          kind: "error",
          message: "Untrusted pairing QR (bad endpoint)",
        });
        return;
      }

      setState({ kind: "linking" });
      addLog("Scanned QR, linking…");

      const deviceId = getOrCreateDeviceId();
      const res = await fetch(LINK_PATH, {
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
    <div className="flex h-full w-full flex-col bg-background p-2.5 font-sans text-foreground">
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

      {/* ─── Unlinked: setup QR + instructions, then Link button ─── */}
      {state.kind === "unlinked" && (
        <div className="flex flex-1 flex-col items-center overflow-y-auto px-1 text-center scrollbar-hide">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Set up R1A
          </p>
          <div className="mb-2 rounded bg-white p-1.5">
            <QRCodeSVG value={SETTINGS_URL} size={92} />
          </div>
          <p className="mb-2 text-[9px] leading-snug text-muted-foreground">
            On your phone, scan this or visit{" "}
            <span className="text-foreground">creations.boondit.site</span> →
            Settings → R1A and tap <span className="text-foreground">Pair</span>.
          </p>
          <ol className="mb-3 space-y-0.5 text-left text-[9px] leading-snug text-muted-foreground">
            <li>
              <span className="text-primary">1.</span> Sign in &amp; open
              Settings → R1A
            </li>
            <li>
              <span className="text-primary">2.</span> Tap “Pair R1A” to show a
              QR
            </li>
            <li>
              <span className="text-primary">3.</span> Tap below, then scan that
              QR
            </li>
          </ol>
          <button
            onClick={startScan}
            className="rounded bg-primary px-4 py-1.5 text-[11px] font-semibold text-primary-foreground active:scale-95"
          >
            Scan pairing QR
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
