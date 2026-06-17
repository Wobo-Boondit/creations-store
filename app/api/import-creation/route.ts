import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadImage } from "@/lib/s3";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/import-creation
// Body: { shareUrl } — a rabbit.tech /share_creation link (or any URL whose
// query carries url/title/description/iconUrl/screenshotUrl/themeColor).
// Parses the params, downloads the icon/screenshot through the SSRF guard, and
// re-hosts them on the Boondit CDN so the prefilled creation form can submit
// them (createCreation requires CDN-hosted images).

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// rabbit.tech sends themeColor as 0xAARRGGBB (or 0xRRGGBB) — normalize to
// the #RRGGBB the store expects. Returns null if it can't be parsed.
function normalizeThemeColor(raw: string | null): string | null {
  if (!raw) return null;
  let hex = raw.trim();
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  hex = hex.replace(/^#/, "");
  if (hex.length === 8) hex = hex.slice(2); // drop alpha (AARRGGBB → RRGGBB)
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toUpperCase()}`;
  return null;
}

// Download a remote image through the SSRF guard and re-host on the CDN.
// Returns the CDN URL, or null if it can't be fetched/validated (non-fatal —
// the user can still upload manually).
async function rehostImage(
  rawUrl: string | null,
  userId: string,
): Promise<string | null> {
  if (!rawUrl) return null;
  const checked = await assertPublicHttpUrl(rawUrl);
  if ("error" in checked) return null;

  try {
    const res = await fetch(checked.url.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CreationsBot/1.0)" },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) return null; // not an allowed image type

    // Enforce size: prefer Content-Length, but also cap the actual read.
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared && declared > MAX_IMAGE_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;

    const filename = `${userId}/${randomUUID()}.${ext}`;
    return await uploadImage(filename, buf, contentType);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const shareUrl = typeof body.shareUrl === "string" ? body.shareUrl.trim() : "";
  if (!shareUrl) {
    return NextResponse.json({ error: "shareUrl is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(shareUrl);
  } catch {
    return NextResponse.json({ error: "Invalid share URL" }, { status: 400 });
  }

  const p = parsed.searchParams;
  // The creation's own URL (where the app lives) — must be http(s).
  const appUrl = p.get("url") || "";
  const title = p.get("title") || "";
  const description = p.get("description") || "";

  // Re-host both images in parallel; failures degrade to null (manual upload).
  const [iconUrl, screenshotUrl] = await Promise.all([
    rehostImage(p.get("iconUrl"), user.id),
    rehostImage(p.get("screenshotUrl"), user.id),
  ]);

  const prefill = {
    title,
    description,
    url: /^https?:\/\//i.test(appUrl) ? appUrl : appUrl ? `https://${appUrl}` : "",
    themeColor: normalizeThemeColor(p.get("themeColor")) || undefined,
    iconUrl: iconUrl || undefined,
    screenshotUrl: screenshotUrl || undefined,
  };

  return NextResponse.json({
    prefill,
    warnings: {
      iconFailed: !!p.get("iconUrl") && !iconUrl,
      screenshotFailed: !!p.get("screenshotUrl") && !screenshotUrl,
    },
  });
}
