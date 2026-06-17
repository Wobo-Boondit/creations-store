-- ============================================
-- Supabase linter hardening
-- 2025-06-17
-- Addresses pre-existing advisor WARNs (not introduced by the public API):
--  - function_search_path_mutable
--  - anon/authenticated_security_definer_function_executable
--  - rls_policy_always_true (analytics INSERT policies)
--
-- Safe because every one of these functions/tables is only ever touched by the
-- app's service-role client, which bypasses both EXECUTE grants and RLS.
-- Each statement is guarded so a missing object doesn't abort the migration.
-- ============================================

-- ── 1. Pin search_path on SECURITY DEFINER / trigger functions ──────
-- A mutable search_path lets a caller shadow built-ins; pin to a safe schema set.
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.reap_orphans()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.reap_orphans() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.consume_creation_pair(text, text, text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.consume_creation_pair(text, text, text) SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.consume_link_token(uuid, text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.consume_link_token(uuid, text) SET search_path = public, pg_temp';
  END IF;
END $$;

-- ── 2. Revoke public EXECUTE on SECURITY DEFINER functions ──────────
-- These are invoked server-side via the service-role client only; nothing
-- should be able to call them through PostgREST (/rest/v1/rpc/...).
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.reap_orphans()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reap_orphans() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.consume_creation_pair(text, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.consume_creation_pair(text, text, text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.consume_link_token(uuid, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.consume_link_token(uuid, text) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ── 3. Tighten always-true analytics INSERT policies ────────────────
-- store_views/clicks/installs are written exclusively by the service-role
-- client (lib/data.ts, lib/analytics.ts), which bypasses RLS — so a public
-- INSERT policy grants nothing useful and trips the advisor. Replace the
-- WITH CHECK (true) policies with deny-by-default.
DO $$
BEGIN
  IF to_regclass('public.store_views') IS NOT NULL THEN
    DROP POLICY IF EXISTS "store_views_insert" ON public.store_views;
    CREATE POLICY "store_views_no_client_insert" ON public.store_views
      FOR INSERT TO anon, authenticated WITH CHECK (false);
  END IF;
  IF to_regclass('public.store_clicks') IS NOT NULL THEN
    DROP POLICY IF EXISTS "store_clicks_insert" ON public.store_clicks;
    CREATE POLICY "store_clicks_no_client_insert" ON public.store_clicks
      FOR INSERT TO anon, authenticated WITH CHECK (false);
  END IF;
  IF to_regclass('public.store_installs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "store_installs_insert" ON public.store_installs;
    CREATE POLICY "store_installs_no_client_insert" ON public.store_installs
      FOR INSERT TO anon, authenticated WITH CHECK (false);
  END IF;
END $$;

-- ── Note (not SQL-fixable) ──────────────────────────────────────────
-- auth_leaked_password_protection: enable in Dashboard → Authentication →
-- Policies ("Leaked password protection"). N/A here since auth is Discord
-- OAuth only, but enabling it is harmless.
