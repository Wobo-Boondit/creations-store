import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadImage } from "@/lib/s3";
import { rateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;

// Account avatar upload. Mirrors rhythm's /api/avatar: the client ships an
// already-cropped 256×256 PNG; we enforce a byte cap + content-type, store it
// at a deterministic key, and write the shared users.avatar_url so the new
// picture shows in BOTH apps (same Supabase users row, same CDN bucket).
const MAX_AVATAR_BYTES = 200 * 1024; // 200 KB — generous for 256×256 PNG

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`avatar:${user.id}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (req.headers.get("content-type") !== "image/png") {
    return NextResponse.json({ error: "invalid_type" }, { status: 415 });
  }

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // Deterministic key (overwrites the prior avatar). uploadImage stores under
  // bccs/<filename> and returns the public CDN URL; cache-bust via ?v= so the
  // new image is picked up immediately.
  const url = await uploadImage(`avatars/${user.id}.png`, Buffer.from(buf), "image/png");
  const avatar_url = `${url}?v=${Date.now()}`;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ avatar_url })
    .eq("id", user.id);
  if (error) {
    console.error("[account/avatar] update failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ avatar_url });
}
