import { NextResponse } from "next/server";

// Admin auth is now Supabase-based — logout goes through the normal signout flow
export async function POST() {
  return NextResponse.redirect(
    new URL("/auth/signout", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
  );
}
