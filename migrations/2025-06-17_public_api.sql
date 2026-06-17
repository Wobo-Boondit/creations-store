-- ============================================
-- Public Creations Store API
-- 2025-06-17
-- User-scoped API keys + durable rate limiting
-- ============================================

-- ── User-scoped API keys ──────────────────────────────────────────
-- Distinct from `api_keys` (which is R1A device-scoped). These authorize
-- programmatic access to a user's OWN store creations. Only the peppered
-- SHA-256 hash is stored; the plaintext (boondit_sk_...) is shown once.
CREATE TABLE IF NOT EXISTS store_api_keys (
  key_id      TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE,
  key_preview TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default',
  scopes      TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_store_api_keys_hash
  ON store_api_keys (key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_store_api_keys_user
  ON store_api_keys (user_id);

ALTER TABLE store_api_keys ENABLE ROW LEVEL SECURITY;
-- App uses the service-role client (bypasses RLS); this is defense-in-depth so
-- a leaked anon key can't read other users' key rows.
DROP POLICY IF EXISTS "store_api_keys_owner_all" ON store_api_keys;
CREATE POLICY "store_api_keys_owner_all" ON store_api_keys FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Durable rate limiting ─────────────────────────────────────────
-- Fixed-window counters keyed by an opaque bucket id (e.g. "key:<id>:<window>"
-- or "ip:<addr>:<window>"). Survives restarts and works across PM2 forks,
-- unlike the in-memory maps used by the R1A/admin routes.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket      TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  window_end  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window
  ON api_rate_limits (window_end);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No client access at all — only the service-role path touches this.
DROP POLICY IF EXISTS "api_rate_limits_no_access" ON api_rate_limits;
CREATE POLICY "api_rate_limits_no_access" ON api_rate_limits FOR ALL
  USING (false) WITH CHECK (false);

-- Atomic increment-and-check. Returns the new count and the window end so the
-- caller can set Retry-After / X-RateLimit-* headers. SECURITY DEFINER so it
-- runs as owner; EXECUTE is revoked from anon/authenticated below.
CREATE OR REPLACE FUNCTION api_rate_limit_hit(
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
) RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER;
  v_end TIMESTAMPTZ;
BEGIN
  INSERT INTO api_rate_limits (bucket, count, window_end)
    VALUES (p_bucket, 1, v_now + make_interval(secs => p_window_seconds))
  ON CONFLICT (bucket) DO UPDATE
    SET count = CASE
                  WHEN api_rate_limits.window_end < v_now THEN 1
                  ELSE api_rate_limits.count + 1
                END,
        window_end = CASE
                  WHEN api_rate_limits.window_end < v_now
                    THEN v_now + make_interval(secs => p_window_seconds)
                  ELSE api_rate_limits.window_end
                END
  RETURNING count, window_end INTO v_count, v_end;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_end;
END $$;

REVOKE ALL ON FUNCTION api_rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- ── Cleanup cron (pg_cron already in use for pairing-token cleanup) ──
SELECT cron.schedule(
  'cleanup-api-rate-limits',
  '*/10 * * * *',
  $$DELETE FROM api_rate_limits WHERE window_end < now() - interval '1 hour'$$
);
