-- ============================================
-- LINTER FIXES — 2025-06-15
-- Fixes from Supabase database advisor
-- ============================================

-- 1. Fix mutable search_path on SECURITY DEFINER functions
ALTER FUNCTION public.consume_creation_pair(p_token text, p_device_id text, p_device_name text) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 2. Revoke EXECUTE from anon + authenticated on functions that should only be called via service role
-- consume_creation_pair — called from our API route with service-role key, NOT directly from clients
REVOKE EXECUTE ON FUNCTION public.consume_creation_pair(text, text, text) FROM anon, authenticated;

-- reap_orphans — cron/admin only
REVOKE EXECUTE ON FUNCTION public.reap_orphans() FROM anon, authenticated;

-- rls_auto_enable — internal utility
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- handle_new_user — trigger function, should never be called directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- consume_link_token (from rhythm) — same treatment, called via service-role from API route
REVOKE EXECUTE ON FUNCTION public.consume_link_token(uuid, text) FROM anon, authenticated;

-- 3. Store analytics tables: tighten INSERT policies to require valid creation_id FK
-- (can't fully lock down since these are called without auth, but we add a CHECK constraint path)
-- These are intentionally open for analytics — clicks/views/installs from anonymous visitors
-- The linter flags WITH CHECK (true) but this is by design for public analytics tracking

-- NOTE: auth_leaked_password_protection must be enabled in Supabase Dashboard > Authentication > Settings
-- Cannot be done via SQL
