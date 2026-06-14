import { createBrowserClient as createSSRClient } from "@supabase/ssr";

/**
 * Browser client for Client Components.
 * Uses the anon key, respects RLS.
 * No cookie domain override — the PKCE code verifier must stay on the
 * current subdomain so the callback can read it. Session cookies get
 * .boondit.site domain in the callback route instead.
 */
export function createBrowserClient() {
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
