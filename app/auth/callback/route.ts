import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function resolveOrigin(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* malformed env — fall through */
    }
  }
  const proto =
    request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = resolveOrigin(request);

  // Build the redirect response up front so we can attach Supabase
  // cookie writes to it. Using next/headers cookies().set() in a Route
  // Handler that returns NextResponse.redirect() will DROP the cookies —
  // the session never reaches the browser.
  const success = NextResponse.redirect(new URL("/dashboard", origin));
  const cookieStore = cookies();

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            for (const { name, value, options } of cookiesToSet) {
              success.cookies.set(name, value, {
                ...options,
                domain: ".boondit.site",
              });
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, origin)
      );
    }
  }

  return success;
}
