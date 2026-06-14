import { NextResponse } from "next/server";
import { boho } from "@/lib/boho";
import { checkRateLimit } from "@/lib/admin-rate-limit";

// Wrap BOHO login with rate limiting to prevent brute-force attacks
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(ip);

  if (!allowed) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  // Delegate to BOHO handler
  return boho.handlers.POST(request);
}
