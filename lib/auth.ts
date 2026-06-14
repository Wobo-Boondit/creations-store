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

const ADMIN_DISCORD_ID = "592732401856282638";

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
    .select("id, username, avatar_url")
    .eq("id", user.id)
    .single();

  // Determine display name from user metadata or profile
  const name =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    profile?.username ||
    user.email?.split("@")[0] ||
    "User";

  // Admin check: Aidan's Discord ID in the provider identity
  const discordIdentity = user.app_metadata?.provider === "discord";
  const providerId = user.user_metadata?.provider_id as string;
  const emailMatch = user.email === "aidanpds@proton.me";
  const isAdmin = (discordIdentity && providerId === ADMIN_DISCORD_ID) || emailMatch;

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
