"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Link2, Unlink, Key, Plus, Trash2, Copy, Check, Loader2, Smartphone, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { CreationLinkModal } from "@/components/platform/creation-link-modal";
import type { CurrentUser } from "@/lib/auth";

interface Creation {
  client_id: string;
  name: string;
  description: string;
  icon_url: string | null;
  is_first_party: boolean;
  sort_order: number;
  links: CreationDeviceLink[];
  isLinked: boolean;
}

interface CreationDeviceLink {
  id: string;
  device_id: string;
  device_name: string | null;
  linked_at: string;
  last_seen: string | null;
  is_active: boolean;
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

export function PlatformDashboard({ user }: { user: CurrentUser }) {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkModal, setLinkModal] = useState<{ clientId: string; clientName: string } | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDevice, setNewKeyDevice] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [_pending, startTransition] = useTransition();

  const loadData = async () => {
    const [creationsRes, keysRes] = await Promise.all([
      fetch("/api/creations"),
      fetch("/api/keys"),
    ]);
    const creationsData = await creationsRes.json();
    const keysData = await keysRes.json();
    setCreations(creationsData.creations || []);
    setApiKeys(keysData.keys || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUnlink = async (linkId: string, clientId: string) => {
    if (!confirm("Unlink this device? You'll need to re-scan to reconnect.")) return;
    startTransition(async () => {
      const res = await fetch(`/api/creations/${clientId}/links/${linkId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Device unlinked");
        loadData();
      } else {
        toast.error("Failed to unlink");
      }
    });
  };

  const handleCreateKey = async () => {
    if (!newKeyDevice) {
      toast.error("Select a device first");
      return;
    }
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: newKeyDevice, name: newKeyName || "Default" }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKeyValue(data.key);
      setShowNewKey(false);
      setNewKeyName("");
      setNewKeyDevice("");
      loadData();
      toast.success("API key created");
    } else {
      toast.error("Failed to create key");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Key revoked");
        loadData();
      } else {
        toast.error("Failed to revoke");
      }
    });
  };

  const handleDirectLink = async (clientId: string) => {
    startTransition(async () => {
      const res = await fetch("/api/oauth/direct-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        toast.success("Linked successfully. Create an API key below to connect your R1.");
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to link");
      }
    });
  };

  const handleLinkModalClose = () => {
    setLinkModal(null);
    loadData();
  };

  // Collect all linked devices for API key creation
  const linkedDevices: { deviceId: string; deviceName: string; clientName: string }[] = [];
  for (const c of creations) {
    for (const l of c.links) {
      linkedDevices.push({
        deviceId: l.device_id,
        deviceName: l.device_name || l.device_id,
        clientName: c.name,
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Creations Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Linked Creations</h2>
            <p className="text-sm text-muted-foreground">
              R1 creations connected to your account
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {creations.map((creation) => (
            <div
              key={creation.client_id}
              className="rounded-xl border bg-card p-5 flex items-center gap-4"
            >
              {/* Icon */}
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                {creation.icon_url ? (
                  <img src={creation.icon_url} alt={creation.name} className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <span className="text-lg font-bold">{creation.name[0]}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{creation.name}</p>
                  {creation.is_first_party && (
                    <Badge variant="secondary" className="text-xs">1st Party</Badge>
                  )}
                  {creation.isLinked && (
                    <Badge className="text-xs bg-green-500/10 text-green-500 hover:bg-green-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1" />
                      Linked
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{creation.description}</p>

                {/* Device list */}
                {creation.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {creation.links.map((link) => (
                      <div key={link.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1">
                        <Smartphone className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-mono">{link.device_name || link.device_id.slice(0, 12)}</span>
                        <button
                          onClick={() => handleUnlink(link.id, creation.client_id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Unlink className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Link button */}
              {!creation.isLinked && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (creation.client_id === 'r1a') {
                      handleDirectLink(creation.client_id);
                    } else {
                      setLinkModal({ clientId: creation.client_id, clientName: creation.name });
                    }
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1.5" />
                  {_pending ? "Linking..." : "Link"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API Keys Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              OpenAI-compatible keys for R1 API access
            </p>
          </div>
          {linkedDevices.length > 0 && (
            <Button size="sm" onClick={() => setShowNewKey(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Key
            </Button>
          )}
        </div>

        {/* New key form */}
        {showNewKey && (
          <div className="rounded-xl border bg-card p-5 mb-4 space-y-3">
            <h3 className="font-medium">Create API Key</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Device</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={newKeyDevice}
                  onChange={(e) => setNewKeyDevice(e.target.value)}
                >
                  <option value="">Select a device...</option>
                  {linkedDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.deviceName} ({d.clientName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Label (optional)</label>
                <input
                  type="text"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Living Room R1"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateKey}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowNewKey(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* New key display (shown once) */}
        {newKeyValue && (
          <div className="rounded-xl border-2 border-yellow-500/30 bg-yellow-500/5 p-5 mb-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                <Key className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Save this key now — it won't be shown again</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-background border px-3 py-2 text-xs font-mono break-all">
                    {newKeyValue}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(newKeyValue);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setNewKeyValue(null)}>
                  I've saved it
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Keys list */}
        {apiKeys.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <Key className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {linkedDevices.length === 0
                ? "Link a creation first, then create an API key for it"
                : "No API keys yet. Create one to get started."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {apiKeys.map((key) => (
              <div key={key.key_id} className="flex items-center gap-4 p-4">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{key.name}</p>
                  <code className="text-xs font-mono text-muted-foreground">{key.key_preview}</code>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{key.device_id.slice(0, 12)}...</p>
                  {key.last_used ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {new Date(key.last_used).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Never used</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-400" onClick={() => handleRevokeKey(key.key_id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link modal */}
      {linkModal && (
        <CreationLinkModal
          clientId={linkModal.clientId}
          clientName={linkModal.clientName}
          open={true}
          onClose={handleLinkModalClose}
        />
      )}
    </div>
  );
}
