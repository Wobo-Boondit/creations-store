import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// User-scoped public-API keys for the creations store. Distinct from the R1A
// device keys in lib/auth/api-key.ts (different table, different prefix) so the
// two systems can't be confused. Only the peppered hash is stored.

const KEY_PREFIX = "boondit_sk_"; // "store key"
export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface StoreApiKeyData {
  keyId: string;
  plaintext: string; // shown once
  hash: string;
  preview: string;
}

export function generateStoreApiKey(): StoreApiKeyData {
  const random = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = hashStoreApiKey(plaintext);
  const keyId = `sk_${random.slice(0, 8)}_${Date.now().toString(36)}`;
  const preview = `${plaintext.slice(0, 14)}…${plaintext.slice(-4)}`;
  return { keyId, plaintext, hash, preview };
}

export function hashStoreApiKey(key: string): string {
  // Peppered SHA-256 — same construction as the R1A keys so we reuse the
  // PLATFORM_SIGNING_SECRET pepper, but over a distinct prefix namespace.
  return createHash("sha256")
    .update(key)
    .update(process.env.PLATFORM_SIGNING_SECRET || "")
    .digest("hex");
}

export function looksLikeStoreKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

export interface VerifiedStoreKey {
  keyId: string;
  userId: string;
  scopes: ApiScope[];
}

/**
 * Resolve a Bearer token to a verified key. Returns null on any failure
 * (bad format, unknown, revoked, expired). Updates last_used best-effort.
 */
export async function verifyStoreApiKey(
  authHeader: string | null,
): Promise<VerifiedStoreKey | null> {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token || !looksLikeStoreKey(token)) return null;

  const hash = hashStoreApiKey(token);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_api_keys")
    .select("key_id, user_id, scopes, expires_at")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }

  // Best-effort last_used; never block the request on it.
  supabase
    .from("store_api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("key_id", data.key_id)
    .then(({ error: e }) => {
      if (e) console.error("[api] last_used update failed:", e.message);
    });

  const scopes = (Array.isArray(data.scopes) ? data.scopes : []).filter(
    (s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s),
  );

  return { keyId: data.key_id, userId: data.user_id, scopes };
}

export function hasScope(key: VerifiedStoreKey, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}
