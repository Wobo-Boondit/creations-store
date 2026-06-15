-- ============================================
-- BOONDIT AUTH PLATFORM SCHEMA
-- Migration: 2025-06-15_platform_auth
-- ============================================

-- Registered creations (OAuth clients)
CREATE TABLE IF NOT EXISTS creation_clients (
  client_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  icon_url        TEXT,
  permissions     TEXT[] DEFAULT '{}',
  manifest_url    TEXT,
  is_first_party  BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'active',
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Per-user, per-creation device links
CREATE TABLE IF NOT EXISTS creation_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES creation_clients(client_id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  device_name     TEXT,
  linked_at       TIMESTAMPTZ DEFAULT now(),
  last_seen       TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  UNIQUE(user_id, client_id, device_id)
);

-- Pairing tokens (one-time, 15-min TTL)
CREATE TABLE IF NOT EXISTS creation_pairing_tokens (
  token           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES creation_clients(client_id) ON DELETE CASCADE,
  used            BOOLEAN DEFAULT false,
  device_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ DEFAULT (now() + interval '15 minutes')
);

-- API keys for OpenAI-compatible endpoint (one per R1)
CREATE TABLE IF NOT EXISTS api_keys (
  key_id          TEXT PRIMARY KEY,
  key_hash        TEXT NOT NULL UNIQUE,
  key_preview     TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  name            TEXT DEFAULT 'Default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_used       TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_creation_links_user ON creation_links(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pairing_tokens_expires ON creation_pairing_tokens(expires_at) WHERE used = false;

-- R1A conversation history
CREATE TABLE IF NOT EXISTS r1a_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_r1a_conv_device ON r1a_conversations(device_id, created_at DESC);

-- R1A device registry
CREATE TABLE IF NOT EXISTS r1a_devices (
  device_id       TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_secret   TEXT,
  user_agent      TEXT,
  last_seen       TIMESTAMPTZ,
  system_info     JSONB DEFAULT '{}',
  is_online       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE creation_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE creation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE creation_pairing_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE r1a_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE r1a_devices ENABLE ROW LEVEL SECURITY;

-- creation_clients: public read (list of available creations), no public write
DROP POLICY IF EXISTS "creation_clients_public_read" ON creation_clients;
CREATE POLICY "creation_clients_public_read" ON creation_clients FOR SELECT USING (true);

-- creation_links: users manage their own
DROP POLICY IF EXISTS "creation_links_owner_all" ON creation_links;
CREATE POLICY "creation_links_owner_all" ON creation_links FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- creation_pairing_tokens: users can create/read their own
DROP POLICY IF EXISTS "pairing_tokens_owner_all" ON creation_pairing_tokens;
CREATE POLICY "pairing_tokens_owner_all" ON creation_pairing_tokens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- api_keys: users manage their own
DROP POLICY IF EXISTS "api_keys_owner_all" ON api_keys;
CREATE POLICY "api_keys_owner_all" ON api_keys FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- r1a_conversations: users read their own
DROP POLICY IF EXISTS "r1a_conv_owner_read" ON r1a_conversations;
CREATE POLICY "r1a_conv_owner_read" ON r1a_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- r1a_devices: users manage their own
DROP POLICY IF EXISTS "r1a_devices_owner_all" ON r1a_devices;
CREATE POLICY "r1a_devices_owner_all" ON r1a_devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================
-- ATOMIC PAIRING CONSUME RPC
-- ============================================
CREATE OR REPLACE FUNCTION consume_creation_pair(
  p_token TEXT,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL
) RETURNS TABLE(user_id UUID, client_id TEXT, username TEXT, avatar_url TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tok RECORD;
  v_user RECORD;
BEGIN
  SELECT * INTO v_tok FROM creation_pairing_tokens
  WHERE token = p_token FOR UPDATE;

  IF NOT FOUND OR v_tok.used OR v_tok.expires_at < now() THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  UPDATE creation_pairing_tokens SET used = true, device_id = p_device_id WHERE token = p_token;

  SELECT u.id, u.username, u.avatar_url INTO v_user
  FROM users u WHERE u.id = v_tok.user_id;

  INSERT INTO creation_links (user_id, client_id, device_id, device_name)
  VALUES (v_tok.user_id, v_tok.client_id, p_device_id, COALESCE(p_device_name, p_device_id))
  ON CONFLICT (user_id, client_id, device_id) DO UPDATE
    SET is_active = true, last_seen = now();

  RETURN QUERY SELECT v_user.id, v_tok.client_id, v_user.username, v_user.avatar_url;
END $$;

-- ============================================
-- CLEANUP CRON: delete expired/used pairing tokens older than 1 hour
-- ============================================
SELECT cron.schedule(
  'cleanup-pairing-tokens',
  '*/15 * * * *',
  $$DELETE FROM creation_pairing_tokens WHERE expires_at < now() - interval '1 hour'$$
);

-- ============================================
-- SEED: first-party creations
-- ============================================
INSERT INTO creation_clients (client_id, name, description, icon_url, is_first_party, status, sort_order) VALUES
('rhythm', 'Rhythm', 'R1 rhythm game — play and create rhythms on your Rabbit R1', NULL, true, 'active', 1),
('r1a', 'R1 Anywhere', 'Control your R1 from anywhere via OpenAI-compatible API', NULL, true, 'active', 2)
ON CONFLICT (client_id) DO NOTHING;

-- ============================================
-- REALTIME: enable for creation_links (for link completion signaling)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE creation_links;
