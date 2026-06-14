import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin();
    if (!adminCheck) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = params;
    const body = await request.json();
    const { suspend } = body;

    if (typeof suspend !== "boolean") {
      return NextResponse.json(
        { error: "Invalid suspend value" },
        { status: 400 }
      );
    }

    // Update user suspension status
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("users")
      .update({ is_suspended: suspend })
      .eq("id", userId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: suspend ? "User suspended" : "User unsuspended",
    });
  } catch (error) {
    console.error("Error updating user suspension:", error);
    return NextResponse.json(
      { error: "Failed to update user suspension" },
      { status: 500 }
    );
  }
}
