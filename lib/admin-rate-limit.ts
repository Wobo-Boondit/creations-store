// Simple in-memory rate limiter for admin login brute-force protection.
// Single-instance (PM2 fork mode), so in-memory is sufficient.

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 minute window
const MAX_ATTEMPTS = 5; // 5 attempts per minute

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  // Reset expired entries
  if (entry && now > entry.resetAt) {
    attempts.delete(ip);
  }

  const current = attempts.get(ip);

  if (!current) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  current.count++;

  if (current.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}

// Clean up stale entries periodically to prevent memory growth
setInterval(() => {
  const now = Date.now();
  attempts.forEach((entry, ip) => {
    if (now > entry.resetAt) attempts.delete(ip);
  });
}, 5 * 60_000); // every 5 minutes
