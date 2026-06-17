import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// DELETE /api/v1/keys/:keyId — revoke (deactivate) one of the user's keys.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { keyId } = await params;
  const supabase = createAdminClient();

  // Scope the update to the caller's own key so one user can't revoke another's.
  const { data, error } = await supabase
    .from("store_api_keys")
    .update({ is_active: false })
    .eq("key_id", keyId)
    .eq("user_id", user.id)
    .select("key_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
