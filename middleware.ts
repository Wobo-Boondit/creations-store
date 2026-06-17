import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware handles Supabase session auth for:
 * - /admin/* → require logged-in session (admin check happens in page/route handlers via isAdmin())
 * - /api/admin/* → require logged-in session (same)
 * - /dashboard/* → require logged-in session
 */
export async function middleware(request: NextRequest) {
  // CVE-2025-29927: Reject middleware bypass attempts
  const middlewareSubrequest = request.headers.get("x-middleware-subrequest");
  if (middlewareSubrequest === "middleware-request") {
    const forwarded = request.headers.get("x-forwarded-host");
    const host = request.headers.get("host");
    if (forwarded && forwarded !== host) {
      return new NextResponse("Invalid request", { status: 400 });
    }
  }

  const { pathname } = request.nextUrl;

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              domain: ".boondit.site",
            });
          });
        },
      },
    }
  );

  // Refresh the session — this updates the cookie if needed
  const { data: { user } } = await supabase.auth.getUser();

  // Protect /dashboard, /admin, and /api/admin routes — all require a session.
  // /admin/login and /api/admin/login are exempt: they're redirect stubs to
  // /auth/signin that must work without a session.
  const isLoginRoute = pathname.endsWith("/login");
  if (
    !isLoginRoute &&
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/admin")) &&
    !user
  ) {
    // API routes get JSON 401, pages get redirected
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const redirectUrl = new URL("/auth/signin", `${proto}://${host}`);
    // Preserve the full path + query (e.g. /dashboard/new?prefill=...) so a
    // prefilled export survives the login round-trip.
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/dashboard/:path*"],
};
