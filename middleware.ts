import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { boho } from "@/lib/boho";

/**
 * Middleware handles two auth systems:
 * - /admin/* and /api/admin/* → bohoauth (password-based admin auth)
 * - /dashboard/* → Supabase SSR session (Discord OAuth)
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

  // Admin routes use bohoauth
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return boho.middleware(request);
  }

  // Dashboard routes use Supabase session
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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session — this updates the cookie if needed
  const { data: { user } } = await supabase.auth.getUser();

  // Protect /dashboard routes
  if (pathname.startsWith("/dashboard") && !user) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const redirectUrl = new URL("/auth/signin", `${proto}://${host}`);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/dashboard/:path*"],
};
