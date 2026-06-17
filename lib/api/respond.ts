import { NextResponse } from "next/server";
import { rateLimit, clientIp, type RateResult } from "@/lib/api/rate-limit";
import {
  verifyStoreApiKey,
  hasScope,
  type ApiScope,
  type VerifiedStoreKey,
} from "@/lib/api/keys";

// Shared plumbing for the public /api/v1 surface: CORS, JSON errors, durable
// rate limiting, and bearer-key auth/scope checks — so every route enforces
// the same abuse controls instead of re-implementing them.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withRateHeaders(headers: Record<string, string>, rl?: RateResult) {
  if (!rl) return headers;
  return {
    ...headers,
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
}

export function json(body: unknown, init?: { status?: number; rl?: RateResult }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: withRateHeaders({ ...CORS_HEADERS }, init?.rl),
  });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  rl?: RateResult,
) {
  return json({ error: { code, message } }, { status, rl });
}

/** Preflight handler — every route re-exports this as OPTIONS. */
export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Limits ────────────────────────────────────────────────────────
// Anonymous reads are limited per-IP; authenticated calls per-key (more
// generous). Writes are tighter to blunt spam/abuse.
const LIMITS = {
  anonReadPerMin: 60,
  keyReadPerMin: 240,
  keyWritePerMin: 20,
};

type Ctx = {
  key: VerifiedStoreKey | null;
  rl: RateResult;
  ip: string;
};

interface GuardOptions {
  /** "read" endpoints allow anonymous access; "write" requires a key + scope. */
  mode: "read" | "write";
}

/**
 * Authenticate + rate-limit a request. Returns either a ready-to-send error
 * response or a context with the verified key (if any) and rate result.
 */
export async function guard(
  req: Request,
  opts: GuardOptions,
): Promise<{ error: NextResponse } | { ctx: Ctx }> {
  const ip = clientIp(req);
  const key = await verifyStoreApiKey(req.headers.get("authorization"));
  const authHeaderPresent = !!req.headers.get("authorization");

  // A malformed/expired/unknown bearer token is an explicit 401 — don't
  // silently fall back to anonymous, which would mask key problems.
  if (authHeaderPresent && !key) {
    return {
      error: apiError("invalid_key", "API key is missing, invalid, or expired.", 401),
    };
  }

  if (opts.mode === "write") {
    if (!key) {
      return {
        error: apiError("auth_required", "This endpoint requires an API key with the 'write' scope.", 401),
      };
    }
    if (!hasScope(key, "write")) {
      return {
        error: apiError("forbidden", "API key lacks the 'write' scope.", 403),
      };
    }
    const rl = await rateLimit(`key:${key.keyId}:write`, LIMITS.keyWritePerMin, 60);
    if (!rl.allowed) return { error: rateLimited(rl) };
    return { ctx: { key, rl, ip } };
  }

  // read mode
  if (key) {
    const rl = await rateLimit(`key:${key.keyId}:read`, LIMITS.keyReadPerMin, 60);
    if (!rl.allowed) return { error: rateLimited(rl) };
    return { ctx: { key, rl, ip } };
  }
  const rl = await rateLimit(`ip:${ip}:read`, LIMITS.anonReadPerMin, 60);
  if (!rl.allowed) return { error: rateLimited(rl) };
  return { ctx: { key: null, rl, ip } };
}

function rateLimited(rl: RateResult) {
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  const res = apiError("rate_limited", "Too many requests. Slow down.", 429, rl);
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

export type { Ctx, VerifiedStoreKey, ApiScope };
