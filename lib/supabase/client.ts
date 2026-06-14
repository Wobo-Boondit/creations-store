import { createBrowserClient as createSSRClient } from "@supabase/ssr";

/**
 * Browser client for Client Components.
 * Uses the anon key, respects RLS.
 * Cookies scoped to .boondit.site for cross-subdomain auth with rhythm.
 */
export function createBrowserClient() {
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: ".boondit.site",
      },
    }
  );
}
