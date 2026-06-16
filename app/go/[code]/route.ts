import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ code: string }>;
}

// Helper function to anonymize IP address (zero out last octet for privacy)
function anonymizeIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) {
    parts[3] = "0";
    return parts.join(".");
  }
  // For IPv6 or other formats, return a partial value
  return ip.split(":").slice(0, 3).join(":") + ":xxxx";
}

// Helper function to detect device type from user agent
function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac")) return "macOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Unknown";
}

// Helper function to generate session ID
function getSessionId(ip: string, userAgent: string): string {
  // Simple session identifier based on IP and device type
  const device = getDeviceType(userAgent);
  return `${anonymizeIp(ip)}_${device}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const headersList = await headers();
  const supabase = createAdminClient();

  // Find creation by proxy code
  const { data: result, error } = await supabase
    .from("store_creations")
    .select("*")
    .eq("proxy_code", code)
    .limit(1);

  if (!result || result.length === 0 || error) {
    // Creation not found - redirect to home with error
    return redirect("/?error=invalid-link");
  }

  const creation = result[0];

  // Check if creation is flagged
  if (creation.is_flagged) {
    // Redirect to warning page
    return redirect(`/go/${code}/warning?reason=${encodeURIComponent(creation.flag_reason || "This creation has been flagged")}`);
  }

  // Extract tracking information
  const forwarded = headersList.get("x-forwarded-for");
  const realIp = headersList.get("x-real-ip");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : realIp || "localhost";

  // Normalize local development IPs
  const normalizedIp =
    ip === "::1" || ip === "127.0.0.1" || ip === "localhost"
      ? "local_dev"
      : ip;

  const userAgent = headersList.get("user-agent") || "Unknown";
  const referrer = headersList.get("referer") || null;

  // Generate session ID
  const sessionId = getSessionId(normalizedIp, userAgent);

  // Always record the click for analytics
  await supabase.from("store_clicks").insert({
    creation_id: creation.id,
    session_id: sessionId,
    user_agent: userAgent,
    referrer,
    clicked_at: new Date().toISOString(),
  });

  // Record install — QR scan IS the install on R1
  // De-duplicate per session so refreshing doesn't inflate numbers
  const { data: existingInstall } = await supabase
    .from("store_installs")
    .select("id")
    .eq("creation_id", creation.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!existingInstall) {
    await supabase.from("store_installs").insert({
      creation_id: creation.id,
      session_id: sessionId,
      user_agent: userAgent,
      installed_at: new Date().toISOString(),
    });
  }

  // Validate URL scheme before redirect (prevent open redirect / javascript:)
  try {
    const targetUrl = new URL(creation.url);
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return redirect("/?error=invalid-url");
    }
  } catch {
    return redirect("/?error=invalid-url");
  }

  // Redirect to the actual creation URL
  return redirect(creation.url);
}
