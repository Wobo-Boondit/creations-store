-- ============================================
-- FIX: Analytics tracking + proxy codes + schema fixes
-- 2025-06-16
-- ============================================

-- 1. Backfill proxy_code for all creations that don't have one
-- Uses a random 8-char alphanumeric code (safe charset, no 0/O/1/l/I)
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
  chars TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
BEGIN
  FOR rec IN SELECT id FROM store_creations WHERE proxy_code IS NULL LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    UPDATE store_creations SET proxy_code = new_code WHERE id = rec.id;
  END LOOP;
END $$;

-- 2. Add unique constraint on proxy_code now that all rows have values
-- (allows the /go/[code] lookup to be indexed efficiently)
CREATE UNIQUE INDEX IF NOT EXISTS store_creations_proxy_code_key
  ON store_creations (proxy_code);

-- 3. Ensure search_results column exists (it does on prod, but guard for fresh setups)
ALTER TABLE store_creations ADD COLUMN IF NOT EXISTS search_results text;

-- 4. Verify analytics tables have proper indexes for query performance
CREATE INDEX IF NOT EXISTS idx_store_clicks_creation_id ON store_clicks (creation_id);
CREATE INDEX IF NOT EXISTS idx_store_clicks_creation_clicked ON store_clicks (creation_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_store_installs_creation_id ON store_installs (creation_id);
CREATE INDEX IF NOT EXISTS idx_store_views_creation_id ON store_views (creation_id);
CREATE INDEX IF NOT EXISTS idx_store_daily_stats_creation_date ON store_daily_stats (creation_id, date);
