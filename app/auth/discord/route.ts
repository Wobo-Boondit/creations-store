import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".boondit.site";

// Only a same-site relative path is a valid post-login destination — guards
// against the redirect param being used as an open redirect.
function safeRedirect(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestUrl.origin;
  const cookieStore = await cookies();
  const postLoginRedirect = safeRedirect(requestUrl.searchParams.get("redirect"));

  // Capture cookies that the Supabase client wants to set
  // (specifically the PKCE code verifier)
  const pendingCookies: { name: string; value: string; options?: any }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: { name: string; value: string; options?: any }[]) {
          for (const c of toSet) {
            pendingCookies.push(c);
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.log("[AUTH_DEBUG] signInWithOAuth error:", error?.message);
    return NextResponse.redirect(
      new URL("/auth/signin?error=oauth_init_failed", origin)
    );
  }

  // Build the redirect response to Discord OAuth
  const response = NextResponse.redirect(data.url);

  // Set all captured cookies (PKCE code verifier) with proper attributes
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, {
      ...options,
      path: "/",
      domain: COOKIE_DOMAIN,
      secure: true,
      sameSite: "lax",
      httpOnly: false,
    });
  }

  // Stash the post-login destination so the callback can return the user to
  // their prefilled form. The OAuth redirectTo must stay /auth/callback, so we
  // can't pass it through the provider — a short-lived cookie carries it.
  if (postLoginRedirect) {
    response.cookies.set("boondit_post_login_redirect", postLoginRedirect, {
      path: "/",
      domain: COOKIE_DOMAIN,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      maxAge: 600, // 10 minutes — just long enough for the OAuth round-trip
    });
  }

  console.log("[AUTH_DEBUG] Redirecting to Discord, set cookies:",
    pendingCookies.map((c) => c.name));

  return response;
}
