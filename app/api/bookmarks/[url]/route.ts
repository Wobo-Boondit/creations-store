import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: { url: string } },
) {
  try {
    const decodedUrl = decodeURIComponent(params.url);
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("store_creations")
      .delete()
      .eq("url", decodedUrl);

    if (error) throw error;

    return NextResponse.json({ message: "Creation deleted successfully" });
  } catch (error) {
    console.error("Error deleting creation:", error);
    return NextResponse.json(
      { error: "Failed to delete creation" },
      { status: 500 },
    );
  }
}
