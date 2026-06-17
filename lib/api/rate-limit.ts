import { createAdminClient } from "@/lib/supabase/admin";

// Durable, fixed-window rate limiting backed by Postgres (api_rate_limit_hit
// RPC). Replaces the per-instance in-memory maps used elsewhere — this works
// across PM2 forks and survives restarts.

export interface RateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
}

/**
 * Record a hit against `bucket` and report whether it's within `limit` per
 * `windowSeconds`. Fails OPEN (allows the request) if the limiter backend
 * errors — availability over strictness, and other layers still apply.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateResult> {
  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase.rpc("api_rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || !data[0]) {
      if (error) console.error("[api] rate_limit rpc error:", error.message);
      return { allowed: true, limit, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
    }
    const row = data[0] as { allowed: boolean; current_count: number; reset_at: string };
    const resetAt = new Date(row.reset_at).getTime();
    return {
      allowed: row.allowed,
      limit,
      remaining: Math.max(0, limit - row.current_count),
      resetAt,
    };
  } catch (e) {
    console.error("[api] rate_limit threw:", e);
    return { allowed: true, limit, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

/** First hop of x-forwarded-for, falling back to x-real-ip. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
