import { NextResponse } from "next/server";

// Admin auth is now handled via Supabase session — this route is kept for backward compat
export async function GET() {
  return NextResponse.redirect(
    new URL("/auth/signin?redirect=/admin", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
  );
}
