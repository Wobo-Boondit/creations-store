import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCreationScreenshots, addScreenshot, setMainScreenshot, deleteScreenshot, getCreationById } from "@/lib/data";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const creationId = params.id as string;
    const screenshots = await getCreationScreenshots(creationId);
    return NextResponse.json({ screenshots });
  } catch (error) {
    console.error("Error fetching screenshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch screenshots" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creationId = params.id as string;
    const body = await request.json();
    const { url, isMain } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Verify creation exists
    const creation = await getCreationById(creationId);
    if (!creation) {
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }

    // Check ownership
    if (creation.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const screenshot = await addScreenshot(creationId, url, isMain || false);

    return NextResponse.json({ success: true, screenshot });
  } catch (error) {
    console.error("Error adding screenshot:", error);
    return NextResponse.json(
      { error: "Failed to add screenshot" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creationId = params.id as string;
    const body = await request.json();
    const { screenshotId } = body;

    if (!screenshotId) {
      return NextResponse.json({ error: "Screenshot ID is required" }, { status: 400 });
    }

    // Verify ownership
    const creation = await getCreationById(creationId);
    if (!creation) {
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }

    if (creation.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await setMainScreenshot(screenshotId as string, creationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting main screenshot:", error);
    return NextResponse.json(
      { error: "Failed to set main screenshot" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creationId = params.id as string;
    const body = await request.json();
    const { screenshotId } = body;

    if (!screenshotId) {
      return NextResponse.json({ error: "Screenshot ID is required" }, { status: 400 });
    }

    // Verify ownership
    const creation = await getCreationById(creationId);
    if (!creation) {
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }

    if (creation.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteScreenshot(screenshotId as string);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting screenshot:", error);
    return NextResponse.json(
      { error: "Failed to delete screenshot" },
      { status: 500 }
    );
  }
}
