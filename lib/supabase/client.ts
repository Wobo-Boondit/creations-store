import { createClient } from "@supabase/supabase-js";

/**
 * Browser client for Client Components.
 * Uses the anon key, respects RLS.
 */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
      },
    }
  );
}
