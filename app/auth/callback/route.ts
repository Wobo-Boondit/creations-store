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
  const cookieStore = cookies();

  console.log("[callback] hit. code:", code ? "present" : "missing");
  console.log("[callback] cookies:", cookieStore.getAll().map(c => c.name).join(", "));

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
              console.log("[callback] SET cookie:", name, "len:", value.length);
              success.cookies.set(name, value, {
                ...options,
                domain: ".boondit.site",
              });
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.log("[callback] exchange ERROR:", error.message);
      return NextResponse.redirect(
        new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, origin)
      );
    }
    console.log("[callback] exchange OK, user:", data?.user?.email ?? "none");
  }

  return success;
}
