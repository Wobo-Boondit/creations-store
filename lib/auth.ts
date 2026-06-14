import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatar: string | null;
  isAdmin: boolean;
};

// Admin Discord IDs from env (comma-separated), not hardcoded in source
const ADMIN_DISCORD_IDS = (process.env.ADMIN_DISCORD_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Get the current authenticated user from the Supabase session cookie.
 * Returns null if not logged in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch profile from public.users
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, username, avatar_url, is_suspended")
    .eq("id", user.id)
    .single();

  // Enforce suspension
  if (profile?.is_suspended) {
    return null;
  }

  // Determine display name from user metadata or profile
  const name =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    profile?.username ||
    user.email?.split("@")[0] ||
    "User";

  // Admin check: read Discord ID from identities[] (server-managed, NOT client-writable)
  // user_metadata.provider_id is client-writable via auth.updateUser() — never use it for authz
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const discordProviderId = discordIdentity?.identity_data?.provider_id as string | undefined;
  const isAdmin = !!discordProviderId && ADMIN_DISCORD_IDS.includes(discordProviderId);

  return {
    id: user.id,
    email: user.email!,
    name,
    username: profile?.username || null,
    avatar: profile?.avatar_url || (user.user_metadata?.avatar_url as string) || null,
    isAdmin,
  };
}

/**
 * Check if the current user is an admin.
 * Drop-in replacement for the old NextAuth-based isAdmin().
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.isAdmin === true;
}
