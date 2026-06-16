import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".boondit.site";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestUrl.origin;
  const cookieStore = await cookies();

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

  console.log("[AUTH_DEBUG] Redirecting to Discord, set cookies:", 
    pendingCookies.map((c) => c.name));

  return response;
}
