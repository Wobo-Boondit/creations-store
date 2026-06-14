import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: allCreations, error } = await supabase
      .from("store_creations")
      .select("*");
    if (error) throw error;
    return NextResponse.json(allCreations);
  } catch (error) {
    console.error("Error fetching creations:", error);
    return NextResponse.json(
      { error: "Failed to fetch creations" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Insert the new creation
    const { error } = await supabase.from("store_creations").insert({
      url: body.url,
      title: body.title,
      slug: body.slug,
      description: body.description || null,
      category_id: body.categoryId || null,
      overview: body.overview || null,
      favicon: body.favicon || null,
      screenshot: body.screenshot || null,
      og_image: body.ogImage || null,
      og_title: body.ogTitle || null,
      og_description: body.ogDescription || null,
      notes: body.notes || null,
      tags: body.tags || null,
      is_archived: body.isArchived || false,
      is_favorite: body.isFavorite || false,
      search_results: body.search_results || null,
      icon_url: body.iconUrl || null,
      theme_color: body.themeColor || null,
      author: body.author || null,
      screenshot_url: body.screenshotUrl || null,
    });

    if (error) throw error;

    return NextResponse.json(
      { message: "Creation created successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating creation:", error);
    return NextResponse.json(
      { error: "Failed to create creation" },
      { status: 500 },
    );
  }
}
