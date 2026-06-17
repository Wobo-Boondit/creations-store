import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStoreApiKey, API_SCOPES, type ApiScope } from "@/lib/api/keys";

export const runtime = "nodejs";

// Session-authenticated management of a user's store API keys. (The keys
// themselves authenticate the public /api/v1 surface; these endpoints live in
// the dashboard and use the Supabase session.)

const MAX_KEYS_PER_USER = 10;

// GET /api/v1/keys — list the current user's keys (never returns plaintext).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_api_keys")
    .select("key_id, key_preview, name, scopes, created_at, last_used, expires_at, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: data || [] });
}

// POST /api/v1/keys — create a key. Body: { name?, scopes?: ("read"|"write")[] }
// Returns the plaintext ONCE.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 64)
      : "Default";

  let scopes: ApiScope[] = ["read"];
  if (Array.isArray(body.scopes)) {
    const requested = body.scopes.filter((s: unknown): s is ApiScope =>
      (API_SCOPES as readonly string[]).includes(s as string),
    );
    if (requested.length) scopes = Array.from(new Set(requested));
  }

  const supabase = createAdminClient();

  // Cap keys per user to limit blast radius / spam.
  const { count } = await supabase
    .from("store_api_keys")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if ((count || 0) >= MAX_KEYS_PER_USER) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_KEYS_PER_USER} active keys. Revoke one first.` },
      { status: 409 },
    );
  }

  const key = generateStoreApiKey();
  const { error } = await supabase.from("store_api_keys").insert({
    key_id: key.keyId,
    key_hash: key.hash,
    key_preview: key.preview,
    user_id: user.id,
    name,
    scopes,
    is_active: true,
  });
  if (error) {
    console.error("[api] key create failed:", error.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // Plaintext is shown exactly once.
  return NextResponse.json({
    apiKey: key.plaintext,
    keyId: key.keyId,
    preview: key.preview,
    name,
    scopes,
  });
}
