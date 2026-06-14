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
  // In production, fail closed — never trust client-controlled headers for OAuth redirect origin
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  }
  const proto =
    request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".boondit.site";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  let origin: string;
  try {
    origin = resolveOrigin(request);
  } catch {
    return NextResponse.redirect(new URL("/auth/signin?error=config", requestUrl.origin));
  }
  const cookieStore = await cookies();

  const success = NextResponse.redirect(new URL("/dashboard", origin));

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
                domain: COOKIE_DOMAIN,
              });
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/signin?error=${encodeURIComponent("auth_failed")}`, origin)
      );
    }
  }

  return success;
}
