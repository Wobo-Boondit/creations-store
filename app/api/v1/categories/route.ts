import { getAllCategories } from "@/lib/data";
import { guard, json, apiError, preflight } from "@/lib/api/respond";
import { serializeCategory } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// GET /api/v1/categories — public list of store categories.
export async function GET(req: Request) {
  const g = await guard(req, { mode: "read" });
  if ("error" in g) return g.error;
  const { rl } = g.ctx;

  try {
    const cats = await getAllCategories();
    return json({ data: cats.map(serializeCategory) }, { rl });
  } catch {
    return apiError("server_error", "Failed to list categories.", 500, rl);
  }
}
