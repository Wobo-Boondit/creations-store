"use client";

import { useState, useEffect, useTransition } from "react";
import { updateProfile, signOut } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Check,
  LogOut,
  Smartphone,

  Unlink,
  Key,
  Plus,
  Trash2,
  Copy,
  Clock,
  Code,
  ChevronDown,
  AlertTriangle,
  QrCode,
  RefreshCw,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CurrentUser } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────

interface CreationLink {
  id: string;
  client_id: string;
  device_id: string;
  device_name: string | null;
  linked_at: string;
  last_seen: string | null;
  is_active: boolean;
}

interface Creation {
  client_id: string;
  name: string;
  description: string;
  icon_url: string | null;
  is_first_party: boolean;
  sort_order: number;
  links: CreationLink[];
  isLinked: boolean;
}

interface ApiKey {
  key_id: string;
  key_preview: string;
  device_id: string;
  name: string;
  created_at: string;
  last_used: string | null;
  is_active: boolean;
}

interface R1AStats {
  totalRequests: number;
  deviceOnline: boolean;
  lastActivity: string | null;
}

const API_BASE_URL = "https://creations.boondit.site";

// ─── Main Component ───────────────────────────────────────────────

export function AccountSettings({ user }: { user: CurrentUser }) {
  const [username, setUsername] = useState(user.username || user.name);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfile(null, { username });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Profile card */}
      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-16 w-16 rounded-full border"
            />
          ) : (
            <div className="h-16 w-16 rounded-full border bg-muted flex items-center justify-center text-xl font-bold">
              {user.name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <div>
            <p className="font-semibold text-lg">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="username">Display Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">
              This name appears across all Boondit services
            </p>
          </div>
          <Button type="submit" disabled={isPending || username === (user.username || user.name)}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Connected services */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Connected Services</h3>
        <p className="text-sm text-muted-foreground">
          Your Boondit account works across these services:
        </p>

        <div className="space-y-3">
          <ServiceRow
            name="Creations"
            url="https://creations.boondit.site"
            connected
          />
          <ServiceRow
            name="Rhythm"
            url="https://rhythm.boondit.site"
            connected
          />
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-[#5865F2] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Discord</p>
              <p className="text-xs text-muted-foreground">
                Signed in via Discord OAuth
              </p>
            </div>
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Connected
            </span>
          </div>
        </div>
      </div>

      {/* ─── R1A Sections ─────────────────────────────────────── */}
      <R1ADeviceSection userId={user.id} />
      <ApiKeysSection />
      <ApiDocsSection />
      {/* ─── End R1A Sections ─────────────────────────────────── */}

      {/* Account info */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h3 className="font-semibold">Account Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Account ID</p>
            <p className="font-mono text-xs truncate">{user.id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <p>{user.isAdmin ? "Admin" : "Member"}</p>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <form
        action={signOut}
        className="rounded-xl border border-red-900/30 bg-red-950/20 p-6 flex items-center justify-between"
      >
        <div>
          <h3 className="font-semibold text-red-400">Sign Out</h3>
          <p className="text-sm text-muted-foreground">
            Sign out of your Boondit account on this device
          </p>
        </div>
        <Button
          type="submit"
          variant="outline"
          className="border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-400"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </form>
    </div>
  );
}

// ─── R1A Device Section ───────────────────────────────────────────

type PairStep = "idle" | "scanning" | "linked";

function R1ADeviceSection({ userId }: { userId: string }) {
  const [r1aCreation, setR1aCreation] = useState<Creation | null>(null);
  const [stats, setStats] = useState<R1AStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairStep, setPairStep] = useState<PairStep>("idle");
  const [pairToken, setPairToken] = useState<string | null>(null);
  const [pairExpiresAt, setPairExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadData = async () => {
    try {
      const res = await fetch("/api/creations");
      const data = await res.json();
      const r1a = (data.creations || []).find(
        (c: Creation) => c.client_id === "r1a",
      );
      setR1aCreation(r1a || null);
    } catch {
      // ignore
    }
    fetch("/api/r1a/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) setStats(s as R1AStats);
      })
      .catch(() => {});
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Realtime: detect when device gets linked while showing QR
  useEffect(() => {
    if (pairStep !== "scanning") return;
    const sb = createBrowserClient();
    const channel = sb
      .channel(`r1a-pair:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creation_links",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { client_id: string; is_active: boolean };
          if (row.client_id === "r1a" && row.is_active) {
            setPairStep("linked");
            toast.success("R1A device linked");
            loadData();
          }
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [pairStep, userId]);

  const fetchPairToken = async () => {
    setError(null);
    const res = await fetch("/api/r1a/pair-token", { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to create pairing token");
      return null;
    }
    const data = await res.json();
    return data.token as string;
  };

  const startPairing = async () => {
    const token = await fetchPairToken();
    if (!token) return;
    setPairToken(token);
    setPairExpiresAt(Date.now() + 300 * 1000);
    setPairStep("scanning");
  };

  // Countdown + auto-refresh
  useEffect(() => {
    if (pairStep !== "scanning" || !pairToken) return;
    const tick = () => {
      const ms = pairExpiresAt - Date.now();
      const s = Math.max(0, Math.floor(ms / 1000));
      setSecondsLeft(s);
      if (s === 0) {
        // Auto-refresh token
        fetchPairToken().then((t) => {
          if (t) {
            setPairToken(t);
            setPairExpiresAt(Date.now() + 300 * 1000);
          }
        });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairStep, pairToken, pairExpiresAt]);

  const handleUnlink = () => {
    const link = r1aCreation?.links?.[0];
    if (!link || !r1aCreation) return;
    if (!confirm("Unlink your R1A device? You can re-link at any time.")) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/creations/${r1aCreation.client_id}/links/${link.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("R1A device unlinked");
        loadData();
        setPairStep("idle");
      } else {
        toast.error("Failed to unlink");
      }
    });
  };

  const link = r1aCreation?.links?.[0] || null;
  const online = stats?.deviceOnline === true;

  // ─── Pairing QR view ──────────────────────────────────────────
  if (pairStep === "scanning" && pairToken) {
    const qrPayload = JSON.stringify({
      v: 1,
      token: pairToken,
      endpoint: `${API_BASE_URL}/api/r1a/link`,
    });
    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, "0");
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">Scan with R1</h3>
            <p className="text-xs text-muted-foreground">
              Open the R1 camera and scan this code
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="rounded-lg border p-4 bg-white">
            <QRCodeSVG value={qrPayload} size={256} marginSize={1} />
          </div>
          <p className="text-xs text-muted-foreground">
            Waiting for device &middot; {mins}:{secs}
          </p>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <button
            onClick={() => {
              setPairStep("idle");
              setPairToken(null);
            }}
            className="text-xs text-muted-foreground hover:underline mt-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ─── Just linked confirmation ─────────────────────────────────
  if (pairStep === "linked") {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="font-semibold text-lg">Device Linked</h3>
          <p className="text-sm text-muted-foreground">
            Your R1 is now connected. Generate an API key below to start using it.
          </p>
          <Button
            onClick={() => setPairStep("idle")}
            size="sm"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ─── Default view (idle / linked / loading) ───────────────────
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">R1A Device</h3>
            <p className="text-xs text-muted-foreground">
              Control your R1 from anywhere via the OpenAI-compatible API
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : link ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">
                  {link.device_name || link.device_id}
                </p>
                <Badge
                  variant="secondary"
                  className={
                    online
                      ? "bg-green-500/10 text-green-500 hover:bg-green-500/10"
                      : ""
                  }
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full mr-1 ${
                      online ? "bg-green-500" : "bg-muted-foreground"
                    }`}
                  />
                  {online ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {link.last_seen
                    ? `Last seen ${formatRelativeTime(link.last_seen)}`
                    : `Linked ${formatRelativeTime(link.linked_at)}`}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUnlink}
              className="border-red-900/40 text-red-400 hover:bg-red-900/20 hover:text-red-400"
            >
              <Unlink className="h-3.5 w-3.5 mr-1.5" />
              Unlink
            </Button>
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total Requests</p>
                <p className="font-semibold">{stats.totalRequests}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="font-semibold text-sm">
                  {stats.lastActivity
                    ? formatRelativeTime(stats.lastActivity)
                    : "Never"}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Link your R1A device to generate API keys and control your R1
            remotely. Scan a QR code with your R1 camera to pair.
          </p>
          <Button onClick={startPairing} size="sm">
            <QrCode className="h-4 w-4 mr-2" />
            Pair R1A
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [r1aLinked, setR1aLinked] = useState(false);
  const [r1aDeviceId, setR1aDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    const [keysRes, creationsRes] = await Promise.all([
      fetch("/api/keys"),
      fetch("/api/creations"),
    ]);
    const keysData = await keysRes.json();
    const creationsData = await creationsRes.json();

    setKeys(keysData.keys || []);
    const r1a = (creationsData.creations || []).find(
      (c: Creation) => c.client_id === "r1a",
    );
    setR1aLinked(!!r1a?.isLinked);
    setR1aDeviceId(r1a?.links?.[0]?.device_id || null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    if (!r1aDeviceId) {
      toast.error("Link your R1A device first");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: r1aDeviceId,
          name: keyName.trim() || "Default",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setShowForm(false);
        setKeyName("");
        loadData();
        toast.success("API key created");
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to create key");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Key revoked");
      loadData();
    } else {
      toast.error("Failed to revoke key");
    }
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">API Keys</h3>
            <p className="text-xs text-muted-foreground">
              OpenAI-compatible keys for R1 API access
            </p>
          </div>
        </div>
        {r1aLinked && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create New Key
          </Button>
        )}
      </div>

      {!r1aLinked && !loading && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Link your R1A device above to create API keys.
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="keyname">Label (optional)</Label>
            <Input
              id="keyname"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Living Room R1"
              maxLength={64}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Key"
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setKeyName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {newKey && (
        <div className="rounded-lg border-2 border-yellow-500/40 bg-yellow-500/5 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500">
              Save this key now. It will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-background px-3 py-2 text-xs font-mono break-all">
              {newKey}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNewKey(null)}
          >
            I&apos;ve saved it
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
          <Key className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm text-muted-foreground">
            {r1aLinked
              ? "No API keys yet. Create one to get started."
              : "Link your R1A device first, then create a key."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {keys.map((k) => (
            <div key={k.key_id} className="flex items-center gap-3 p-3">
              <Key className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{k.name}</p>
                <code className="text-xs font-mono text-muted-foreground">
                  {k.key_preview}
                </code>
              </div>
              <div className="text-right shrink-0">
                {k.last_used ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" />
                    {new Date(k.last_used).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Never used</p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-400"
                onClick={() => handleRevoke(k.key_id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── API Documentation Section ────────────────────────────────────

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/r1a/v1/chat/completions",
    description: "Chat with your R1 (OpenAI-compatible)",
    curl: `curl ${API_BASE_URL}/api/r1a/v1/chat/completions \\
  -H "Authorization: Bearer boondit_r1_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"r1-command","messages":[{"role":"user","content":"Hello"}]}'`,
  },
  {
    method: "GET",
    path: "/api/r1a/v1/models",
    description: "List available models",
    curl: `curl ${API_BASE_URL}/api/r1a/v1/models \\
  -H "Authorization: Bearer boondit_r1_..."`,
  },
  {
    method: "POST",
    path: "/api/r1a/v1/audio/speech",
    description: "Text to speech via your R1",
    curl: `curl ${API_BASE_URL}/api/r1a/v1/audio/speech \\
  -H "Authorization: Bearer boondit_r1_..." \\
  -H "Content-Type: application/json" \\
  -d '{"input":"Hello world","voice":"alloy"}'`,
  },
  {
    method: "GET",
    path: "/api/r1a/health",
    description: "Server health check (no auth required)",
    curl: `curl ${API_BASE_URL}/api/r1a/health`,
  },
];

function ApiDocsSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Code className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">API Documentation</h3>
            <p className="text-xs text-muted-foreground">
              OpenAI-compatible endpoints for your R1
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t px-6 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Base URL:{" "}
            <code className="font-mono text-xs">{API_BASE_URL}</code>
          </p>

          <div className="space-y-4">
            {ENDPOINTS.map((ep) => (
              <div key={ep.method + ep.path} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-xs font-semibold"
                  >
                    {ep.method}
                  </Badge>
                  <code className="font-mono text-xs">{ep.path}</code>
                </div>
                <p className="text-xs text-muted-foreground">{ep.description}</p>
                <pre className="rounded-md border bg-muted/40 p-3 overflow-x-auto text-xs font-mono">
                  {ep.curl}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function ServiceRow({
  name,
  url,
  connected,
}: {
  name: string;
  url: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{url}</p>
      </div>
      {connected ? (
        <span className="text-xs text-green-500 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Active
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Not connected</span>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
